# Where the planner is reached: the port that the shared ingress controller publishes for HTTPS. Sourced by deploy.sh and
# access-link.sh, after they set KUBE_CONTEXT. The controller is shared with other apps and never changed here, so its
# Service says which port it is: Docker Desktop's default is 443, but another program on the machine can hold 443 and then
# the controller is installed with another one (8443 on 2026-11-28, when a Caddy of another project held 443).

# The controller Service's HTTPS port; 443 when it cannot be read.
ingress_https_port() {
  local port
  port="$(kubectl --context "$KUBE_CONTEXT" -n ingress-nginx get svc ingress-nginx-controller \
    -o 'jsonpath={.spec.ports[?(@.name=="https")].port}' 2>/dev/null || true)"
  case "$port" in
    '' | *[!0-9]*) echo 443 ;;
    *) echo "$port" ;;
  esac
}

# The address of a host on that port: site_address <host> [port]. No port is written for 443.
site_address() {
  local port="${2:-$(ingress_https_port)}"
  if [ "$port" = 443 ]; then printf 'https://%s' "$1"; else printf 'https://%s:%s' "$1" "$port"; fi
}
