---
paths:
  - "proxy.ts"
  - "lib/access*.ts"
  - "app/access/**"
---

# Access key

Details: `documentation/backend/access-key.md`.

- One shared access key guards the whole app. `proxy.ts` lets a request through only with a valid `dp_access` cookie
  (`lib/access.ts`: `v1.<expires>.<HMAC>`, signed with a secret derived from `ACCESS_KEY`, so it cannot be forged and a new key logs
  every device out). `/healthz` (the probes) and `/access` (which hands the cookie out) are the only open paths.
- Every server action calls `await requireAccess()` first and every route handler `accessRefusal()` (`lib/access-guard.ts`), because
  the proxy should not be the only gate; `tests/infra/access.test.ts` fails when one is missing.
- Without a key the app is open outside production (`npm run dev`, Vitest) and refuses everything with 503 in production (the image
  sets `NODE_ENV=production`), so a missing Secret never leaves it open.
- The key is a Secret (`dinner-planner-access`) that `deploy.sh` makes once; `npm run k8s:access-link` prints the private link
  `https://dinner.local/access#<key>` (the key after `#` never reaches a server or a log) and `npm run k8s:rotate-access-key`
  replaces it.
