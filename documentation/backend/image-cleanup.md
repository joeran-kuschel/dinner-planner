# Image cleanup and disk space

`npm run k8s:deploy` builds two images (`dinner-planner:<timestamp>` and `dinner-planner-migrator:<timestamp>`) and imports them into
Docker Desktop's Kubernetes node. Nothing used to remove the older ones, and the node's disk is the disk of Docker Desktop's whole
VM: on 2026-10-16 it was full (59 GB, none free), Postgres could not write its lock file and stayed in `CrashLoopBackOff`, and a
migration that was cut off had to be marked rolled back by hand ([#84](https://github.com/joeran-kuschel/dinner-planner/issues/84)).
`k8s/image-cleanup.sh`, sourced by `deploy.sh`, prevents that.

## What is removed

After the new version is running (`rollout status` succeeded), `prune_images` removes, from the node (`ctr --namespace k8s.io images rm
--sync`) and from the host (`docker image rm`), every image that

- is `dinner-planner` or `dinner-planner-migrator` (with or without the `docker.io/library/` prefix) **and** has a 14-digit timestamp tag
  (`IMAGE_TAG_PATTERN`), **and**
- is not one of the tags kept.

**Kept:** the tag just deployed; the tag the Deployment ran before this deploy (read from the Deployment before the manifests are
applied; empty on the first deploy), so there is always one version to go back to; and every tag a pod in the namespace uses right now.
Nothing else is ever touched: not `postgres`, not another app's images on the shared node (`watchlist-*`, `time-tracking-*`), not
`dinner-planner:dev`, `dinner-planner-seed` or an image without a timestamp tag, and not the untagged `sha256:` layers.

**The second reference.** Importing an image makes a second reference next to its tag, named `sha256:…` and with the same digest, and
removing only the tag leaves it holding every layer (the first version of this cleanup freed nothing for that reason). So after the tags
are gone, `orphan_refs` also removes each `sha256:…` reference whose digest belonged to a removed tag **and that no tag still shares**:
two builds of the same content have one digest, and the one that is kept keeps its reference.

**Fails closed.** What a pod uses (`kubectl get pods`) and the tag the Deployment ran before (`get deployment`, read before the manifests
are applied, `--ignore-not-found` so the first deploy answers with nothing) are read before anything is removed. If either cannot be
read, nothing is removed and a warning says so: images are never imported again (`imagePullPolicy: Never`), so a wrong guess would be
an outage. A failure to remove one image only prints a warning, and a deploy is never failed by the cleanup.

**When it runs.** After the rollout succeeded; a failed rollout removes nothing after it. The low-space check below can remove images
earlier, before the build, with the same rules.

## The free-space check

Before it builds, `deploy.sh` reads the node's free space (`docker exec <node> df -Pk /`, the Docker VM's disk). It needs
`MIN_FREE_KB` (2 GiB; a build and the two imports take about 1.1 GiB):

1. Enough: it carries on, and removes nothing yet.
2. Less: it prints how much is free, removes the old images with the same rules as above (so it keeps what a pod uses and the
   rollback tag, and removes nothing if it cannot tell), and measures again. Enough now: it carries on.
3. Still less: it stops before building, with "Not enough disk space on the node … Nothing was deployed." and the commands for the
   rest.
4. The space cannot be read (no answer from `df`): it does not stop the deploy.

## When the disk is full anyway

The old images of this project are not the only thing in the VM. Look at where the space is:

```bash
docker system df            # images, volumes and build cache
docker builder prune        # the build cache: any project can rebuild it
docker volume ls            # volumes nothing uses (old clusters, other tools)
```

Look before you delete a volume: a volume can hold a database. Back up what you may still need (`npm run k8s:backup` for this app's
database), then remove what is really unused. If Postgres stays in `CrashLoopBackOff` after the space is back, give it a minute: its
restart back-off is a few minutes.

## Tests

`tests/infra/k8s-deploy-scripts.test.ts` runs `deploy.sh` against fake `kubectl` and `docker`: the selection (with and without the
registry prefix, every kind of image that must never be selected), what is kept (the new tag, the rollback tag, the pods' tags, on the
node and the host, also before the build), the second references (removed, or kept when a kept tag shares the digest), nothing removed
when the pods or the Deployment cannot be read, no removal after a failed rollout, a warning instead of a failure when a removal fails,
and the cases of the free-space check.
