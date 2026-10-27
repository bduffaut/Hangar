# Fixtures

Small apps that integration tests deploy end to end. Each one answers `GET /` with a line containing
its name, so tests can tell which version is serving.

| Fixture              | Built by   | Checks                                                          |
| -------------------- | ---------- | --------------------------------------------------------------- |
| `static-site`        | Railpack   | Static detection (`index.html`), served by Caddy                |
| `node-express`       | Railpack   | Node detection, `npm start`, listens on `PORT`                  |
| `vite-app`           | Railpack   | Vite build, served as a static SPA                              |
| `dockerfile-app`     | Dockerfile | Port from `EXPOSE`, build secrets, runtime env vars             |
| `broken-healthcheck` | Dockerfile | Crashes on start, so the deploy fails and the old version stays |
