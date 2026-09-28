import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";

const K8S = path.join(process.cwd(), "k8s");
const CLUSTER = "docker-desktop";

type Container = { name: string; image: string; imagePullPolicy?: string };

/** Every container, init container included, in every manifest in k8s/. */
function containers(): Container[] {
  return fs
    .readdirSync(K8S)
    .filter((file) => file.endsWith(".yaml"))
    .flatMap((file) => parseAllDocuments(fs.readFileSync(path.join(K8S, file), "utf-8")))
    .map((doc) => doc.toJS())
    .flatMap((resource) => {
      const pod = resource?.spec?.template?.spec;
      return pod ? [...(pod.initContainers ?? []), ...pod.containers] : [];
    });
}

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
}

describe("Kubernetes setup for Docker Desktop", () => {
  it("never pulls the images that deploy.sh builds and imports into the node", () => {
    const own = containers().filter((c) => c.image.startsWith("dinner-planer"));

    expect(own.map((c) => c.name).sort()).toEqual(["app", "migrate", "seed"]);
    for (const container of own) expect(container, container.name).toMatchObject({ imagePullPolicy: "Never" });
  });

  it.each(["k8s/deploy.sh", "k8s/seed.sh"])("%s only talks to the docker-desktop context", (file) => {
    const script = read(file);

    expect(script).toContain(`CLUSTER=${CLUSTER}`);
    // Every kubectl call goes through the pinned context.
    expect(script.match(/kubectl(?! --context)/g) ?? []).toEqual([]);
  });

  it("pins every kubectl npm script to the docker-desktop context", () => {
    const scripts: Record<string, string> = JSON.parse(read("package.json")).scripts;
    const kubectl = Object.values(scripts).filter((command) => command.includes("kubectl"));

    expect(kubectl.length).toBeGreaterThan(0);
    for (const command of kubectl) expect(command).toContain(`kubectl --context ${CLUSTER} `);
  });

  it("has no minikube leftovers in the scripts, manifests or npm scripts", () => {
    const files = [...fs.readdirSync(K8S).map((file) => `k8s/${file}`), "package.json"];

    for (const file of files) expect(read(file), file).not.toMatch(/minikube/i);
  });
});
