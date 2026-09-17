# Zenith deployment

How this repository is built, published, and proposed to Zenith.

## What is deployed

Music Player is a **client-side** browser app. `server.js` is a dependency-free
Node static server that serves `index.html` and `assets/`. There is no backend,
no database, and no server-side user data: playlists, the chosen theme, and file
handles live in the visitor's own browser (`localStorage` and IndexedDB).

The Electron desktop shell (`main.js`, `npm start`) is unrelated to hosting. It
loads the same `index.html` and is not part of the container image.

## Runtime contract

| Property | Value |
| --- | --- |
| Production platform | `linux/amd64` |
| Internal HTTP port | `8080` (override with `PORT`) |
| Bind address | `0.0.0.0` (override with `HOST`) |
| Process | `node server.js` |
| Container user | `node` (unprivileged) |
| Health endpoint | `GET /healthz` → `{"status":"ok"}` |
| Required services | none |
| Durable volumes | none — all state is client-side |
| Secrets / env config | none |
| Outbound dependency | `unpkg.com` for the Phosphor icon font (icons only) |

Zenith terminates TLS, so the container speaks plain HTTP on its internal port.

Note: the File System Access API used for playlist persistence requires a secure
context. It works on Zenith (HTTPS) and on `localhost`; over plain HTTP the app
falls back to `<input type="file">` and playlists restore track names only.

## Build

- Build context: repository root
- Dockerfile: `Dockerfile`
- Build inputs: `index.html`, `server.js`, `assets/**`, `Dockerfile`, `.dockerignore`
- No `npm install`: the server uses only the Node standard library

## Checks

```sh
# Serve locally without Docker
npm run serve            # http://localhost:8080

# Build and boot the image exactly as CI does
docker build --platform linux/amd64 -t zenith-smoke .
bash scripts/zenith-smoke.sh zenith-smoke
```

`scripts/zenith-smoke.sh` boots the image and asserts the real app page, its
static assets, the health endpoint, the absence of the removed Electron bridge,
and that the container does not run as root. A green build alone is not a pass.

## Publish → verify → propose → review

1. Merging to `main` runs `.github/workflows/publish-container.yml`, which builds
   `linux/amd64` and pushes to `ghcr.io/theoplegends/music-player`, tagged
   `sha-<commit>`.
2. `scripts/zenith-prepare-image-update.sh` then verifies the published image
   **anonymously** with `scripts/zenith-check-image.py`, pulls it with a throwaway
   Docker config, and re-runs the smoke test against the pulled digest.
3. It uploads a `zenith-image-<sha>` artifact containing `image.json` (the verified
   immutable digest, source commit, and run URL) and, once `zenith-compose.yml`
   exists, an updated manifest plus a patch.
4. An agent or maintainer turns that artifact into a reviewed PR that repins the
   digest in `zenith-compose.yml`. CI never pushes to `main` and never opens PRs
   on its own.
5. After that PR merges, submit the repository on Zenith's **Publish an app** page.

Publishing an image does not update the Zenith catalogue, and merging here does not
update a running Zenith deployment. Both remain separate, deliberate steps.

## GHCR package visibility

Zenith pulls anonymously, so `ghcr.io/theoplegends/music-player` must stay publicly
pullable. This is verified on every publish: `scripts/zenith-prepare-image-update.sh`
runs `scripts/zenith-check-image.py` with no credentials and then pulls the image
with a throwaway Docker config. Confirmed working as of the first publish
(`d56ed0a`).

To check by hand at any time:

```sh
DOCKER_CONFIG=$(mktemp -d) python3 scripts/zenith-check-image.py \
  ghcr.io/theoplegends/music-player@sha256:<digest>
```

If anonymous access is ever denied, find the package under
<https://github.com/theoplegends?tab=packages> and set
**Package settings → Change visibility → Public**. That is an owner action; GitHub
offers no REST endpoint for it, and a public package cannot be made private again.
