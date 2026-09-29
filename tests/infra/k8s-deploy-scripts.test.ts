import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// k8s/deploy.sh and k8s/seed.sh, run against fake kubectl, docker, curl and
// sleep on the PATH. Nothing reaches a real cluster or the Docker daemon.
const K8S = path.join(process.cwd(), "k8s");

// Logs every call. `kustomize` prints the real app manifest (standing in for the
// rendered kustomization), `apply -f -` stores what it is given, and each
// command can be made to fail through FAIL_<name>.
const FAKE_KUBECTL = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/kubectl.log"
args="$*"
case "$args" in
  *"get nodes -o jsonpath"*) printf 'desktop-control-plane' ;;
  *"get nodes"*) exit "\${FAIL_NODES:-0}" ;;
  *"get ingressclass nginx"*) exit "\${FAIL_INGRESS:-0}" ;;
  *"kustomize k8s"*) cat k8s/app.yaml ;;
  *"apply -f -"*) cat > "$FAKE_DIR/applied.yaml" ;;
  *"rollout status deployment/"*) exit "\${FAIL_ROLLOUT:-0}" ;;
  *"get deployment dinner-planner -o jsonpath"*) printf '%s' "\${DEPLOYED_IMAGE-dinner-planner-migrator:20260928101500}" ;;
  *"wait --for=condition=complete"*) exit "\${FAIL_WAIT:-0}" ;;
  *"logs "*) echo "LOGS: $args" ;;
esac
exit 0
`;
// docker save prints the image name, docker exec stores what is piped into the node.
const FAKE_DOCKER = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/docker.log"
case "$1" in
  save) echo "IMAGE $2" ;;
  exec) cat >> "$FAKE_DIR/imported" ;;
esac
`;
const FAKE_CURL = '#!/bin/bash\necho "$*" >> "$FAKE_DIR/curl.log"\nexit "${FAIL_CURL:-0}"\n';
const FAKE_SLEEP = "#!/bin/bash\nexit 0\n";

let dir: string;

function writeExecutable(file: string, content: string) {
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

function run(script: string, env: Record<string, string> = {}) {
  return spawnSync("bash", [path.join(K8S, script)], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, FAKE_DIR: dir, ...env },
  });
}

function log(name: string): string {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "k8s-scripts-"));
  fs.mkdirSync(path.join(dir, "bin"));
  writeExecutable(path.join(dir, "bin", "kubectl"), FAKE_KUBECTL);
  writeExecutable(path.join(dir, "bin", "docker"), FAKE_DOCKER);
  writeExecutable(path.join(dir, "bin", "curl"), FAKE_CURL);
  writeExecutable(path.join(dir, "bin", "sleep"), FAKE_SLEEP);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("deploy.sh", () => {
  it("builds both targets under one fresh timestamp tag and imports them into the node", () => {
    const result = run("deploy.sh");

    expect(result.status).toBe(0);
    const builds = log("docker.log").match(/^build --target (\w+) --tag (\S+) \.$/gm) ?? [];
    expect(builds).toHaveLength(2);
    const [, appTag] = /--target app --tag dinner-planner:(\d{14}) /.exec(log("docker.log"))!;
    expect(log("docker.log")).toContain(`build --target migrator --tag dinner-planner-migrator:${appTag} .`);
    expect(log("docker.log")).toContain("exec -i desktop-control-plane ctr --namespace k8s.io images import -");
    expect(log("imported")).toBe(`IMAGE dinner-planner:${appTag}\nIMAGE dinner-planner-migrator:${appTag}\n`);
  });

  it("applies the manifests with the new tag on both the app and the migrator", () => {
    run("deploy.sh");

    const tag = /dinner-planner:(\d{14})/.exec(log("docker.log"))![1];
    const applied = log("applied.yaml");
    expect(applied).toContain(`image: dinner-planner-migrator:${tag}`);
    expect(applied).toContain(`image: dinner-planner:${tag}`);
    // The migrator's repository name contains the app's; the order of the
    // substitutions keeps it from being rewritten twice.
    expect(applied).not.toContain(":dev");
    expect(applied).not.toMatch(/dinner-planner:\d{14}-migrator/);
  });

  it("waits for Postgres and the app, then reports the address once the ingress answers", () => {
    const result = run("deploy.sh");

    expect(log("kubectl.log")).toContain("-n dinner-planner rollout status statefulset/dinner-planner-db");
    expect(log("kubectl.log")).toContain("-n dinner-planner rollout status deployment/dinner-planner");
    expect(log("curl.log")).toContain("-H Host: dinner.local http://127.0.0.1/");
    expect(result.stdout).toContain("Open http://dinner.local");
  });

  it("stops before building when the cluster is not reachable", () => {
    const result = run("deploy.sh", { FAIL_NODES: "1" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("The 'docker-desktop' cluster is not reachable");
    expect(log("docker.log")).toBe("");
  });

  it("only prints the install command when the ingress controller is missing, never installs it", () => {
    const result = run("deploy.sh", { FAIL_INGRESS: "1" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("kubectl --context docker-desktop apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/");
    expect(log("kubectl.log")).not.toContain("apply");
    expect(log("docker.log")).toBe("");
  });

  it("shows the events and the migration log when the rollout fails", () => {
    const result = run("deploy.sh", { FAIL_ROLLOUT: "1" });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Rollout failed");
    expect(log("kubectl.log")).toContain("-n dinner-planner get events --sort-by=.lastTimestamp");
    expect(log("kubectl.log")).toContain("-n dinner-planner logs deployment/dinner-planner -c migrate --tail=40");
    expect(log("curl.log")).toBe("");
  });

  it("fails with a hint when the ingress never answers", () => {
    const result = run("deploy.sh", { FAIL_CURL: "7" });

    expect(result.status).not.toBe(0);
    expect(log("curl.log").trim().split("\n")).toHaveLength(30);
    expect(result.stderr).toContain("did not answer through the ingress");
  });
});

describe("seed.sh", () => {
  it("replaces the seed Job and runs it with the image the app is running", () => {
    const result = run("seed.sh");

    expect(result.status).toBe(0);
    const calls = log("kubectl.log");
    expect(calls).toContain(
      "--context docker-desktop -n dinner-planner get deployment dinner-planner -o jsonpath={.spec.template.spec.initContainers[?(@.name==\"migrate\")].image}",
    );
    expect(calls.indexOf("delete job dinner-planner-seed --ignore-not-found")).toBeLessThan(calls.indexOf("apply -f -"));
    expect(log("applied.yaml")).toContain("image: dinner-planner-migrator:20260928101500");
    expect(log("applied.yaml")).not.toContain(":dev");
    expect(result.stdout).toContain("LOGS: --context docker-desktop -n dinner-planner logs job/dinner-planner-seed");
  });

  it("stops without touching the Job when the app is not deployed", () => {
    const result = run("seed.sh", { DEPLOYED_IMAGE: "" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Run 'npm run k8s:deploy' first");
    expect(log("kubectl.log")).not.toContain("delete job");
    expect(log("kubectl.log")).not.toContain("apply");
  });

  it("shows the Job's logs when seeding fails", () => {
    const result = run("seed.sh", { FAIL_WAIT: "1" });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Seeding failed");
    expect(log("kubectl.log")).toContain("logs job/dinner-planner-seed --tail=30");
  });
});
