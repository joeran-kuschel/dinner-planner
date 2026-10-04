import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import { MAX_PHOTO_BYTES } from "@/lib/recipe-photo-shared";

const K8S = path.join(process.cwd(), "k8s");
const CLUSTER = "docker-desktop";

type Container = {
  name: string;
  image: string;
  imagePullPolicy?: string;
  envFrom?: { secretRef: { name: string } }[];
};
// Parsed YAML; each test reads only the fields it checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resource = any;

/** The Secret that k8s/db-secret.sh renders, parsed. */
function secretManifest(user: string, password: string, database: string): Resource {
  const output = execFileSync("bash", ["-c", 'source k8s/db-secret.sh && db_secret_manifest "$@"', "bash", user, password, database], {
    encoding: "utf-8",
  });
  return parse(output);
}

/** Every resource in one manifest file in k8s/. */
function resources(file: string): Resource[] {
  return parseAllDocuments(fs.readFileSync(path.join(K8S, file), "utf-8")).map((doc) => doc.toJS());
}

/** Every container, init container included, in every manifest in k8s/. */
function containers(): Container[] {
  return fs
    .readdirSync(K8S)
    .filter((file) => file.endsWith(".yaml"))
    .flatMap(resources)
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
    const own = containers().filter((c) => c.image.startsWith("dinner-planner"));

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

  it("uses one namespace in the kustomization, the Namespace, the scripts and the npm scripts", () => {
    const namespace = resources("kustomization.yaml")[0].namespace;
    const scripts: Record<string, string> = JSON.parse(read("package.json")).scripts;

    expect(namespace).toBe("dinner-planner");
    expect(resources("namespace.yaml")[0].metadata.name).toBe(namespace);
    for (const file of ["k8s/deploy.sh", "k8s/seed.sh"]) expect(read(file), file).toContain(`NAMESPACE=${namespace}\n`);
    expect(read("k8s/db-common.sh")).toContain(`NAMESPACE="\${NAMESPACE:-${namespace}}"`);
    for (const command of Object.values(scripts).filter((c) => c.includes("kubectl"))) {
      expect(command).toContain(`-n ${namespace} `);
    }
  });

  it("points every Secret, Service and Ingress reference at a resource that exists", () => {
    const all = fs
      .readdirSync(K8S)
      .filter((file) => file.endsWith(".yaml") && file !== "kustomization.yaml")
      .flatMap(resources);
    const named = (kind: string) => all.filter((r) => r.kind === kind);
    // The Secret is not a manifest: deploy.sh creates it (k8s/db-secret.sh), so it is named there.
    expect(named("Secret")).toEqual([]);
    const secrets = [/^DB_SECRET=(\S+)$/m.exec(read("k8s/db-secret.sh"))![1]];
    const services = named("Service");
    const podLabels = all.flatMap((r: Resource) => (r.spec?.template?.metadata?.labels ? [r.spec.template.metadata.labels] : []));

    const secretRefs = containers().flatMap((c) => c.envFrom?.map((e) => e.secretRef.name) ?? []);
    expect(secretRefs.length).toBeGreaterThan(0);
    for (const ref of secretRefs) expect(secrets).toContain(ref);

    for (const service of services) {
      expect(podLabels, service.metadata.name).toContainEqual(expect.objectContaining(service.spec.selector));
    }
    for (const set of named("StatefulSet")) {
      expect(services.map((s) => s.metadata.name)).toContain(set.spec.serviceName);
    }
    for (const ingress of named("Ingress")) {
      const backends = ingress.spec.rules.flatMap((rule: Resource) =>
        rule.http.paths.map((p: Resource) => p.backend.service.name),
      );
      for (const backend of backends) expect(services.map((s) => s.metadata.name)).toContain(backend);
    }

    const manifest = secretManifest("dinner", "pw", "dinner_planner");
    const url = new URL(manifest.stringData.DATABASE_URL);
    expect(services.map((s) => s.metadata.name)).toContain(url.hostname);
    expect(url.pathname).toBe(`/${manifest.stringData.POSTGRES_DB}`);
    expect(manifest.metadata.namespace).toBe(resources("kustomization.yaml")[0].namespace);
  });

  it("keeps the database password out of the manifests, the scripts and the docs", () => {
    const files = [...fs.readdirSync(K8S).map((file) => `k8s/${file}`), "compose.yaml", ".env.example", "README.md"];

    for (const file of files) {
      const text = read(file);
      // A value that starts with $ is a template (db-secret.sh) or a variable (compose.yaml), not a password.
      expect(text, file).not.toMatch(/^\s*POSTGRES_PASSWORD:\s*(?!"?\$)\S/m);
      if (file.endsWith(".yaml")) expect(text, file).not.toMatch(/^kind: Secret$/m);
      expect(text, file).not.toContain("dinner:dinner");
    }
  });

  it("has no minikube leftovers in the scripts, manifests or npm scripts", () => {
    const files = [...fs.readdirSync(K8S).map((file) => `k8s/${file}`), "package.json"];

    for (const file of files) expect(read(file), file).not.toMatch(/minikube/i);
  });
});

describe("upload limits for recipe photos", () => {
  const MEGABYTE = 1024 * 1024;

  /** "8m" or "6mb" as bytes. */
  const megabytes = (size: string) => Number(/^(\d+)m/i.exec(size)![1]) * MEGABYTE;

  const ingressLimit = () => {
    const [ingress] = resources("ingress.yaml").filter((r) => r?.kind === "Ingress");
    return megabytes(ingress.metadata.annotations["nginx.ingress.kubernetes.io/proxy-body-size"]);
  };
  const serverActionLimit = () => megabytes(/bodySizeLimit:\s*"([^"]+)"/.exec(read("next.config.ts"))![1]);

  it("lets a photo through Next's server-action limit, which is above the photo limit", () => {
    expect(serverActionLimit()).toBeGreaterThan(MAX_PHOTO_BYTES);
  });

  it("lets the whole request through the ingress: nginx's default of 1 MB would answer with 413", () => {
    expect(ingressLimit()).toBeGreaterThan(MAX_PHOTO_BYTES);
    expect(ingressLimit()).toBeGreaterThanOrEqual(serverActionLimit());
  });

  it("sets the limit on this app's Ingress only, never on the shared controller", () => {
    const controllerFiles = fs.readdirSync(K8S).filter((file) => /ingress-nginx|controller/i.test(file));
    expect(controllerFiles).toEqual([]);
    expect(read("k8s/deploy.sh")).not.toMatch(/ingress-nginx.*(apply|patch|annotate)/);
  });
});
