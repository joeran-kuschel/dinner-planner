# The access key

The planner has no accounts and no login form. One shared secret, the access key, guards everything: a browser that
holds a valid cookie made from it is let in, any other request is refused. It keeps others on the same network (see
[HTTPS](tls.md), which it needs to be worth anything) from reading or changing the recipes, the plan and the grocery
lists. A key shipped inside the frontend would be readable by anyone who loads the page, so the secret is held by the
device: a signed cookie, set once from a private link.

## The flow

1. **Setup.** `npm run k8s:deploy` makes a random 256-bit key the first time and keeps it afterwards. `npm run
   k8s:access-link` prints `https://dinner.local/access#<key>` (and a QR code when `qrencode` is installed). The key
   follows `#`, which a browser never sends to a server, so it is in no log of the app or of the shared ingress controller.
2. **First visit on a device.** The link opens `/access` (`app/access/route.ts`). Its script reads the key from the
   address, removes it from the address bar and the history at once, posts it once as JSON to `/access` and goes on to
   `/`. A wrong key shows "That link is not valid"; there is no password field. Without JavaScript the page says the
   one-time step needs it.
3. **The cookie.** `POST /access` compares the key in constant time (as digests), after a short wait when it is wrong,
   and sets `dp_access`: `HttpOnly`, `SameSite=Lax`, `Path=/`, one year, and `Secure` when the ingress says the request
   came in over HTTPS (`X-Forwarded-Proto`). `Lax`, not `Strict`: with `Strict`, a link to the planner clicked in another
   app arrives without the cookie and shows the "needs its access link" page; a cross-site POST carries no `Lax` cookie
   either way, and the origin checks stay. The cookie holds `v1.<expires>.<signature>`, signed with an HMAC secret derived
   from the key, never the key (`lib/access.ts`). Changing the key invalidates every cookie.
4. **Every day.** Nothing is visible. `proxy.ts` checks the cookie on every request, `_next` assets and server-action
   POSTs included; only `/healthz` (the Kubernetes probes) and `/access` are open. A cookie older than 30 days is renewed on
   use, so a device in use does not run out.
5. **Without the cookie.** A browser asking for a page gets a small self-contained page (401, `lib/access-pages.ts`,
   English or German by the `locale` cookie, else `Accept-Language`) saying the planner needs its access link and how to
   print it again. Everything else (a script's `fetch`, a form action, an image) gets a plain 401 with
   `{"error":"access-required"}` and no `WWW-Authenticate` header, so the browser never shows a login prompt. If a cookie
   expires while a page is open, saving shows the form's usual "could not be saved" message.
6. **Another device.** Open the link there; each device has its own cookie, all from the same key.
7. **A lost device or a leaked link.** `npm run k8s:rotate-access-key` replaces the key, restarts the app and logs every
   device out; each one needs the new link (`npm run k8s:access-link`) once.

## Two gates, not one

The proxy is the first gate. Next's guidance is that it should not be the only one, so every server action calls
`await requireAccess()` first and every route handler `accessRefusal()` (`lib/access-guard.ts`); a request that somehow
got past the proxy still reaches no data. `tests/infra/access.test.ts` reads the source and fails when an action or handler
lacks the call, so a new one cannot forget it.

## Where there is no key

- **Production without a usable key** (the image sets `NODE_ENV=production`, so the cluster pod is production): everything is
  refused with 503 except `/healthz`, so a forgotten or too short key (under 16 characters) never leaves the app open. The pod
  does not start at all without the Secret (`envFrom` in `k8s/app.yaml`), so this is a second line of defence.
- **Otherwise** (`npm run dev`, Vitest): no gate, so development needs no setup. To try it locally, put `ACCESS_KEY="…"`
  (16 characters or more) in `.env` and open `http://localhost:3000/access#…`.

## The Secret and the scripts

`dinner-planner-access` is no manifest: `deploy.sh` makes it once through `k8s/access-secret.sh` (`openssl rand`, 43
URL-safe characters) with `kubectl create`, and keeps it. `rotate-access-key.sh` replaces it with `replace` and restarts the
app. Neither uses `apply`, which would copy the key into a `last-applied-configuration` annotation, and the key only ever
travels through a pipe, never a command line. `access-link.sh` reads it and prints the link in the terminal only: the link is
a password, whoever has it has full access. All three are pinned to the `docker-desktop` context.

## Tests

- `tests/unit/lib/access.test.ts`, `access-guard.test.ts`, `access-pages.test.tsx`, `tests/unit/proxy.test.ts`,
  `tests/unit/app/access/route.test.ts`: the cookie, the modes, the guard, the pages (English, German, axe), the proxy's
  paths and answers, and `/access`.
- `tests/infra/access.test.ts`: every action and handler checks, the open paths, no key in any file, the Secret in the app
  container only. `tests/infra/k8s-deploy-scripts.test.ts`: the three scripts against fake `kubectl`.
- `tests/e2e/access.spec.ts`: the gate in a real browser, from no cookie to the right key, a wrong key, a tampered, foreign
  and expired cookie, German, and no JavaScript. The e2e server runs with a test key and every other spec starts with its
  cookie, so the whole suite runs through the gate.

## Not covered

Accounts, roles, passwords and a login form (#59 is a separate issue); a limit on tries (the key has 256 bits, and a wrong
guess waits 400 ms); revoking one device (rotating the key logs all of them out); who can reach the ingress at all (Docker
Desktop publishes it on every interface; the macOS firewall decides).
