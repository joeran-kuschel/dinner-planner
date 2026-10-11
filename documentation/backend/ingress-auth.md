# Login on the Ingress (basic auth)

`http://dinner.local` asks for a user name and password before it shows anything. The nginx ingress controller does
this, with HTTP basic auth configured on this app's Ingress (`k8s/ingress.yaml`); the app itself has no login and
stays stateless. It protects the cluster deployment only: `npm run dev` and the tests do not go through the Ingress.

| | |
|---|---|
| User | `dinner` |
| Password | random, printed once when the Secret is created |
| Stored in | the `dinner-planner-auth` Secret, as a hash (`apr1`), never as the password |
| Annotations | `auth-type: basic`, `auth-secret: dinner-planner-auth`, `auth-realm: Dinner Planner`, on this Ingress only |

The nginx controller is shared with other apps and is never changed.

## How the Secret is made

The Secret is not a manifest in `k8s/`, like the database one ([database-credentials.md](database-credentials.md)).
`npm run k8s:deploy` renders it from `k8s/auth-secret.sh`:

- **No Secret yet:** it creates one with a random password, **prints the password once** and keeps only the hash.
  Save it then (a password manager, for instance). The password goes through stdin only, so it is in no command line
  or log.
- **A Secret exists:** it is kept, and nothing is printed.

The first deploy after this feature shipped therefore printed the password; if you missed it, rotate it.

## Forgotten or leaked password: `npm run k8s:rotate-auth-password`

Writes a new random password into the Secret and prints it once. Nothing restarts: nginx reads the Secret again by
itself, and the old password stops working within seconds. The script stops with a hint when the Secret does not
exist yet (run `npm run k8s:deploy` first).

## What is and is not covered

- **Covered:** every page, server action and route handler reached through `http://dinner.local`, including the
  recipe import and the photos. `deploy.sh` treats the Ingress's `401` as "up", since it asks without the login. That proves the Ingress is
  running and asking, not that the app answers behind it; the `rollout status` waits before it cover the app.
- **Not covered:** the pod's own readiness and liveness probes and the hourly backup job. They talk to the pod and
  Postgres directly, not through the Ingress.
- **Limits:** basic auth has no sign-out (close the browser to forget it), the browser sends the login with every
  request, and over plain HTTP it is not encrypted. On `localhost` that is acceptable; over a network it would need
  TLS. A login in the app itself is a separate issue
  ([#59](https://github.com/joeran-kuschel/dinner-planner/issues/59)).
- **Curl:** `curl -u dinner http://dinner.local/` asks for the password; do not put it in the command line.

## Tests

`tests/infra/k8s.test.ts` checks the annotations, that the Secret renders as an htpasswd line nginx accepts, and that
no hash or password is in a manifest, script or document. `tests/infra/k8s-deploy-scripts.test.ts` covers creating
and keeping the Secret and the `401` check; `tests/infra/auth-rotate-script.test.ts` covers the rotation.
