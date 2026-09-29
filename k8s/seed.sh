#!/usr/bin/env bash
# Load the sample recipes into the cluster's database. Run with `npm run k8s:seed`.
set -euo pipefail

CLUSTER=docker-desktop
NAMESPACE=dinner-planner

cd "$(dirname "$0")/.."
KUBECTL=(kubectl --context "$CLUSTER" -n "$NAMESPACE")

# Take the image from the running Deployment rather than the `:dev` placeholder
# in the manifest: deploy.sh builds a uniquely tagged image every time, and
# seeding has to run the same build the app is running.
IMAGE="$("${KUBECTL[@]}" get deployment dinner-planner \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="migrate")].image}')"

if [ -z "$IMAGE" ]; then
  echo "Could not read the migrator image from the deployment. Run 'npm run k8s:deploy' first." >&2
  exit 1
fi

echo "Seeding with $IMAGE"

# A completed Job's pod template is immutable, so re-seeding means replacing it.
"${KUBECTL[@]}" delete job dinner-planner-seed --ignore-not-found

sed "s|image: dinner-planner-migrator:dev|image: ${IMAGE}|" k8s/seed-job.yaml \
  | "${KUBECTL[@]}" apply -f -

if ! "${KUBECTL[@]}" wait --for=condition=complete job/dinner-planner-seed --timeout=180s; then
  echo
  echo "Seeding failed. Logs:"
  "${KUBECTL[@]}" logs job/dinner-planner-seed --tail=30 || true
  exit 1
fi

"${KUBECTL[@]}" logs job/dinner-planner-seed
