import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The backup scripts in k8s/, run against a fake kubectl and launchctl on the PATH.
const K8S = path.join(process.cwd(), "k8s");
const COMPLETE_DUMP = '-- PostgreSQL database dump\nCREATE TABLE "Recipe" ();\n-- PostgreSQL database dump complete\n';

// Logs its arguments, prints $FAKE_DUMP for pg_dump and stores stdin for psql.
const FAKE_KUBECTL = `#!/bin/bash
echo "$@" >> "$FAKE_DIR/kubectl.log"
case "\${@: -1}" in
  pg_dump*) cat "$FAKE_DUMP" ;;
  psql*) cat > "$FAKE_DIR/psql-stdin" ;;
esac
exit "\${FAKE_EXIT:-0}"
`;
const FAKE_LAUNCHCTL = '#!/bin/bash\necho "$@" >> "$FAKE_DIR/launchctl.log"\n';

let dir: string;
let backupDir: string;

function writeExecutable(file: string, content: string) {
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

function run(script: string, args: string[] = [], { env = {}, input = "" } = {}) {
  return spawnSync("bash", [path.join(K8S, script), ...args], {
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      HOME: dir,
      FAKE_DIR: dir,
      FAKE_DUMP: path.join(dir, "dump.sql"),
      BACKUP_DIR: backupDir,
      ...env,
    },
  });
}

const backups = () => fs.readdirSync(backupDir).filter((file) => file.endsWith(".sql.gz")).sort();

function kubectlCalls(): string {
  const log = path.join(dir, "kubectl.log");
  return fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-scripts-"));
  backupDir = path.join(dir, "backups");
  fs.mkdirSync(path.join(dir, "bin"));
  writeExecutable(path.join(dir, "bin", "kubectl"), FAKE_KUBECTL);
  writeExecutable(path.join(dir, "bin", "launchctl"), FAKE_LAUNCHCTL);
  fs.writeFileSync(path.join(dir, "dump.sql"), COMPLETE_DUMP);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("backup-db.sh", () => {
  it("writes a compressed dump taken inside the Postgres pod of docker-desktop", () => {
    const result = run("backup-db.sh");

    expect(result.status).toBe(0);
    expect(backups()).toHaveLength(1);
    expect(backups()[0]).toMatch(/^dinner_planner-\d{8}-\d{6}\.sql\.gz$/);
    const content = zlib.gunzipSync(fs.readFileSync(path.join(backupDir, backups()[0]))).toString();
    expect(content).toBe(COMPLETE_DUMP);
    expect(kubectlCalls()).toContain("--context docker-desktop -n dinner-planner exec -i statefulset/dinner-planner-db");
    expect(kubectlCalls()).toContain('pg_dump --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"');
  });

  it("writes to ~/DinnerPlannerBackups when BACKUP_DIR is not set", () => {
    const result = run("backup-db.sh", [], { env: { BACKUP_DIR: undefined } });

    expect(result.status).toBe(0);
    expect(fs.readdirSync(path.join(dir, "DinnerPlannerBackups"))).toEqual([
      expect.stringMatching(/^dinner_planner-\d{8}-\d{6}\.sql\.gz$/),
    ]);
  });

  it("keeps previous backups and writes nothing when the dump is incomplete", () => {
    fs.mkdirSync(backupDir);
    fs.writeFileSync(path.join(backupDir, "dinner_planner-20260920-100000.sql.gz"), "old");
    fs.writeFileSync(path.join(dir, "dump.sql"), '-- PostgreSQL database dump\nCREATE TABLE');

    const result = run("backup-db.sh");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Backup incomplete");
    expect(fs.readdirSync(backupDir)).toEqual(["dinner_planner-20260920-100000.sql.gz"]);
  });

  it("fails without writing a backup when the cluster is not reachable", () => {
    const result = run("backup-db.sh", [], { env: { FAKE_EXIT: "1" } });

    expect(result.status).not.toBe(0);
    expect(backups()).toEqual([]);
  });

  it("keeps only the newest BACKUP_KEEP dumps", () => {
    fs.mkdirSync(backupDir);
    ["20260918-100000", "20260919-100000", "20260920-100000"].forEach((stamp, i) => {
      const file = path.join(backupDir, `dinner_planner-${stamp}.sql.gz`);
      fs.writeFileSync(file, "old");
      const time = new Date(Date.UTC(2026, 8, 18 + i, 10));
      fs.utimesSync(file, time, time);
    });

    const result = run("backup-db.sh", [], { env: { BACKUP_KEEP: "2" } });

    expect(result.status).toBe(0);
    expect(backups()).toHaveLength(2);
    expect(backups()).toContain("dinner_planner-20260920-100000.sql.gz");
    expect(backups()).not.toContain("dinner_planner-20260919-100000.sql.gz");
  });
});

describe("restore-db.sh", () => {
  let backupFile: string;

  beforeEach(() => {
    fs.mkdirSync(backupDir);
    backupFile = path.join(backupDir, "dinner_planner-20260921-100000.sql.gz");
    fs.writeFileSync(backupFile, zlib.gzipSync(COMPLETE_DUMP));
  });

  it("feeds the decompressed dump to psql in the Postgres pod, in one transaction", () => {
    const result = run("restore-db.sh", [backupFile, "--yes"]);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(dir, "psql-stdin"), "utf8")).toBe(COMPLETE_DUMP);
    expect(kubectlCalls()).toContain("psql -v ON_ERROR_STOP=1 --single-transaction");
  });

  it("restores after typing the confirmation word", () => {
    const result = run("restore-db.sh", [backupFile], { input: "restore\n" });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(dir, "psql-stdin"))).toBe(true);
  });

  it("aborts without touching the database when not confirmed", () => {
    const result = run("restore-db.sh", [backupFile], { input: "yes\n" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Aborted");
    expect(kubectlCalls()).toBe("");
  });

  it("shows the usage for a missing backup file", () => {
    const result = run("restore-db.sh", [path.join(backupDir, "missing.sql.gz"), "--yes"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Usage:");
    expect(kubectlCalls()).toBe("");
  });
});

describe("install-backup-job.sh", () => {
  const plist = () => path.join(dir, "Library", "LaunchAgents", "com.dinnerplanner.db-backup.plist");

  it("installs an hourly launchd job that runs backup-db.sh", () => {
    const result = run("install-backup-job.sh");

    expect(result.status).toBe(0);
    const content = fs.readFileSync(plist(), "utf8");
    expect(content).toContain(`<string>${path.join(K8S, "backup-db.sh")}</string>`);
    expect(content).toContain("<key>StartInterval</key><integer>3600</integer>");
    expect(content).toContain(`<key>BACKUP_DIR</key><string>${backupDir}</string>`);
    expect(content).toContain("<key>KUBE_CONTEXT</key><string>docker-desktop</string>");
    expect(fs.readFileSync(path.join(dir, "launchctl.log"), "utf8")).toContain(
      `bootstrap gui/${process.getuid!()} ${plist()}`,
    );
  });

  it.runIf(process.platform === "darwin")("writes a valid property list", () => {
    run("install-backup-job.sh");
    expect(spawnSync("plutil", ["-lint", plist()]).status).toBe(0);
  });

  it("removes the job but keeps the backups on --uninstall", () => {
    run("install-backup-job.sh");
    fs.writeFileSync(path.join(backupDir, "dinner_planner-20260921-100000.sql.gz"), "kept");

    const result = run("install-backup-job.sh", ["--uninstall"]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(plist())).toBe(false);
    expect(backups()).toEqual(["dinner_planner-20260921-100000.sql.gz"]);
  });
});
