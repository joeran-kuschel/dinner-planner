---
paths:
  - "k8s/**"
  - "Dockerfile"
  - ".dockerignore"
  - "compose.yaml"
---

# Kubernetes

The app runs in **Docker Desktop's Kubernetes** (context `docker-desktop`), namespace `dinner-planner`, at `https://dinner.local`
(`:8443` when another program holds 443). `npm run k8s:deploy` is the whole workflow. The full chapter, with the reasons:
`documentation/backend/kubernetes.md`.

- Images are imported into the node, never pulled (`imagePullPolicy: Never`); every build gets a fresh timestamp tag. Every script pins
  `--context docker-desktop`: never use another context.
- The nginx ingress controller is shared with other apps: never install or change it.
- Migrations run as an init container; seeding is manual (`npm run k8s:seed`).
- `prisma`, `tsx` and `dotenv` are runtime dependencies: moving them to `devDependencies` breaks migrations in the cluster.
- Secrets (`dinner-planner-db`, `-access`, `-tls`) are no manifests: `deploy.sh` creates each once with `kubectl create`. Never
  `kubectl apply -k k8s` by hand. No password, key or certificate is ever in the repository (`database-credentials.md`,
  `access-key.md`, `tls.md`).
- Only the app's pods may reach the database (`k8s/network-policy.yaml`): a new pod that needs it needs a label there
  (`database-network-policy.md`).
- The database volume lives inside the node and dies with a Kubernetes reset or `npm run k8s:delete`: run `npm run k8s:backup` before
  anything risky (`database-backups.md`).
- A deploy removes old images and needs 2 GB free on the node (`image-cleanup.md`).
- A new file in the repository root or a new import path is checked against the image build (`.dockerignore`,
  `docker build --target app .`): `npm run check` never builds the image.
