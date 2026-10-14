#!/usr/bin/env bash
# Build the images, load them into Docker Desktop's Kubernetes, and apply k8s/.
#
# Run with `npm run k8s:deploy`. Safe to re-run: it is the normal way to push a
# code change into the cluster.
set -euo pipefail

CLUSTER=docker-desktop
NAMESPACE=dinner-planner
HOST=dinner.local
APP_REPO=dinner-planner
MIGRATOR_REPO=dinner-planner-migrator

# A fresh tag per build: with an unchanged pod spec Kubernetes sees nothing to
# roll out, so the old pod would keep running the old image.
TAG="$(date -u +%Y%m%d%H%M%S)"
APP_IMAGE="$APP_REPO:$TAG"
MIGRATOR_IMAGE="$MIGRATOR_REPO:$TAG"

cd "$(dirname "$0")/.."
# shellcheck source=k8s/db-secret.sh
source k8s/db-secret.sh
# shellcheck source=k8s/tls-secret.sh
source k8s/tls-secret.sh
# shellcheck source=k8s/access-secret.sh
source k8s/access-secret.sh
KUBE_CONTEXT="$CLUSTER"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# Everything below must talk to docker-desktop, never to whichever context
# happens to be current — deploying this at a real cluster by accident would be bad.
KUBECTL=(kubectl --context "$CLUSTER")

step "Checking the cluster"
if ! "${KUBECTL[@]}" get nodes >/dev/null 2>&1; then
  echo "The '$CLUSTER' cluster is not reachable. Start Docker Desktop and turn on" >&2
  echo "Kubernetes in Settings → Kubernetes, then run this again." >&2
  exit 1
fi

# The nginx ingress controller serves https://dinner.local. It is shared with
# other apps on this cluster, so it is only checked here, never installed.
if ! "${KUBECTL[@]}" get ingressclass nginx >/dev/null 2>&1; then
  echo "The nginx ingress controller is missing. Install it once with:" >&2
  echo >&2
  echo "  kubectl --context $CLUSTER apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml" >&2
  exit 1
fi

step "Checking the database login"
# The Secret is not in k8s/. It is created once, with a random password, and then left alone: Postgres only
# reads its password when it first creates the data directory, so a new one in the Secret would lock the app
# out of the existing database. `npm run k8s:rotate-db-password` changes it properly.
"${KUBECTL[@]}" apply -f k8s/namespace.yaml >/dev/null
if "${KUBECTL[@]}" -n "$NAMESPACE" get secret "$DB_SECRET" >/dev/null 2>&1; then
  echo "The $DB_SECRET Secret exists and is kept."
else
  db_secret_manifest dinner "$(new_db_password)" dinner_planner | "${KUBECTL[@]}" apply -f - >/dev/null
  echo "Created the $DB_SECRET Secret with a random password."
fi

step "Checking the HTTPS certificate"
# Like the database Secret, the TLS Secret is made once and then left alone. It needs mkcert only then.
if "${KUBECTL[@]}" -n "$NAMESPACE" get secret "$TLS_SECRET" >/dev/null 2>&1; then
  echo "The $TLS_SECRET Secret exists and is kept."
else
  require_mkcert "$HOST" || exit 1
  tls_secret_manifest "$HOST" | "${KUBECTL[@]}" -n "$NAMESPACE" create -f - >/dev/null
  echo "Created the $TLS_SECRET Secret with a certificate for $HOST."
fi

step "Checking the access key"
# The one key every browser needs (lib/access.ts). Made once and then left alone: a new one would lock out every
# device. `npm run k8s:rotate-access-key` replaces it on purpose.
if "${KUBECTL[@]}" -n "$NAMESPACE" get secret "$ACCESS_SECRET" >/dev/null 2>&1; then
  echo "The $ACCESS_SECRET Secret exists and is kept."
else
  access_secret_manifest "$(new_access_key)" | "${KUBECTL[@]}" -n "$NAMESPACE" create -f - >/dev/null
  echo "Created the $ACCESS_SECRET Secret. Print the link for your devices with: npm run k8s:access-link"
fi

step "Building images ($TAG)"
docker build --target app --tag "$APP_IMAGE" .
docker build --target migrator --tag "$MIGRATOR_IMAGE" .

step "Loading images into the cluster"
# Docker Desktop runs Kubernetes as a kind node with its own image store, so an
# image built on the host is invisible to it until it is imported into the
# node. The manifests use `imagePullPolicy: Never`, so nothing is ever pulled.
NODE="$("${KUBECTL[@]}" get nodes -o jsonpath='{.items[0].metadata.name}')"
for image in "$APP_IMAGE" "$MIGRATOR_IMAGE"; do
  docker save "$image" | docker exec -i "$NODE" ctr --namespace k8s.io images import -
done

step "Applying manifests"
# The manifests carry `:dev` so that `kubectl --context docker-desktop apply -k k8s` still works;
# here the freshly built tag is substituted in. The migrator is rewritten first:
# its repository name contains the app's, so order matters.
"${KUBECTL[@]}" kustomize k8s \
  | sed -e "s|image: ${MIGRATOR_REPO}:dev|image: ${MIGRATOR_IMAGE}|g" \
        -e "s|image: ${APP_REPO}:dev|image: ${APP_IMAGE}|g" \
  | "${KUBECTL[@]}" apply -f -

step "Waiting for Postgres"
"${KUBECTL[@]}" -n "$NAMESPACE" rollout status statefulset/dinner-planner-db --timeout=300s

step "Waiting for the app"
# The pod runs `prisma migrate deploy` in an init container before it starts,
# so this also covers the migration.
if ! "${KUBECTL[@]}" -n "$NAMESPACE" rollout status deployment/dinner-planner --timeout=300s; then
  echo
  echo "Rollout failed. Recent events:"
  "${KUBECTL[@]}" -n "$NAMESPACE" get events --sort-by=.lastTimestamp | tail -15
  echo
  echo "Migration log:"
  "${KUBECTL[@]}" -n "$NAMESPACE" logs deployment/dinner-planner -c migrate --tail=40 || true
  exit 1
fi

step "Ready"

# Docker Desktop publishes the ingress controller's LoadBalancer on localhost:80 and :443,
# so the app is reachable once dinner.local points at localhost. Both lines are
# needed: without the IPv6 one, macOS first asks Bonjour about the `.local`
# name, which adds a 5-second delay to every request.
for line in "127.0.0.1 ${HOST}" "::1 ${HOST}"; do
  if ! grep -qE "^${line%% *}[[:space:]]+${HOST}([[:space:]]|\$)" /etc/hosts 2>/dev/null; then
    echo "Add this line to /etc/hosts (needs sudo, so this script will not do it):"
    echo
    echo "  echo '${line}' | sudo tee -a /etc/hosts"
    echo
  fi
done

# The ingress controller takes a few seconds to pick up a new Ingress. The certificate is checked against
# mkcert's own authority when mkcert is there (otherwise against the system's, which `mkcert -install` extends).
# (The ${…+…} form: macOS ships bash 3.2, where an empty array is an unbound variable under `set -u`.)
CURL_TRUST=()
if command -v mkcert >/dev/null 2>&1 && [ -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
  CURL_TRUST=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
for _ in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 3 --fail ${CURL_TRUST[@]+"${CURL_TRUST[@]}"} --resolve "${HOST}:443:127.0.0.1" "https://${HOST}/healthz"; then
    echo "Open https://${HOST} (a device that has not opened its access link yet needs it first: npm run k8s:access-link)"
    exit 0
  fi
  sleep 1
done

echo "The app is deployed, but https://${HOST} did not answer through the ingress on" >&2
echo "localhost:443, or its certificate is not trusted (run 'mkcert -install'). Check that nothing" >&2
echo "else holds port 443 and that the ingress controller has an address:" >&2
echo "  kubectl --context $CLUSTER -n ingress-nginx get svc" >&2
exit 1
