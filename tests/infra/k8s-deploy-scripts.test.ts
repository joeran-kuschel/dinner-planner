import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// k8s/deploy.sh and k8s/seed.sh, run against fake kubectl, docker, curl and
// sleep on the PATH. Nothing reaches a real cluster or the Docker daemon.
const K8S = path.join(process.cwd(), "k8s");

// Logs every call. `kustomize` prints the real app manifest (standing in for the
// rendered kustomization), `apply -f -` stores what it is given (the last one in
// applied.yaml, all of them in applied-all.yaml), `get secret` says the database Secret
// does not exist unless SECRET_EXIT=0, and each command can be made to fail through FAIL_<name>.
const FAKE_KUBECTL = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/kubectl.log"
echo "kubectl $*" >> "$FAKE_DIR/calls.log"
args="$*"
case "$args" in
  *"get nodes -o jsonpath"*) printf 'desktop-control-plane' ;;
  *"get nodes"*) exit "\${FAIL_NODES:-0}" ;;
  *"get ingressclass nginx"*) exit "\${FAIL_INGRESS:-0}" ;;
  *"kustomize k8s"*) cat k8s/app.yaml ;;
  *"get secret dinner-planner-db"*) exit "\${SECRET_EXIT:-1}" ;;
  *"get secret dinner-planner-tls"*) exit "\${TLS_SECRET_EXIT:-1}" ;;
  *"get secret dinner-planner-access -o"*) printf '%s' "\${FAKE_ACCESS_KEY:-the-current-access-key-0123456789}" ;;
  *"get secret dinner-planner-access"*) exit "\${ACCESS_SECRET_EXIT:-1}" ;;
  *"create secret tls"*)
    while [ $# -gt 0 ]; do
      case "$1" in --cert) cert="$2" ;; --key) key="$2" ;; esac
      shift
    done
    printf 'kind: Secret\ntype: kubernetes.io/tls\ndata:\n  tls.crt: %s\n  tls.key: %s\n' "$(cat "$cert")" "$(cat "$key")" ;;
  *"create -f -"*) tee -a "$FAKE_DIR/created-all.yaml" > /dev/null ;;
  *"replace -f -"*) tee -a "$FAKE_DIR/replaced-all.yaml" > "$FAKE_DIR/replaced.yaml" ;;
  *"rollout restart"*) exit 0 ;;
  *"apply -f -"*) tee -a "$FAKE_DIR/applied-all.yaml" > "$FAKE_DIR/applied.yaml" ;;
  *"rollout status deployment/"*) exit "\${FAIL_ROLLOUT:-0}" ;;
  *"get deployment dinner-planner -o jsonpath"*)
    [ -n "\${FAIL_DEPLOY_GET:-}" ] && exit 1
    printf '%s' "\${DEPLOYED_IMAGE-dinner-planner-migrator:20260928101500}" ;;
  *"get pods"*)
    [ -n "\${FAIL_PODS:-}" ] && exit 1
    printf '%s' "\${PODS_IMAGES-}" ;;
  *"wait --for=condition=complete"*) exit "\${FAIL_WAIT:-0}" ;;
  *"logs "*) echo "LOGS: $args" ;;
esac
exit 0
`;
// docker save prints the image name, docker exec stores what is piped into the node. The node's images are the lines
// "<ref> <digest>" of FAKE_NODE_IMAGES (plus what is imported, each with a digest of its own), printed like
// `ctr images ls`; removing one takes it out of the list and is logged (removed-node). The host's are the lines
// of FAKE_HOST_IMAGES (plus what was built); removing one is logged (removed-host). FAIL_RM makes every removal fail.
// The node's free space is FAKE_FREE_KB, and FAKE_FREE_AFTER_KB once an image has been removed from the node
// ("-" means df gives no answer).
const FAKE_DOCKER = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/docker.log"
echo "docker $*" >> "$FAKE_DIR/calls.log"
nodefile="$FAKE_DIR/node-images"
case "$1" in
  save) echo "IMAGE $2" ;;
  build) ;;
  images)
    printf '%s\\n' "\${FAKE_HOST_IMAGES-}"
    awk '/^build/ {for (i = 1; i <= NF; i++) if ($i == "--tag") print $(i + 1)}' "$FAKE_DIR/docker.log" ;;
  image)
    [ -n "\${FAIL_RM:-}" ] && exit 1
    echo "$3" >> "$FAKE_DIR/removed-host" ;;
  exec)
    case "$*" in
      *"images import -"*) cat >> "$FAKE_DIR/imported" ;;
      *"images ls"*)
        [ -f "$nodefile" ] || printf '%s\\n' "\${FAKE_NODE_IMAGES-}" > "$nodefile"
        echo "REF TYPE DIGEST SIZE PLATFORMS LABELS"
        { cat "$nodefile"; [ -f "$FAKE_DIR/imported" ] && awk '{print $2, "sha256:imported" NR}' "$FAKE_DIR/imported"; } |
          while read -r ref digest; do
            [ -n "$ref" ] && echo "$ref application/vnd.oci.image.index.v1+json $digest 1.0MiB linux/arm64 -"
          done ;;
      *"images rm"*)
        [ -n "\${FAIL_RM:-}" ] && exit 1
        ref="\${@: -1}"
        echo "$ref" >> "$FAKE_DIR/removed-node"
        [ -f "$nodefile" ] || printf '%s\\n' "\${FAKE_NODE_IMAGES-}" > "$nodefile"
        awk -v r="$ref" '$1 != r' "$nodefile" > "$nodefile.tmp" && mv "$nodefile.tmp" "$nodefile" ;;
      *"df -Pk"*)
        free="\${FAKE_FREE_KB-9999999}"
        if [ -f "$FAKE_DIR/removed-node" ] && [ -n "\${FAKE_FREE_AFTER_KB:-}" ]; then free="$FAKE_FREE_AFTER_KB"; fi
        [ "$free" = "-" ] && exit 1
        printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/vda1 61202244 1 %s 99%% /\\n' "$free" ;;
    esac ;;
esac
`;
// mkcert writes a certificate and a key (the key a random one) to the files it is told, and logs where; its
// certificate authority is in $FAKE_DIR/ca unless FAKE_NO_CA is set.
const FAKE_MKCERT = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/mkcert.log"
if [ "$1" = "-CAROOT" ]; then
  [ -n "$FAKE_NO_CA" ] && mkdir -p "$FAKE_DIR/noca" && echo "$FAKE_DIR/noca" || echo "$FAKE_DIR/ca"
  exit 0
fi
while [ $# -gt 0 ]; do
  case "$1" in -cert-file) cert="$2" ;; -key-file) key="$2" ;; esac
  shift
done
echo "CERTIFICATE-$RANDOM" > "$cert"
echo "PRIVATE-KEY-$RANDOM$RANDOM" > "$key"
echo "$cert" >> "$FAKE_DIR/mkcert-files"
echo "$key" >> "$FAKE_DIR/mkcert-files"
`;
const FAKE_CURL = '#!/bin/bash\necho "$*" >> "$FAKE_DIR/curl.log"\nexit "${FAIL_CURL:-0}"\n';
const FAKE_SLEEP = "#!/bin/bash\nexit 0\n";

let dir: string;

function writeExecutable(file: string, content: string) {
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

// `withoutMkcert` leaves only the fakes and the system's own tools on the PATH, as on a machine without mkcert.
function run(script: string, env: Record<string, string> = {}, { withoutMkcert = false } = {}) {
  const tools = withoutMkcert ? "/usr/bin:/bin" : process.env.PATH;
  if (withoutMkcert) fs.rmSync(path.join(dir, "bin", "mkcert"), { force: true });
  return spawnSync("bash", [path.join(K8S, script)], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${path.join(dir, "bin")}:${tools}`, FAKE_DIR: dir, ...env },
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
  writeExecutable(path.join(dir, "bin", "mkcert"), FAKE_MKCERT);
  fs.mkdirSync(path.join(dir, "ca"));
  fs.writeFileSync(path.join(dir, "ca", "rootCA.pem"), "ROOT CA");
  writeExecutable(path.join(dir, "bin", "curl"), FAKE_CURL);
  writeExecutable(path.join(dir, "bin", "sleep"), FAKE_SLEEP);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("deploy.sh", () => {
  it("creates the database Secret with a random password the first time, before it builds anything", () => {
    const result = run("deploy.sh");

    expect(result.status).toBe(0);
    const applied = log("applied-all.yaml");
    const password = /POSTGRES_PASSWORD: (\w+)/.exec(applied)![1];
    expect(password).toMatch(/^[0-9a-f]{48}$/);
    expect(applied).toContain(`DATABASE_URL: postgresql://dinner:${password}@dinner-planner-db:5432/dinner_planner`);
    expect(log("kubectl.log")).toContain("apply -f k8s/namespace.yaml");
    // The password travels on stdin only: it is in no command line, no log and no output.
    expect(log("kubectl.log")).not.toContain(password);
    expect(log("docker.log")).not.toContain(password);
    expect(result.stdout + result.stderr).not.toContain(password);
    expect(result.stdout).toContain("Created the dinner-planner-db Secret");
  });

  it("gives every first deploy its own password", () => {
    run("deploy.sh");
    const first = /POSTGRES_PASSWORD: (\w+)/.exec(log("applied-all.yaml"))![1];
    fs.rmSync(path.join(dir, "applied-all.yaml"));
    run("deploy.sh");

    expect(/POSTGRES_PASSWORD: (\w+)/.exec(log("applied-all.yaml"))![1]).not.toBe(first);
  });

  it("keeps an existing database Secret: a new password would lock the app out of the existing database", () => {
    const result = run("deploy.sh", { SECRET_EXIT: "0" });

    expect(result.status).toBe(0);
    expect(log("applied-all.yaml")).not.toContain("POSTGRES_PASSWORD");
    expect(result.stdout).toContain("exists and is kept");
  });

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
    // Over HTTPS, against mkcert's own authority, with dinner.local resolved to this machine.
    expect(log("curl.log")).toContain(`--cacert ${path.join(dir, "ca", "rootCA.pem")} --resolve dinner.local:443:127.0.0.1 https://dinner.local/healthz`);
    expect(result.stdout).toContain("Open https://dinner.local");
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
    expect(result.stderr).toContain("mkcert -install");
  });

  describe("the HTTPS certificate", () => {
    it("is made with mkcert for dinner.local the first time, before anything is built", () => {
      const result = run("deploy.sh");

      expect(result.status).toBe(0);
      expect(log("mkcert.log")).toMatch(/-cert-file \S+tls\.crt -key-file \S+tls\.key dinner\.local/);
      expect(log("kubectl.log")).toContain("-n dinner-planner create secret tls dinner-planner-tls --cert");
      expect(log("created-all.yaml")).toContain("type: kubernetes.io/tls");
      expect(result.stdout).toContain("Created the dinner-planner-tls Secret");
      // One log for both tools, so the order across them is the real one.
      const calls = log("calls.log");
      expect(calls.indexOf("create secret tls")).toBeGreaterThanOrEqual(0);
      expect(calls.indexOf("create secret tls")).toBeLessThan(calls.indexOf("docker build --target app"));
    });

    it("never puts the key in a command line, a log, the output or a file that stays behind", () => {
      const result = run("deploy.sh");

      const key = /tls\.key: (\S+)/.exec(log("created-all.yaml"))![1];
      expect(key).toMatch(/^PRIVATE-KEY-\d+$/);
      expect(log("kubectl.log")).not.toContain(key);
      expect(log("docker.log")).not.toContain(key);
      expect(log("applied-all.yaml")).not.toContain(key);
      expect(result.stdout + result.stderr).not.toContain(key);
      // The temporary directory with the key is gone again.
      for (const file of log("mkcert-files").trim().split("\n")) expect(fs.existsSync(file), file).toBe(false);
    });

    it("is kept when it exists, without needing mkcert at all", () => {
      const result = run("deploy.sh", { TLS_SECRET_EXIT: "0" }, { withoutMkcert: true });

      expect(result.status).toBe(0);
      expect(log("mkcert.log")).toBe("");
      expect(log("kubectl.log")).not.toContain("create secret tls");
      expect(result.stdout).toContain("The dinner-planner-tls Secret exists and is kept");
    });

    it("stops with the install commands, before building, when mkcert is missing, and installs nothing itself", () => {
      const result = run("deploy.sh", {}, { withoutMkcert: true });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("brew install mkcert && mkcert -install");
      expect(log("docker.log")).toBe("");
      expect(log("kubectl.log")).not.toContain("create secret tls");
    });

    it("stops and asks for `mkcert -install` when mkcert has no certificate authority yet", () => {
      const result = run("deploy.sh", { FAKE_NO_CA: "1" });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("mkcert -install");
      expect(log("mkcert.log")).not.toContain("-cert-file");
      expect(log("docker.log")).toBe("");
    });
  });
});

describe("deploy.sh: old images and the node's disk", () => {
  // "<ref> <digest>", like `ctr images ls`. Importing an image makes a second reference named sha256:… next to its tag,
  // with the same digest; two builds of the same content (the migrator, 20261010… and 20261014…) share one digest.
  const NODE_IMAGES = [
    "docker.io/library/dinner-planner:20261001100000 sha256:d1",
    "sha256:ref-of-d1 sha256:d1",
    "docker.io/library/dinner-planner:20261010100000 sha256:d2",
    "sha256:ref-of-d2 sha256:d2",
    "docker.io/library/dinner-planner:20261014114253 sha256:d3",
    "sha256:ref-of-d3 sha256:d3",
    "docker.io/library/dinner-planner-migrator:20261001100000 sha256:d4",
    "sha256:ref-of-d4 sha256:d4",
    "docker.io/library/dinner-planner-migrator:20261010100000 sha256:d5",
    "docker.io/library/dinner-planner-migrator:20261014114253 sha256:d5",
    "sha256:ref-of-d5 sha256:d5",
    "docker.io/library/dinner-planner:dev sha256:dev",
    "docker.io/library/dinner-planner-seed:20261001100000 sha256:seed",
    "docker.io/library/watchlist-backend:20261001100000 sha256:w1",
    "sha256:ref-of-w1 sha256:w1",
    "docker.io/library/postgres:17-alpine sha256:pg",
  ].join("\n");
  const HOST_IMAGES = ["dinner-planner:20261001100000", "dinner-planner-migrator:20261001100000", "dinner-planner:20261014114253", "postgres:17-alpine", "watchlist-backend:20261001100000"].join("\n");
  const env = {
    FAKE_NODE_IMAGES: NODE_IMAGES,
    FAKE_HOST_IMAGES: HOST_IMAGES,
    // The app ran this tag before the deploy: the one to roll back to.
    DEPLOYED_IMAGE: "dinner-planner:20261014114253",
  };
  const lines = (name: string) => log(name).split("\n").filter(Boolean).sort();
  const newTag = () => /--tag dinner-planner:(\d{14}) /.exec(log("docker.log"))![1];

  it("removes the old images of this project from the node and the host after the new version runs, and nothing else", () => {
    const result = run("deploy.sh", env);

    expect(result.status).toBe(0);
    // The tags, and the second reference of every image that no kept tag shares a digest with (d1, d2, d4; not d3 and d5).
    expect(lines("removed-node")).toEqual([
      "docker.io/library/dinner-planner-migrator:20261001100000",
      "docker.io/library/dinner-planner-migrator:20261010100000",
      "docker.io/library/dinner-planner:20261001100000",
      "docker.io/library/dinner-planner:20261010100000",
      "sha256:ref-of-d1",
      "sha256:ref-of-d2",
      "sha256:ref-of-d4",
    ]);
    expect(lines("removed-host")).toEqual(["dinner-planner-migrator:20261001100000", "dinner-planner:20261001100000"]);
    expect(result.stdout).toContain("Removed docker.io/library/dinner-planner:20261001100000 from the node.");
    expect(result.stdout).toContain("Removed sha256:ref-of-d1 from the node.");
  });

  it("keeps the second reference of an image that a kept tag still shares", () => {
    run("deploy.sh", env);

    // d5 is the digest of the migrator tag that was removed (20261010…) and of the one kept (20261014…).
    expect(log("removed-node")).not.toContain("sha256:ref-of-d5");
    expect(log("removed-node")).not.toContain("sha256:ref-of-d3");
  });

  it("keeps the new tag, the tag the app ran before, and every tag a pod uses, on the node and the host", () => {
    run("deploy.sh", { ...env, PODS_IMAGES: "dinner-planner:20261010100000\ndinner-planner-migrator:20261010100000\npostgres:17-alpine\n" });

    const removed = `${log("removed-node")}${log("removed-host")}`;
    expect(removed).not.toContain("20261014114253");
    expect(removed).not.toContain("20261010100000");
    expect(removed).not.toContain("sha256:ref-of-d2");
    expect(removed).toContain("dinner-planner:20261001100000");
    // The new images are in the node's list (imported) and the host's (built), and are not removed.
    expect(log("imported")).toContain(`dinner-planner:${newTag()}`);
    expect(removed).not.toContain(newTag());
    expect(removed).not.toContain("sha256:imported");
  });

  it("never touches another project's image, an image without a timestamp tag, or the postgres image", () => {
    run("deploy.sh", env);

    const removed = `${log("removed-node")}${log("removed-host")}`;
    for (const kept of ["watchlist-backend", "ref-of-w1", "postgres", "dinner-planner:dev", "dinner-planner-seed", "sha256:d", "sha256:pg"]) {
      expect(removed).not.toContain(kept);
    }
  });

  it("removes nothing before the rollout has succeeded, and nothing when it fails", () => {
    const failed = run("deploy.sh", { ...env, FAIL_ROLLOUT: "1" });

    expect(failed.status).toBe(1);
    expect(log("removed-node")).toBe("");
    expect(log("removed-host")).toBe("");

    fs.rmSync(path.join(dir, "docker.log"), { force: true });
    run("deploy.sh", env);
    const calls = log("calls.log");
    expect(calls.indexOf("rollout status deployment/")).toBeGreaterThan(-1);
    expect(calls.indexOf("images rm")).toBeGreaterThan(calls.indexOf("rollout status deployment/"));
  });

  it("only warns when an image cannot be removed: the deploy still succeeds", () => {
    const result = run("deploy.sh", { ...env, FAIL_RM: "1" });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Warning: could not remove docker.io/library/dinner-planner:20261001100000 from the node.");
    expect(result.stderr).toContain("Warning: could not remove dinner-planner:20261001100000 from the host.");
    expect(result.stdout).toContain("Open https://dinner.local");
  });

  it.each([
    ["the pods cannot be read", { FAIL_PODS: "1" }],
    ["the Deployment cannot be read", { FAIL_DEPLOY_GET: "1" }],
  ])("removes nothing when %s, since it cannot tell what a pod might need (and still deploys)", (_what, fail) => {
    const result = run("deploy.sh", { ...env, ...fail });

    expect(result.status).toBe(0);
    expect(log("removed-node")).toBe("");
    expect(log("removed-host")).toBe("");
    expect(result.stderr).toContain("could not tell which images are in use, so no old images were removed");
  });

  it("has no rollback tag on the first deploy (nothing answers) and still removes only stale ones", () => {
    const result = run("deploy.sh", { ...env, DEPLOYED_IMAGE: "" });

    expect(result.status).toBe(0);
    expect(log("removed-node")).not.toContain("watchlist");
    expect(log("removed-node")).toContain("dinner-planner:20261014114253");
    expect(log("removed-node")).not.toContain(newTag());
  });

  describe("free space", () => {
    it("is checked on the node before anything is built, and does not stop a deploy with room", () => {
      const result = run("deploy.sh", { ...env, FAKE_FREE_KB: "5000000" });

      expect(result.status).toBe(0);
      const calls = log("calls.log");
      expect(calls.indexOf("df -Pk /")).toBeGreaterThan(-1);
      expect(calls.indexOf("df -Pk /")).toBeLessThan(calls.indexOf("docker build"));
      // Nothing is removed before the build when there is room.
      expect(calls.indexOf("images rm")).toBeGreaterThan(calls.indexOf("docker build"));
    });

    it("removes the old images first when the node is nearly full, and carries on when that is enough", () => {
      const result = run("deploy.sh", { ...env, FAKE_FREE_KB: "500000", FAKE_FREE_AFTER_KB: "5000000" });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Only 488 MB are free on the node");
      expect(result.stdout).toContain("MB are free now.");
      const calls = log("calls.log");
      expect(calls.indexOf("images rm")).toBeLessThan(calls.indexOf("docker build"));
      expect(log("removed-node")).not.toContain("20261014114253");
    });

    it("keeps the rollback tag and the tags pods use when it removes images before the build, on the node and the host", () => {
      run("deploy.sh", {
        ...env,
        FAKE_FREE_KB: "500000",
        FAKE_FREE_AFTER_KB: "5000000",
        PODS_IMAGES: "dinner-planner:20261010100000\ndinner-planner-migrator:20261010100000\n",
      });

      const beforeBuild = log("calls.log").slice(0, log("calls.log").indexOf("docker build"));
      expect(beforeBuild).toContain("images rm");
      const removed = `${log("removed-node")}${log("removed-host")}`;
      expect(removed).not.toContain("20261014114253");
      expect(removed).not.toContain("20261010100000");
      expect(removed).toContain("20261001100000");
    });

    it("does not remove anything before the build when it cannot tell what is in use, and then stops if the space is short", () => {
      const result = run("deploy.sh", { ...env, FAKE_FREE_KB: "500000", FAKE_FREE_AFTER_KB: "5000000", FAIL_PODS: "1" });

      expect(result.status).toBe(1);
      expect(log("removed-node")).toBe("");
      expect(result.stderr).toContain("could not tell which images are in use");
      expect(result.stderr).toContain("Not enough disk space on the node");
    });

    it("stops before building and says what to free by hand when removing the old images is not enough", () => {
      const result = run("deploy.sh", { ...env, FAKE_FREE_KB: "500000", FAKE_FREE_AFTER_KB: "800000" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Not enough disk space on the node: 781 MB free, 2048 MB needed. Nothing was deployed.");
      expect(result.stderr).toContain("docker builder prune");
      expect(result.stderr).toContain("docker volume ls");
      expect(log("docker.log")).not.toContain("build");
      // No manifest with an image was applied (only the database Secret, which comes before).
      expect(log("applied-all.yaml")).not.toContain("image:");
    });

    it("does not stop a deploy when the free space cannot be read", () => {
      const result = run("deploy.sh", { ...env, FAKE_FREE_KB: "-" });

      expect(result.status).toBe(0);
      expect(log("docker.log")).toContain("build --target app");
    });
  });

  describe("orphan_refs", () => {
    const orphans = (digests: string[], listing: string[]) =>
      spawnSync("bash", ["-c", `source "${path.join(K8S, "image-cleanup.sh")}"; orphan_refs ${digests.join(" ")}`], {
        encoding: "utf8",
        input: ["REF TYPE DIGEST SIZE", ...listing].join("\n") + "\n",
      }).stdout.split("\n").filter(Boolean);

    it("selects the sha256 reference of a removed digest that no tag shares, and only that", () => {
      expect(
        orphans(
          ["sha256:a", "sha256:b"],
          [
            "sha256:one idx sha256:a 1MiB",
            "sha256:two idx sha256:b 1MiB",
            "dinner-planner:x idx sha256:b 1MiB",
            "sha256:three idx sha256:c 1MiB",
            "docker.io/library/postgres:17 idx sha256:a 1MiB",
          ],
        ),
      ).toEqual([]);
      expect(orphans(["sha256:a"], ["sha256:one idx sha256:a 1MiB", "sha256:three idx sha256:c 1MiB"])).toEqual(["sha256:one"]);
    });
  });

  describe("stale_images", () => {
    const stale = (keep: string[], refs: string[]) =>
      spawnSync("bash", ["-c", `source "${path.join(K8S, "image-cleanup.sh")}"; stale_images ${keep.join(" ")}`], {
        encoding: "utf8",
        input: refs.join("\n") + "\n",
      }).stdout.split("\n").filter(Boolean);

    it("keeps the tags it is given, and matches only this project's timestamp tags, with or without the registry prefix", () => {
      expect(
        stale(
          ["20261014114253"],
          ["dinner-planner:20261001100000", "docker.io/library/dinner-planner-migrator:20261001100000", "dinner-planner:20261014114253"],
        ),
      ).toEqual(["dinner-planner:20261001100000", "docker.io/library/dinner-planner-migrator:20261001100000"]);
    });

    it.each([
      "dinner-planner:dev",
      "dinner-planner:2026100110000",
      "dinner-planner:202610011000001",
      "dinner-planner:2026100110000a",
      "dinner-planner-seed:20261001100000",
      "my-dinner-planner:20261001100000",
      "registry.example.com/dinner-planner:20261001100000",
      "watchlist-backend:20261001100000",
      "postgres:17-alpine",
    ])("never selects %s", (ref) => {
      expect(stale([], [ref])).toEqual([]);
    });

    it("selects everything stale when it is given no tag", () => {
      expect(stale([], ["dinner-planner:20261001100000"])).toEqual(["dinner-planner:20261001100000"]);
    });
  });
});

describe("renew-tls.sh", () => {
  it("replaces the Secret with a new certificate, through a pipe and without `apply`", () => {
    const result = run("renew-tls.sh", { TLS_SECRET_EXIT: "0" });

    expect(result.status).toBe(0);
    expect(log("kubectl.log")).toContain("--context docker-desktop -n dinner-planner replace -f -");
    expect(log("kubectl.log")).not.toContain(" apply");
    expect(log("replaced.yaml")).toContain("type: kubernetes.io/tls");
    expect(log("mkcert.log")).toContain("dinner.local");
    expect(result.stdout).toContain("https://dinner.local has a new certificate");
    const key = /tls\.key: (\S+)/.exec(log("replaced.yaml"))![1];
    expect(log("kubectl.log")).not.toContain(key);
    for (const file of log("mkcert-files").trim().split("\n")) expect(fs.existsSync(file), file).toBe(false);
  });

  it("creates the Secret when there is none yet", () => {
    const result = run("renew-tls.sh");

    expect(result.status).toBe(0);
    expect(log("created-all.yaml")).toContain("type: kubernetes.io/tls");
    expect(log("kubectl.log")).not.toContain("replace");
  });

  it("needs mkcert, and says how to get it", () => {
    const result = run("renew-tls.sh", {}, { withoutMkcert: true });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("brew install mkcert && mkcert -install");
    expect(log("kubectl.log")).not.toContain("replace");
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

describe("the access key", () => {
  const keyIn = (text: string) => /ACCESS_KEY: "([\w-]+)"/.exec(text)![1];

  it("is made on the first deploy: 256 random bits, URL-safe, through a pipe, before anything is built", () => {
    const result = run("deploy.sh");

    expect(result.status).toBe(0);
    const key = keyIn(log("created-all.yaml"));
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(log("created-all.yaml")).toContain("name: dinner-planner-access");
    const calls = log("calls.log");
    expect(calls.indexOf("create -f -")).toBeGreaterThanOrEqual(0);
    expect(calls.lastIndexOf("create -f -")).toBeLessThan(calls.indexOf("docker build --target app"));
    // On stdin only: in no command line, no log, no output, and never through `apply`.
    for (const text of [log("kubectl.log"), log("docker.log"), log("applied-all.yaml"), result.stdout, result.stderr]) {
      expect(text).not.toContain(key);
    }
    expect(result.stdout).toContain("Created the dinner-planner-access Secret");
    expect(result.stdout).toContain("npm run k8s:access-link");
  });

  it("is a new key on every first deploy", () => {
    run("deploy.sh");
    const first = keyIn(log("created-all.yaml"));
    fs.rmSync(path.join(dir, "created-all.yaml"));
    run("deploy.sh");

    expect(keyIn(log("created-all.yaml"))).not.toBe(first);
  });

  it("is kept when it exists: a new key would lock out every device", () => {
    const result = run("deploy.sh", { ACCESS_SECRET_EXIT: "0" });

    expect(result.status).toBe(0);
    expect(log("created-all.yaml")).not.toContain("ACCESS_KEY");
    expect(result.stdout).toContain("The dinner-planner-access Secret exists and is kept");
  });
});

describe("access-link.sh", () => {
  it("prints the private link with the key after #, which no server receives", () => {
    const result = run("access-link.sh", { FAKE_ACCESS_KEY: "abc-DEF_123" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("https://dinner.local/access#abc-DEF_123");
    expect(log("kubectl.log")).toContain("--context docker-desktop -n dinner-planner get secret dinner-planner-access");
    expect(result.stdout).toContain("npm run k8s:rotate-access-key");
  });

  it("adds a QR code when qrencode is installed", () => {
    writeExecutable(path.join(dir, "bin", "qrencode"), '#!/bin/bash\necho "QR: $*" >> "$FAKE_DIR/qr.log"; echo "[qr code]"\n');

    const result = run("access-link.sh", { FAKE_ACCESS_KEY: "abc-DEF_123" });

    expect(log("qr.log")).toBe("QR: -t ANSIUTF8 https://dinner.local/access#abc-DEF_123\n");
    expect(result.stdout).toContain("[qr code]");
  });
});

describe("rotate-access-key.sh", () => {
  it("replaces the Secret with a new key through a pipe, restarts the app and waits for it", () => {
    const result = run("rotate-access-key.sh");

    expect(result.status).toBe(0);
    const key = /ACCESS_KEY: "([\w-]+)"/.exec(log("replaced.yaml"))![1];
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(log("kubectl.log")).toContain("--context docker-desktop -n dinner-planner replace -f -");
    expect(log("kubectl.log")).not.toContain(" apply");
    expect(log("kubectl.log")).not.toContain(key);
    expect(result.stdout + result.stderr).not.toContain(key);
    const calls = log("calls.log");
    expect(calls.indexOf("replace -f -")).toBeLessThan(calls.indexOf("rollout restart deployment/dinner-planner"));
    expect(calls.indexOf("rollout restart")).toBeLessThan(calls.indexOf("rollout status deployment/dinner-planner"));
    expect(result.stdout).toContain("npm run k8s:access-link");
  });

  it("gives every rotation a new key", () => {
    run("rotate-access-key.sh");
    const first = /ACCESS_KEY: "([\w-]+)"/.exec(log("replaced.yaml"))![1];
    run("rotate-access-key.sh");

    expect(/ACCESS_KEY: "([\w-]+)"/.exec(log("replaced.yaml"))![1]).not.toBe(first);
  });
});
