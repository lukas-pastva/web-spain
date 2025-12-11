# Repository Guidelines

## Project Structure & Module Organization
- `src/` — Node.js service (Express + Puppeteer). Entry: `server.js`.
- `src/package.json` — scripts and dependencies; no root-level Node config.
- `src/Dockerfile` — production image with Chrome and `ffmpeg` preinstalled.
- `k8s/` — Kubernetes manifests (PVCs, Deployment, Service).
- `.github/workflows/build.yaml` — CI to build and push container image.

## Build, Test, and Development Commands
- Local dev (Node 18+):
  - `cd src && npm install && npm run dev` — run with nodemon on port 8080.
  - `npm start` — start the server.
- Docker (from repo root):
  - `docker build -f src/Dockerfile -t webcam-snapshot:dev ./src`
  - `docker run -p 8080:8080 -v "$(pwd)/images:/tmp/images" webcam-snapshot:dev`
- Quick health check: `curl http://localhost:8080/healthz` or `/readyz`.

## Coding Style & Naming Conventions
- JavaScript (CommonJS). Use 2‑space indentation, semicolons, single quotes.
- Variables/functions: `camelCase`; constants/env-derived: `UPPER_SNAKE_CASE`.
- Prefer small, pure helpers; keep side effects (I/O, spawn) isolated.
- No linter is configured; format to match `src/server.js` style.

## Testing Guidelines
- No formal test suite yet. Add targeted smoke tests where useful.
- Manual checks: verify `/` renders, `/images` serves files, and videos appear in `/images/videos` after captures.
- For API sanity: `curl -f localhost:8080/healthz` returns `OK`.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, etc.
- Keep messages imperative and scoped (e.g., `fix: retry video merge on failure`).
- PRs should include: clear description, rationale, screenshots of UI (if changed), and steps to verify locally. Link issues when applicable.

## Security & Configuration Tips
- Key env vars: `TARGET_URL`, `CAPTURE_INTERVAL_MS`, `OUTPUT_DIR`, `USER_DATA_DIR`.
- Mount `OUTPUT_DIR` to persistent storage (see `k8s/deployment.yaml`).
- `ffmpeg` is required for daily video generation; the Docker image provides it.
- If running outside Docker, install Chrome for Testing once: `npx puppeteer browsers install chrome`.

