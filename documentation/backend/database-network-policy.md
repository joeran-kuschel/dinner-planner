# Network policy for the database

The cluster is shared with other apps, and without a policy any pod in it, in any namespace, can open a connection
to `dinner-planner-db:5432`; only the database login stands in the way. `k8s/network-policy.yaml` lets only this
app's pods reach the database.

## What it allows

The `NetworkPolicy` `dinner-planner-db-from-app` selects the database pod (`app: dinner-planner-db`) and admits TCP
5432 from two kinds of pod **in the same namespace**:

| Pod label | Who |
|---|---|
| `app: dinner-planner` | the app, and its `migrate` init container, which runs in the same pod |
| `app: dinner-planner-seed` | the one-off seed Job (`npm run k8s:seed`, `k8s/seed-job.yaml`) |

Everything else is refused: a pod with another label in this namespace, and any pod in another namespace (a
`podSelector` alone never matches across namespaces). A refused connection does not get an error, it times out.

It is a policy for **ingress only**. The app is still reached through the Ingress, so it does not replace the login
([access key](access-key.md)); it only protects the database.

## What it does not touch

Only connections between pods are filtered. These keep working:

- the kubelet's probes (`pg_isready` runs inside the pod),
- `kubectl exec` into the database pod: `npm run k8s:backup`, `k8s:restore`, `k8s:rotate-db-password` and the hourly
  launchd backup all go through `pg_exec` in `k8s/db-common.sh`,
- a remote database named in `DATABASE_URL`.

A pod you start by hand, for example `kubectl run … psql`, is refused. Use `kubectl exec -it statefulset/dinner-planner-db
-n dinner-planner -- psql …` instead, or give the pod the label `app: dinner-planner-seed`. Not `app: dinner-planner`: the
app's Service selects that label, so the pod would briefly be an endpoint for real traffic.

## Things to keep in mind

- **A new kind of pod that needs the database needs a label here.** The seed Job is the example: its pod template carries
  `app: dinner-planner-seed` for this reason. `tests/infra/k8s.test.ts` checks that the policy names the labels the app
  and the seed Job really have.
- **Enforcement depends on the cluster's network plugin.** Docker Desktop's kind cluster uses kindnet, which enforces
  policies; on a cluster whose plugin ignores them the object is applied and does nothing.
- **A policy only applies to new connections.** After the first deploy, restart the app pods
  (`kubectl --context docker-desktop -n dinner-planner rollout restart deployment/dinner-planner`) so they connect
  under it.

## Checking it by hand

After a deploy, with throwaway pods that are removed again (`--rm`); `nc` comes with the busybox image:

```bash
# Another label, same namespace: times out
kubectl --context docker-desktop -n dinner-planner run np-test --rm -i --restart=Never --image=busybox:1.37 \
  -- nc -zv -w 5 dinner-planner-db 5432
# Another namespace: times out
kubectl --context docker-desktop -n default run np-test --rm -i --restart=Never --image=busybox:1.37 \
  -- nc -zv -w 5 dinner-planner-db.dinner-planner 5432
# A label the policy lets in: open (the seed Job's label, since a pod labelled app=dinner-planner would also receive traffic from the Service)
kubectl --context docker-desktop -n dinner-planner run np-test --rm -i --restart=Never --labels=app=dinner-planner-seed \
  --image=busybox:1.37 -- nc -zv -w 5 dinner-planner-db 5432
```
