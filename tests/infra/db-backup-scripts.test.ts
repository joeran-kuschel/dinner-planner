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

  describe("retention", () => {
    const HOUR = 3_600_000;
    const pad = (n: number) => String(n).padStart(2, "0");
    /** The name of a dump made `hours` ago, in the local time the script's `date` uses. */
    const dumpAgo = (hours: number) => {
      const t = new Date(Date.now() - hours * HOUR);
      const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
      return `dinner_planner-${stamp}.sql.gz`;
    };
    /** The name of a dump made at a clock time on the day `daysAgo` days back, so several land on one calendar day. */
    const dumpOn = (daysAgo: number, hour: number, minute = 0) => {
      const t = new Date();
      t.setDate(t.getDate() - daysAgo);
      t.setHours(hour, minute, 0, 0);
      const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}00`;
      return `dinner_planner-${stamp}.sql.gz`;
    };
    const put = (...names: string[]) => {
      fs.mkdirSync(backupDir, { recursive: true });
      for (const name of names) fs.writeFileSync(path.join(backupDir, name), "old");
      return names;
    };
    /** Put old dumps in the backup folder; returns their names in the order given. */
    const seed = (...hoursAgo: number[]) => {
      fs.mkdirSync(backupDir, { recursive: true });
      return hoursAgo.map((hours) => {
        const name = dumpAgo(hours);
        fs.writeFileSync(path.join(backupDir, name), "old");
        return name;
      });
    };
    const kept = (...names: string[]) => names.every((name) => backups().includes(name));
    const gone = (...names: string[]) => names.every((name) => !backups().includes(name));

    it("keeps every dump of the last day, even several from one calendar day", () => {
      const names = seed(1, 2, 3, 5, 8, 12, 20);
      expect(run("backup-db.sh").status).toBe(0);
      expect(kept(...names)).toBe(true);
    });

    it("keeps only the newest dump of each older day", () => {
      const [morning, noon, evening] = put(dumpOn(3, 8), dumpOn(3, 12), dumpOn(3, 20));
      const [otherDay] = put(dumpOn(4, 9));

      expect(run("backup-db.sh").status).toBe(0);
      expect(kept(evening, otherDay)).toBe(true);
      expect(gone(morning, noon)).toBe(true);
    });

    it("keeps one dump for each of the last 30 days, and nothing older", () => {
      const days = [2, 5, 10, 20, 29].map((day) => day * 24 + 12);
      const daily = seed(...days);
      const [tooOld, muchTooOld] = seed(31 * 24 + 6, 90 * 24);

      expect(run("backup-db.sh").status).toBe(0);
      expect(kept(...daily)).toBe(true);
      expect(gone(tooOld, muchTooOld)).toBe(true);
    });

    it("keeps at most a day's worth of hourly dumps plus one per older day", () => {
      const hourly = Array.from({ length: 24 * 8 }, (_, i) => i + 1); // a week of hourly dumps, and more
      seed(...hourly);

      expect(run("backup-db.sh").status).toBe(0);
      // 24 hourly, at most one per day for the days before, and the new dump.
      expect(backups().length).toBeLessThanOrEqual(24 + 8 + 1);
      expect(backups().length).toBeGreaterThanOrEqual(24 + 1);
    });

    it("follows BACKUP_KEEP_HOURLY_HOURS and BACKUP_KEEP_DAILY_DAYS", () => {
      // Yesterday is older than a one-hour window whatever the time of day, so only the daily rule applies.
      const [yesterdayMorning, yesterdayEvening] = put(dumpOn(1, 8), dumpOn(1, 18));
      const [fourDaysAgo, sixDaysAgo] = put(dumpOn(4, 12), dumpOn(6, 12));

      const result = run("backup-db.sh", [], { env: { BACKUP_KEEP_HOURLY_HOURS: "1", BACKUP_KEEP_DAILY_DAYS: "5" } });

      expect(result.status).toBe(0);
      expect(kept(yesterdayEvening, fourDaysAgo)).toBe(true);
      expect(gone(yesterdayMorning, sixDaysAgo)).toBe(true);
    });

    it("keeps a longer daily history when BACKUP_KEEP_DAILY_DAYS is raised", () => {
      const [old] = put(dumpOn(60, 12));

      expect(run("backup-db.sh", [], { env: { BACKUP_KEEP_DAILY_DAYS: "90" } }).status).toBe(0);
      expect(kept(old)).toBe(true);
      expect(run("backup-db.sh", [], { env: { BACKUP_KEEP_DAILY_DAYS: "30" } }).status).toBe(0);
      expect(gone(old)).toBe(true);
    });

    it("never removes the dump it has just written", () => {
      seed(400 * 24);
      expect(run("backup-db.sh").status).toBe(0);
      expect(backups()).toHaveLength(1);
      expect(zlib.gunzipSync(fs.readFileSync(path.join(backupDir, backups()[0]))).toString()).toBe(COMPLETE_DUMP);
    });

    it("leaves other files in the folder alone", () => {
      seed(400 * 24);
      fs.writeFileSync(path.join(backupDir, "backup.log"), "log");
      fs.writeFileSync(path.join(backupDir, "notes.txt"), "mine");
      fs.writeFileSync(path.join(backupDir, "dinner_planner-20200101-000000.sql.gz.partial"), "half");

      expect(run("backup-db.sh").status).toBe(0);
      expect(fs.readdirSync(backupDir)).toEqual(
        expect.arrayContaining(["backup.log", "notes.txt", "dinner_planner-20200101-000000.sql.gz.partial"]),
      );
    });

    it("keeps everything when the dump is incomplete, the old dumps included", () => {
      const names = seed(400 * 24, 100 * 24);
      fs.writeFileSync(path.join(dir, "dump.sql"), '-- PostgreSQL database dump\nCREATE TABLE');

      expect(run("backup-db.sh").status).not.toBe(0);
      expect(kept(...names)).toBe(true);
    });
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
