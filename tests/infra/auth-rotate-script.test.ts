import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// k8s/rotate-auth-password.sh, run against a fake kubectl on the PATH. Nothing reaches a real cluster.
const K8S = path.join(process.cwd(), "k8s");

// Logs its arguments. `get secret` says the login Secret exists unless SECRET_EXIT is set, `apply -f -` stores
// every manifest it is given.
const FAKE_KUBECTL = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/kubectl.log"
case "$*" in
  *"get secret dinner-planner-auth"*) exit "\${SECRET_EXIT:-0}" ;;
  *"apply -f -"*) tee -a "$FAKE_DIR/applied-all.yaml" > /dev/null ;;
esac
exit 0
`;

let dir: string;

function run(env: Record<string, string> = {}) {
  return spawnSync("bash", [path.join(K8S, "rotate-auth-password.sh")], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, FAKE_DIR: dir, ...env },
  });
}

function read(name: string): string {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-rotate-"));
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(path.join(dir, "bin", "kubectl"), FAKE_KUBECTL);
  fs.chmodSync(path.join(dir, "bin", "kubectl"), 0o755);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("rotate-auth-password.sh", () => {
  it("replaces the login Secret with a new random password and prints it once", () => {
    const result = run();

    expect(result.status).toBe(0);
    const password = /password: (\w+)/.exec(result.stdout)![1];
    expect(password).toMatch(/^[0-9a-f]{24}$/);
    expect(result.stdout).toContain("user:     dinner");
    expect(read("applied-all.yaml")).toMatch(/name: dinner-planner-auth\n[\s\S]*auth: "dinner:\$apr1\$/);
  });

  it("never puts the password into a command line, the Secret or the error output", () => {
    const result = run();

    const password = /password: (\w+)/.exec(result.stdout)![1];
    expect(read("kubectl.log")).not.toContain(password);
    expect(read("applied-all.yaml")).not.toContain(password);
    expect(result.stderr).not.toContain(password);
  });

  it("gives every run its own password", () => {
    const first = /password: (\w+)/.exec(run().stdout)![1];
    const second = /password: (\w+)/.exec(run().stdout)![1];

    expect(second).not.toBe(first);
  });

  it("changes nothing and points at the deploy when there is no login Secret yet", () => {
    const result = run({ SECRET_EXIT: "1" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("npm run k8s:deploy");
    expect(read("kubectl.log")).not.toContain("apply");
  });

  it("only talks to docker-desktop", () => {
    run();

    for (const line of read("kubectl.log").trim().split("\n")) expect(line).toMatch(/^--context docker-desktop /);
  });
});
