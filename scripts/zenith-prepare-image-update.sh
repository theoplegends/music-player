#!/usr/bin/env bash
# Runs in CI after a trusted publish. Verifies the published image anonymously,
# boots it, and prepares a reviewable digest update for zenith-compose.yml.
# Requires: IMAGE_TAGS, IMAGE_DIGEST, SOURCE_SHA.
set -euo pipefail

: "${IMAGE_TAGS:?IMAGE_TAGS is required}"
: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
: "${SOURCE_SHA:?SOURCE_SHA is required}"

OUT_DIR="zenith-image-update"
COMPOSE_FILE="zenith-compose.yml"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown}/actions/runs/${GITHUB_RUN_ID:-0}"

# The repository part of the first published tag, without its tag suffix.
IMAGE_NAME="$(printf '%s\n' "$IMAGE_TAGS" | head -n1 | python3 -c 'import sys;r=sys.stdin.read().strip();print(r.rsplit(":",1)[0] if ":" in r.rsplit("/",1)[-1] else r)')"
IMAGE_REF="${IMAGE_NAME}@${IMAGE_DIGEST}"

mkdir -p "$OUT_DIR"

echo "Verifying anonymous registry access for ${IMAGE_REF}"
CHECK_JSON=""
for attempt in 1 2 3 4 5; do
  if CHECK_JSON="$(python3 scripts/zenith-check-image.py "$IMAGE_REF" 2>"$OUT_DIR/check-error.txt")"; then
    break
  fi
  if [ "$attempt" -eq 5 ]; then
    echo "FAIL: anonymous registry check did not succeed after 5 attempts" >&2
    cat "$OUT_DIR/check-error.txt" >&2
    echo "If publication succeeded, the package may not be public yet." >&2
    exit 1
  fi
  echo "Attempt ${attempt} failed; retrying for registry propagation..."
  sleep $((attempt * 10))
done
rm -f "$OUT_DIR/check-error.txt"
printf '%s\n' "$CHECK_JSON" > "$OUT_DIR/registry-check.json"

# The checker resolves the top-level (index) digest; deploy that, not a child.
TOP_REF="$(printf '%s' "$CHECK_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["image"])')"
echo "Verified top-level reference: ${TOP_REF}"

echo "Pulling and booting ${TOP_REF} without registry credentials"
TMP_DOCKER_CONFIG="$(mktemp -d)"
cleanup_config() { rm -rf "$TMP_DOCKER_CONFIG"; }
trap cleanup_config EXIT
DOCKER_CONFIG="$TMP_DOCKER_CONFIG" docker pull --platform linux/amd64 "$TOP_REF"
DOCKER_CONFIG="$TMP_DOCKER_CONFIG" bash scripts/zenith-smoke.sh "$TOP_REF"

python3 - "$TOP_REF" "$IMAGE_DIGEST" "$SOURCE_SHA" "$RUN_URL" "$OUT_DIR" <<'PY'
import json, sys, pathlib
ref, digest, sha, run_url, out_dir = sys.argv[1:6]
pathlib.Path(out_dir, "image.json").write_text(json.dumps({
    "image": ref,
    "digest": digest,
    "platform": "linux/amd64",
    "source_sha": sha,
    "run_url": run_url,
    "verified": "anonymous manifest/config check, anonymous pull, and smoke boot",
}, indent=2) + "\n")
PY
echo "Wrote ${OUT_DIR}/image.json"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "No ${COMPOSE_FILE} yet; image.json is the handoff for the compose PR."
else
  python3 - "$COMPOSE_FILE" "$IMAGE_NAME" "$TOP_REF" "$SOURCE_SHA" "$OUT_DIR" <<'PY'
import sys, pathlib, re

compose_file, image_name, new_ref, sha, out_dir = sys.argv[1:6]
original = pathlib.Path(compose_file).read_text()

# Only touch image lines belonging to this publishing workflow's image.
pattern = re.compile(r'^(\s*image:\s*)(' + re.escape(image_name) + r'[@:][^\s#]+)(\s*(?:#.*)?)$', re.M)
matches = pattern.findall(original)
if len(matches) == 0:
    sys.exit(f"FAIL: no image line for {image_name} in {compose_file}")
if len({m[1] for m in matches}) > 1:
    sys.exit(f"FAIL: ambiguous {image_name} references in {compose_file}; refusing to edit")

old_ref = matches[0][1]
if old_ref == new_ref:
    print("Compose already pins this digest; nothing to prepare.")
    raise SystemExit(0)

updated = pattern.sub(lambda m: f"{m.group(1)}{new_ref}{m.group(3)}", original)
out = pathlib.Path(out_dir)
(out / compose_file).write_text(updated)
(out / "compose-update.json").write_text(
    f'{{\n  "file": "{compose_file}",\n  "old_image": "{old_ref}",\n'
    f'  "new_image": "{new_ref}",\n  "source_sha": "{sha}"\n}}\n')
print(f"Prepared digest update: {old_ref} -> {new_ref}")
PY

  if [ -f "$OUT_DIR/$COMPOSE_FILE" ]; then
    diff -u "$COMPOSE_FILE" "$OUT_DIR/$COMPOSE_FILE" > "$OUT_DIR/compose.patch" || true
    docker compose -f "$OUT_DIR/$COMPOSE_FILE" config --quiet
    echo "Validated the prepared manifest."
  fi
fi

{
  echo "### Zenith image prepared"
  echo
  echo "- Image: \`${TOP_REF}\`"
  echo "- Source commit: \`${SOURCE_SHA}\`"
  echo "- Verified: anonymous manifest/config, anonymous pull, smoke boot"
  echo
  echo "This is a prepared, reviewable update. It does not deploy anything on Zenith."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
