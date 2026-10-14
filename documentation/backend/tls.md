# HTTPS for dinner.local

The cluster serves the app at `https://dinner.local` (`http://dinner.local` redirects there), so what is sent to and
from it cannot be read or changed by others on the same network. The certificate is made by
[mkcert](https://github.com/FiloSottile/mkcert), whose local certificate authority is in the owner's macOS trust store
(`mkcert -install`), so the browser shows no warning. It is the same setup the time tracking tool already uses on this
cluster's shared ingress controller.

## What is where

- `k8s/ingress.yaml`: a `tls` section for `dinner.local` that names the Secret `dinner-planner-tls`, and the annotation
  `nginx.ingress.kubernetes.io/ssl-redirect: "true"` for the http redirect. Both are on this app's Ingress only; the
  shared controller is never changed (`tests/infra/k8s.test.ts` checks).
- The Secret `dinner-planner-tls` is **not a manifest**, so no certificate or key is ever in the repository. It is made
  by `deploy.sh` through `k8s/tls-secret.sh`, once: an existing Secret is kept, like the database Secret.
- `k8s/tls-secret.sh`: `require_mkcert` and `tls_secret_manifest <host>`. The manifest comes from
  `kubectl create secret tls … --dry-run=client -o yaml`, with the key in a temporary directory that is removed again
  and travelling through a pipe, so it is in no command line. It is created with `create` or `replace`, never `apply`,
  because `apply` copies the whole Secret, key included, into a `last-applied-configuration` annotation.

## The first deploy

`npm run k8s:deploy` checks for the Secret before it builds anything. If it is missing it needs mkcert and its
certificate authority. Without them it stops and prints the commands, and installs and trusts nothing by itself:

```bash
brew install mkcert && mkcert -install   # once per machine; mkcert -install asks for your password
```

Afterwards the deploy checks `https://dinner.local/healthz` against mkcert's authority and prints the address. The
Kubernetes probes talk to the pod directly and are not affected.

## Renewing

mkcert certificates last about two years and three months. When the browser reports an expired certificate, run
`npm run k8s:renew-tls`: it makes a new certificate and replaces the Secret (it creates it if it is missing). The
ingress controller reloads the new Secret by itself; nothing restarts.

## Other devices

A phone or another computer does not trust your mkcert authority, so it shows a certificate warning. To trust it there,
install the authority's root certificate (`rootCA.pem` in the folder `mkcert -CAROOT` prints) on that device. The
authority's key (`rootCA-key.pem`) never leaves this machine.

## What it does not do

- No HSTS header: browsers cache it, and an expired local certificate could then lock the app out with no way to click
  through. Cookie flags such as `Secure` belong with the access key ([#68](https://github.com/joeran-kuschel/dinner-planner/issues/68)).
- It does not restrict who can reach the ingress: Docker Desktop publishes ports 80 and 443 on every network
  interface. TLS protects the traffic, not the access.

## Tests

- `tests/infra/k8s.test.ts` ("HTTPS"): the `tls` section and the Secret's name, the redirect, `create`/`replace` and no
  `apply`, no change to the shared controller, no certificate or key in any tracked file.
- `tests/infra/k8s-deploy-scripts.test.ts`: `deploy.sh` and `renew-tls.sh` against fake `kubectl`, `docker`, `curl`
  and `mkcert`: the Secret is made once and kept, the key is in no command line, log or leftover file, and a missing
  mkcert or certificate authority stops the deploy before anything is built.
