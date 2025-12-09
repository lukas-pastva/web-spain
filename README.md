# Webcam Snapshot Service

A tiny Node/Express + Puppeteer service that periodically captures screenshots of a target web page and saves them into `/tmp/images` (designed to be a mounted volume in Kubernetes). The service also serves a simple web page showing the latest snapshot, daily videos, and a full-time merged video; it also exposes the image directory.

- Default target: `https://www.algarapictures.com/webcam`
- Default interval: `300000` ms (5 minutes)
- Default output dir: `/tmp/images`
- Web port: `8080`

## Environment variables

- `TARGET_URL` — Page to capture. Default: `https://www.algarapictures.com/webcam`
- `CAPTURE_INTERVAL_MS` — Base period between captures in ms. Default: `300000` (5 minutes)
- `JITTER_MS` — Adds ±jitter to each interval so it doesn't look like a strict cron. Default: `30000` (±30 seconds). Set to `0` to disable.
- `OUTPUT_DIR` — Directory for images and videos. Default: `/tmp/images`
- `PORT` — HTTP server port. Default: `8080`
- `IMAGE_FORMAT` — `jpeg` (default) or `png`
- `JPEG_QUALITY` — 0–100, only for `jpeg`. Default: `80`
- `USER_DATA_DIR` — Optional Chromium profile dir to persist cookies/consent.
- `POST_NAV_WAIT_MS` — Extra delay after navigation before capture. Default: `1500`.
- `NAV_WAIT_UNTIL` — Navigation wait: `load`, `domcontentloaded` (default), `networkidle0`, `networkidle2`.
- `AUTO_CONSENT` — Auto-accept common consent banners. Default: `true`.
- `CONSENT_TIMEOUT_MS` — Consent handling timeout. Default: `8000`.
- `VIEWPORT_WIDTH` — Browser viewport width. Default: `1920`.
- `VIEWPORT_HEIGHT` — Browser viewport height. Default: `1080`.
- `DEVICE_SCALE_FACTOR` — Pixel density multiplier. Default: `1`.
- `PLAYER_FRAME_URL_MATCH` — Substring to identify the player iframe URL. Default: `ipcamlive.com`.
- `PLAY_WAIT_MS` — Delay after clicking Play before capture, in ms. Default: `1200`.
- `WAIT_FOR_PLAYING_TIMEOUT_MS` — Max wait for `<video>` playback, in ms. Default: `4000`.
- `FULL_VIDEO_NAME` — Filename for merged full-time video. Default: `full.mp4`.

### Fullscreen-first capture

The service automatically tries to start playback and click the player's own fullscreen control inside the video iframe before capturing a screenshot. This produces a full-viewport image of the video when the player supports it. If fullscreen isn’t available, it falls back to a normal viewport screenshot.

### Web UI and tabs

The home page shows:

- Live — latest snapshot (auto-refreshes)
- Stored — recent snapshots not yet archived (typically today’s)
- Videos — daily videos (30 fps) generated from each day’s snapshots
- Full-time — a merged video concatenating the daily videos

No manual capture buttons are present; captures run on the configured schedule only.

### Persist consent/cookies (optional)

Set a persistent profile directory so consent/cookies survive restarts:

```
-e USER_DATA_DIR=/tmp/puppeteer
```

Mount that path to a volume in Docker/Kubernetes. This avoids re-consenting on every run.

## Run locally with Docker

Build and run (images will be written to a local folder):

```
# From repository root
export IMAGE=webcam-snapshot:local

docker build -t "$IMAGE" src
mkdir -p ./images

docker run --rm \
  -e TARGET_URL=https://www.algarapictures.com/webcam \
  -e CAPTURE_INTERVAL_MS=60000 \
  -e OUTPUT_DIR=/tmp/images \
  -p 8080:8080 \
  -v "$(pwd)/images:/tmp/images" \
  "$IMAGE"
```

Open http://localhost:8080 to see the UI. The UI includes tabs for Live, Stored, Videos, and Full-time.

### Jittered scheduling

By default the service schedules screenshots every 5 minutes with a random ±30s jitter. This avoids a rigid, clock-like cadence. You can tune it with:

```
# Every 2 minutes with ±10s jitter
-e CAPTURE_INTERVAL_MS=120000 -e JITTER_MS=10000

# Disable jitter
-e JITTER_MS=0
```

## Kubernetes deployment

1. Build and push the container image to your registry, then update the image reference in `k8s/deployment.yaml`:

```
# Example
export REG=your-registry
export IMG=$REG/webcam-snapshot:latest

docker build -t "$IMG" src
docker push "$IMG"
# Edit k8s/deployment.yaml and set image: $IMG
```

2. Apply the manifests:

```
kubectl apply -f k8s/deployment.yaml
```

3. Access the service:

- If using the provided `NodePort` (30080): `http://<node-ip>:30080`
- Or change the Service type to `LoadBalancer` or `ClusterIP` as needed.

## Notes

- The app writes to `/tmp/images` which should be backed by a PersistentVolume in Kubernetes. The included `PersistentVolumeClaim` (`webcam-images-pvc`) requests 1Gi of storage using the cluster default StorageClass.
- The Dockerfile uses the official Puppeteer base image which includes Chrome and required dependencies. The app launches Chrome in headless mode with `--no-sandbox` suitable for most Kubernetes environments.
