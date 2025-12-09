# Webcam Snapshot Service

A tiny Node/Express + Puppeteer service that periodically captures screenshots of a target web page and saves them into `/tmp/images` (designed to be a mounted volume in Kubernetes). The service also serves a simple web page showing the latest screenshot and exposes the image directory.

- Default target: `https://www.algarapictures.com/webcam`
- Default interval: `60000` ms (60 seconds)
- Default output dir: `/tmp/images`
- Web port: `8080`

## Environment variables

- `TARGET_URL` — Page to capture. Default: `https://www.algarapictures.com/webcam`
- `CAPTURE_INTERVAL_MS` — Base period between captures in ms. Default: `300000` (5 minutes)
- `JITTER_MS` — Adds ±jitter to each interval so it doesn't look like a strict cron. Default: `30000` (±30 seconds). Set to `0` to disable.
- `OUTPUT_DIR` — Directory for images. Default: `/tmp/images`
- `PORT` — HTTP server port. Default: `8080`
- `IMAGE_FORMAT` — `jpeg` (default) or `png`
- `JPEG_QUALITY` — 0–100, only for `jpeg`. Default: `80`
 - `CLIP_SELECTOR` — Optional CSS selector to capture only a specific element on the page (e.g., the embedded webcam iframe). Example: `iframe[src*="ipcamlive.com"]`.
 - `CLIP_PADDING` — Optional integer pixels to expand the clip around the selected element. Default: `0`.
 - `WAIT_FOR_SELECTOR_TIMEOUT_MS` — How long to wait for `CLIP_SELECTOR` to appear. Default: `30000`.
- `POST_NAV_WAIT_MS` — Extra delay after navigation to let the page paint before capture. Default: `1500`.
 - `NAV_WAIT_UNTIL` — How Puppeteer waits for navigation to finish: `load`, `domcontentloaded` (default), `networkidle0`, or `networkidle2`. For streaming pages, `domcontentloaded` is recommended.
 - `MAKE_CLIP_FULLSCREEN` — When `true` (default), promotes the selected element to fullscreen before capturing. Produces a full-viewport image of the video instead of a smaller cropped box.
 - `FULLSCREEN_SELECTOR` — Optional selector to use for fullscreen promotion. If not set, `CLIP_SELECTOR` is used.
 - `FULLSCREEN_BG` — Background color to use behind the fullscreened element. Default: `#000`.
 - `FULLSCREEN_DELAY_MS` — Small delay after fullscreening to allow layout to settle. Default: `400`.

### Capture only the video (iframe) region (fullscreen)

If your target page embeds the webcam inside an `<iframe>` (like IPCamLive), you can tell the service to capture only that element. By default, the service will also promote that element to fullscreen so the capture is a full-viewport image of the video:

```
docker run --rm \
  -e TARGET_URL=https://www.algarapictures.com/webcam \
  -e CLIP_SELECTOR='iframe[src*="ipcamlive.com"]' \
  -e MAKE_CLIP_FULLSCREEN=true \
  -e CLIP_PADDING=8 \
  -p 8080:8080 \
  -v "$(pwd)/images:/tmp/images" \
  webcam-snapshot:local
```

The service waits for the element to be visible, promotes it to fullscreen, and captures the viewport. If you prefer to keep the original embedded size, set `-e MAKE_CLIP_FULLSCREEN=false` and it will screenshot only that element’s box. If the selector doesn’t appear within the timeout, it falls back to a regular screenshot of the page.

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

Open http://localhost:8080 to see the latest screenshot, and http://localhost:8080/images/ to browse files.

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
