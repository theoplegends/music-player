#!/usr/bin/env bash
# Boots a built image and checks that the real app answers on its internal port.
# Usage: scripts/zenith-smoke.sh IMAGE_REF
set -euo pipefail

IMAGE="${1:?usage: scripts/zenith-smoke.sh IMAGE_REF}"
HOST_PORT="${SMOKE_PORT:-18080}"
CONTAINER="zenith-smoke-$$"
BASE="http://127.0.0.1:${HOST_PORT}"

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- container logs ---" >&2
    docker logs "$CONTAINER" >&2 2>&1 || true
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

echo "Starting $IMAGE as $CONTAINER on :${HOST_PORT}"
docker run -d --name "$CONTAINER" --platform linux/amd64 \
  -p "127.0.0.1:${HOST_PORT}:8080" "$IMAGE" >/dev/null

# Bounded wait for readiness.
deadline=$((SECONDS + 60))
until curl -fsS "${BASE}/healthz" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "FAIL: app did not become ready within 60s" >&2
    exit 1
  fi
  if ! docker ps -q --filter "name=^${CONTAINER}$" | grep -q .; then
    echo "FAIL: container exited before becoming ready" >&2
    exit 1
  fi
  sleep 1
done

echo "Checking /healthz"
health="$(curl -fsS "${BASE}/healthz")"
case "$health" in
  *'"status":"ok"'*) ;;
  *) echo "FAIL: unexpected /healthz body: $health" >&2; exit 1 ;;
esac

echo "Checking the app page"
page="$(curl -fsS "${BASE}/")"
for marker in 'id="player-container"' 'id="playlist"' 'id="equalizer"' 'id="save-playlist"'; do
  case "$page" in
    *"$marker"*) ;;
    *) echo "FAIL: app page is missing $marker" >&2; exit 1 ;;
  esac
done

# The browser build must not depend on the removed Electron preload bridge.
case "$page" in
  *'window.electron'*) echo "FAIL: page still references the Electron bridge" >&2; exit 1 ;;
esac

echo "Checking static assets"
asset_type="$(curl -fsS -o /dev/null -w '%{content_type}' "${BASE}/assets/icon.png")"
case "$asset_type" in
  image/png*) ;;
  *) echo "FAIL: /assets/icon.png served as '$asset_type'" >&2; exit 1 ;;
esac

echo "Checking the container runs unprivileged"
runtime_user="$(docker exec "$CONTAINER" id -un)"
if [ "$runtime_user" = "root" ]; then
  echo "FAIL: container runs as root" >&2
  exit 1
fi

echo "PASS: $IMAGE serves the Music Player app as '$runtime_user' on port 8080"
