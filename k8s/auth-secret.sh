# The dinner-planner-auth Secret: the login that the Ingress asks for (HTTP basic auth), kept out of the repository.
# Sourced by deploy.sh, which creates it once with a random password, and by rotate-auth-password.sh, which replaces
# it. The Secret holds only the password's hash; the nginx ingress controller reads it through the Ingress's
# `auth-secret` annotation (ingress.yaml).
AUTH_SECRET=dinner-planner-auth
AUTH_USER=dinner

# A password that is easy to type and needs no escaping.
new_auth_password() { openssl rand -hex 12; }

# The Secret's manifest: auth_secret_manifest <user> <password>. Piped into `kubectl apply -f -`, so the password
# never appears in a command line. nginx wants an htpasswd line in the key `auth`; apr1 is the hash it understands.
auth_secret_manifest() {
  local hash
  hash="$(printf '%s' "$2" | openssl passwd -apr1 -stdin)"
  cat <<MANIFEST
apiVersion: v1
kind: Secret
metadata:
  name: ${AUTH_SECRET}
  namespace: dinner-planner
stringData:
  auth: "$1:${hash}"
MANIFEST
}
