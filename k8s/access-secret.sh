# The dinner-planner-access Secret: the one shared key the app asks every browser for (lib/access.ts), kept out of the
# repository. Sourced by deploy.sh, which creates it once, by rotate-access-key.sh, which replaces it, and by
# access-link.sh, which reads it. The app reads it through `envFrom` (app.yaml) as ACCESS_KEY.
ACCESS_SECRET=dinner-planner-access

# 256 random bits as 43 URL-safe characters: it goes into a link after `#`, so it needs no escaping.
new_access_key() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }

# The Secret's manifest: access_secret_manifest <key>. Piped into `kubectl create -f -` (or `replace`), never
# `apply`, so the key is in no command line and in no last-applied annotation.
access_secret_manifest() {
  cat <<MANIFEST
apiVersion: v1
kind: Secret
metadata:
  name: ${ACCESS_SECRET}
  namespace: dinner-planner
stringData:
  ACCESS_KEY: "$1"
MANIFEST
}

# The private link for a key: access_link <host> <key>. The key follows `#`, which no server ever receives.
access_link() { printf 'https://%s/access#%s' "$1" "$2"; }
