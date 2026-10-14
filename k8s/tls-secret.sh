# The dinner-planner-tls Secret: the certificate and key for https://dinner.local, kept out of the repository. Sourced
# by deploy.sh, which creates it once, and by renew-tls.sh, which replaces it. The Ingress names it (ingress.yaml).
#
# The certificate comes from mkcert, whose local certificate authority the owner has installed in the macOS trust
# store (`mkcert -install`); a certificate from it opens in the browser without a warning. The key only ever lives in a
# temporary directory that is removed again, and the Secret is made with `kubectl create`, never `apply`: apply would
# copy the key into a last-applied annotation of its own.
TLS_SECRET=dinner-planner-tls

# Stops with the install commands unless mkcert and its certificate authority are there. Never installs anything and
# never touches the trust store: both need the owner's say-so.
require_mkcert() {
  if ! command -v mkcert >/dev/null 2>&1; then
    echo "mkcert is needed once, to make the certificate for https://$1. Install it and its local certificate authority with:" >&2
    echo >&2
    echo "  brew install mkcert && mkcert -install" >&2
    echo >&2
    echo "then run this again. (Nothing is installed or trusted by this script.)" >&2
    return 1
  fi
  if [ ! -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
    echo "mkcert has no certificate authority yet, so a browser would not trust its certificate. Create and trust it with:" >&2
    echo >&2
    echo "  mkcert -install" >&2
    echo >&2
    echo "then run this again." >&2
    return 1
  fi
}

# The Secret's manifest for <host>: tls_secret_manifest <host>. The key travels through a pipe, never a command line.
tls_secret_manifest() {
  : "${KUBE_CONTEXT:?the caller sets the context}" "${NAMESPACE:?the caller sets the namespace}"
  local dir
  dir="$(mktemp -d)"
  # The key goes with the directory on every way out, a Ctrl-C included. The path is expanded now, so the trap
  # needs no variable that has gone out of scope by then.
  trap "rm -rf '$dir'" EXIT INT TERM
  if ! mkcert -cert-file "$dir/tls.crt" -key-file "$dir/tls.key" "$1" >/dev/null 2>&1; then
    rm -rf "$dir"
    echo "mkcert could not make a certificate for $1." >&2
    return 1
  fi
  local status=0
  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" create secret tls "$TLS_SECRET" \
    --cert "$dir/tls.crt" --key "$dir/tls.key" --dry-run=client -o yaml || status=$?
  rm -rf "$dir"
  trap - EXIT INT TERM
  return $status
}
