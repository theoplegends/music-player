# Agent instructions

## Zenith deployment

This project deploys through `zenith-compose.yml`. Before changing dependencies, build output, startup commands, ports, environment variables, or persistent storage, read `.agents/skills/create-zenith-compose/SKILL.md` and `docs/zenith-deployment.md`. Refresh the upstream skill as directed, then update the Dockerfile, image workflow, and Zenith manifest where needed. Keep the image digest in sync with the release being proposed; publishing an image alone does not deploy it on Zenith.

## Application notes

The browser build in `index.html` must stay free of Electron APIs. It runs both as a
hosted web page (served by `server.js`) and inside the optional Electron desktop
shell (`main.js`), so it may only use standard web APIs. `scripts/zenith-smoke.sh`
fails the build if the page reintroduces a `window.electron` dependency.
