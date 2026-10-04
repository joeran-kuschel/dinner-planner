import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// k8s/rotate-db-password.sh, run against a fake kubectl on the PATH. Nothing reaches a real cluster.
const K8S = path.join(process.cwd(), "k8s");
const OLD_PASSWORD = "00000000000000000000000000000000000000000000beef";
const COMPLETE_DUMP = "-- PostgreSQL database dump\n-- PostgreSQL database dump complete\n";

// Logs its arguments. `get secret` answers from the old Secret, the pod's pg_dump prints a dump, psql stores its
// stdin (and can be made to fail), and `apply -f -` stores every manifest it is given.
const FAKE_KUBECTL = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/kubectl.log"
args="$*"
case "$args" in
  *"get secret dinner-planner-db"*POSTGRES_USER*) printf 'dinner' ;;
  *"get secret dinner-planner-db"*POSTGRES_DB*) printf 'dinner_planner' ;;
  *"get secret dinner-planner-db"*POSTGRES_PASSWORD*) printf '%s' "$OLD_PASSWORD" ;;
  *"apply -f -"*) tee -a "$FAKE_DIR/applied-all.yaml" > /dev/null; echo "--- applied" >> "$FAKE_DIR/applied-all.yaml" ;;
  *"exec -i"*"pg_dump"*) cat "$FAKE_DUMP" ;;
  *"exec -i"*"psql"*) cat > "$FAKE_DIR/psql-stdin"; exit "\${FAIL_PSQL:-0}" ;;
esac
exit 0
`;

let dir: string;

function run(env: Record<string, string> = {}) {
  return spawnSync("bash", [path.join(K8S, "rotate-db-password.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      HOME: dir,
      FAKE_DIR: dir,
      FAKE_DUMP: path.join(dir, "dump.sql"),
      BACKUP_DIR: path.join(dir, "backups"),
      OLD_PASSWORD,
      ...env,
    },
  });
}

function read(name: string): string {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

/** The passwords of the Secrets that were applied, in order. */
const appliedPasswords = () => [...read("applied-all.yaml").matchAll(/POSTGRES_PASSWORD: (\w+)/g)].map((match) => match[1]);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-rotate-"));
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(path.join(dir, "bin", "kubectl"), FAKE_KUBECTL);
  fs.chmodSync(path.join(dir, "bin", "kubectl"), 0o755);
  fs.writeFileSync(path.join(dir, "dump.sql"), COMPLETE_DUMP);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("rotate-db-password.sh", () => {
  it("backs up first, then sets the new password in the Secret and in Postgres, then restarts both", () => {
    const result = run();

    expect(result.status).toBe(0);
    const calls = read("kubectl.log");
    const at = (needle: string) => calls.indexOf(needle);
    expect(at("pg_dump")).toBeGreaterThan(-1);
    expect(at("apply -f -")).toBeGreaterThan(at("pg_dump"));
    expect(at("psql")).toBeGreaterThan(at("apply -f -"));
    expect(at("rollout restart statefulset/dinner-planner-db deployment/dinner-planner")).toBeGreaterThan(at("psql"));
    expect(at("rollout status deployment/dinner-planner")).toBeGreaterThan(at("rollout restart"));
    expect(fs.readdirSync(path.join(dir, "backups")).filter((file) => file.endsWith(".sql.gz"))).toHaveLength(1);

    const [password] = appliedPasswords();
    expect(password).toMatch(/^[0-9a-f]{48}$/);
    expect(password).not.toBe(OLD_PASSWORD);
    expect(read("applied-all.yaml")).toContain(`DATABASE_URL: postgresql://dinner:${password}@dinner-planner-db:5432/dinner_planner`);
    expect(read("psql-stdin")).toBe(`ALTER ROLE :"dbuser" WITH PASSWORD '${password}';\n`);
  });

  it("never puts a password into a command line or the output", () => {
    const result = run();

    const [password] = appliedPasswords();
    for (const secret of [password, OLD_PASSWORD]) {
      expect(read("kubectl.log")).not.toContain(secret);
      expect(result.stdout + result.stderr).not.toContain(secret);
    }
  });

  it("puts the old Secret back and restarts nothing when Postgres refuses the new password", () => {
    const result = run({ FAIL_PSQL: "1" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("The old Secret is back");
    const [, restored] = appliedPasswords();
    expect(restored).toBe(OLD_PASSWORD);
    expect(read("kubectl.log")).not.toContain("rollout");
  });

  it("changes nothing when the backup is incomplete", () => {
    fs.writeFileSync(path.join(dir, "dump.sql"), "-- PostgreSQL database dump\n");

    const result = run();

    expect(result.status).not.toBe(0);
    expect(read("kubectl.log")).not.toContain("apply");
    expect(read("kubectl.log")).not.toContain("psql");
  });

  it("only talks to docker-desktop", () => {
    run();

    for (const line of read("kubectl.log").trim().split("\n")) expect(line).toMatch(/^--context docker-desktop /);
  });
});
