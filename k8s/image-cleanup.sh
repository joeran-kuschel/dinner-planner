# Old images of this project on the cluster node and the host, and the free disk space of the node. Sourced by
# deploy.sh (it needs KUBECTL, NAMESPACE and NODE).
#
# Every deploy imports two new images under a timestamp tag and nothing ever removed the older ones, so the disk of
# Docker Desktop's VM filled up until Postgres could not start. Only `dinner-planner` and `dinner-planner-migrator`
# images with a 14-digit timestamp tag are ever touched: the node is shared with other apps.
IMAGE_TAG_PATTERN='^(docker\.io/library/)?(dinner-planner|dinner-planner-migrator):[0-9]{14}$'

# A deploy stops under this much free space on the node (2 GiB: a build and the two imports need about 1.1 GiB).
MIN_FREE_KB=2097152

# stale_images <tag>...: image references on stdin; prints those of this project with a timestamp tag that is not
# one of the tags given.
stale_images() {
  local keep=" $* " ref tag
  while IFS= read -r ref; do
    [[ $ref =~ $IMAGE_TAG_PATTERN ]] || continue
    tag="${ref##*:}"
    case "$keep" in *" $tag "*) continue ;; esac
    printf '%s\n' "$ref"
  done
}

# The tags of this project's images that a pod uses right now, one per line. A pod can be started from any of them
# (`imagePullPolicy: Never`: an image that is gone is gone). Fails, with no output, when the pods cannot be read, so
# nothing is ever removed on a guess.
tags_in_use() {
  local images image
  images="$("${KUBECTL[@]}" -n "$NAMESPACE" get pods \
    -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{range .spec.initContainers[*]}{.image}{"\n"}{end}{end}' 2>/dev/null)" || return 1
  while IFS= read -r image; do
    [[ $image =~ $IMAGE_TAG_PATTERN ]] && printf '%s\n' "${image##*:}"
  done <<<"$images" || true
}

# digest_refs <digest>...: `ctr images ls` on stdin; prints the references named `sha256:…` whose digest is one of those
# given and which no tagged reference shares. Importing an image makes a second reference like that next to its tag, and
# removing only the tag leaves it holding every layer.
orphan_refs() {
  awk -v digests=" $* " '
    NR > 1 {
      name[NR] = $1; digest[NR] = $3
      if ($1 !~ /^sha256:/) tagged[$3] = 1
    }
    END {
      for (i in name) if (name[i] ~ /^sha256:/ && index(digests, " " digest[i] " ") && !tagged[digest[i]]) print name[i]
    }'
}

# prune_images <tag>...: removes this project's images from the node and the host, except those with a tag given and
# those a pod uses. Removes nothing at all when it cannot tell what is in use (the rollback tag or the pods could not be
# read). A failure to remove only prints a warning: a deploy never fails over this.
prune_images() {
  local keep used ref listing freed
  if [ "${ROLLBACK_KNOWN:-1}" != 1 ] || ! used="$(tags_in_use)"; then
    echo "Warning: could not tell which images are in use, so no old images were removed." >&2
    return 0
  fi
  keep="$* $(printf '%s' "$used" | tr '\n' ' ')"

  listing="$(docker exec "$NODE" ctr --namespace k8s.io images ls 2>/dev/null || true)"
  freed=""
  # shellcheck disable=SC2086 # the tags are words
  while IFS= read -r ref; do
    if docker exec "$NODE" ctr --namespace k8s.io images rm --sync "$ref" >/dev/null 2>&1; then
      echo "Removed $ref from the node."
      freed="$freed $(printf '%s\n' "$listing" | awk -v r="$ref" '$1 == r {print $3}')"
    else
      echo "Warning: could not remove $ref from the node." >&2
    fi
  done < <(printf '%s\n' "$listing" | awk 'NR > 1 {print $1}' | stale_images $keep)

  # The second reference of each removed image (see `orphan_refs`), once no tag is left that shares its digest.
  if [ -n "$freed" ]; then
    listing="$(docker exec "$NODE" ctr --namespace k8s.io images ls 2>/dev/null || true)"
    # shellcheck disable=SC2086
    while IFS= read -r ref; do
      if docker exec "$NODE" ctr --namespace k8s.io images rm --sync "$ref" >/dev/null 2>&1; then
        echo "Removed $ref from the node."
      else
        echo "Warning: could not remove $ref from the node." >&2
      fi
    done < <(printf '%s\n' "$listing" | orphan_refs $freed)
  fi

  # shellcheck disable=SC2086
  while IFS= read -r ref; do
    if docker image rm "$ref" >/dev/null 2>&1; then
      echo "Removed $ref from the host."
    else
      echo "Warning: could not remove $ref from the host." >&2
    fi
  done < <({ docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || true; } | stale_images $keep)
  return 0
}

# The node's free disk space in KiB; empty when it cannot be read.
node_free_kb() { docker exec "$NODE" df -Pk / 2>/dev/null | awk 'NR==2 {print $4}'; }

# ensure_free_space <tag>...: returns 0 when the node has room for a deploy. Under MIN_FREE_KB it first removes the
# old images of this project (keeping the tags given and the ones in use), and fails only if that is not enough.
ensure_free_space() {
  local free
  free="$(node_free_kb)"
  # Not measurable (no df, an odd answer): do not stop a deploy over it.
  [[ $free =~ ^[0-9]+$ ]] || return 0
  [ "$free" -ge "$MIN_FREE_KB" ] && return 0

  echo "Only $((free / 1024)) MB are free on the node (a deploy wants $((MIN_FREE_KB / 1024)) MB): removing old images first."
  prune_images "$@"
  free="$(node_free_kb)"
  if [[ $free =~ ^[0-9]+$ ]] && [ "$free" -ge "$MIN_FREE_KB" ]; then
    echo "$((free / 1024)) MB are free now."
    return 0
  fi

  {
    echo "Not enough disk space on the node: $(( ${free:-0} / 1024 )) MB free, $((MIN_FREE_KB / 1024)) MB needed. Nothing was deployed."
    echo "Removing this project's old images was not enough, so the space is held by something else in Docker Desktop's disk:"
    echo "  docker system df            # images, volumes and build cache"
    echo "  docker builder prune        # the build cache, which any project can rebuild"
    echo "  docker volume ls            # old volumes (of other tools or clusters) that nothing uses"
    echo "Free some space, then run the deploy again."
  } >&2
  return 1
}
