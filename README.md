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
- `OUTPUT_DIR` — Directory for images. Default: `/tmp/images`
- `PORT` — HTTP server port. Default: `8080`
- `IMAGE_FORMAT` — `jpeg` (default) or `png`
- `JPEG_QUALITY` — 0–100, only for `jpeg`. Default: `80`
 - `USER_DATA_DIR` — Optional path for a persistent Chromium profile. If set (e.g. to `/tmp/puppeteer` mounted on a volume), cookie/consent choices persist across container restarts.
 - `CLIP_SELECTOR` — Optional CSS selector to capture only a specific element on the page (e.g., the embedded webcam iframe). Example: `iframe[src*="ipcamlive.com"]`.
 - `CLIP_PADDING` — Optional integer pixels to expand the clip around the selected element. Default: `0`.
 - `WAIT_FOR_SELECTOR_TIMEOUT_MS` — How long to wait for `CLIP_SELECTOR` to appear. Default: `30000`.
- `POST_NAV_WAIT_MS` — Extra delay after navigation to let the page paint before capture. Default: `1500`.
 - `NAV_WAIT_UNTIL` — How Puppeteer waits for navigation to finish: `load`, `domcontentloaded` (default), `networkidle0`, or `networkidle2`. For streaming pages, `domcontentloaded` is recommended.
 - `AUTO_CONSENT` — When `true` (default), attempts to auto-accept common cookie/consent banners (Google Funding Choices, site cookie bars) so the webcam isn't obscured. Timeout controlled by `CONSENT_TIMEOUT_MS`.
 - `CONSENT_TIMEOUT_MS` — How long to keep trying to handle consent banners. Default: `8000`.
 - `MAKE_CLIP_FULLSCREEN` — When `true`, promotes the selected element to fullscreen before capturing. Produces a full-viewport image of the video instead of a smaller cropped box. Default: `false`.
 - `FULLSCREEN_SELECTOR` — Optional selector to use for fullscreen promotion. If not set, `CLIP_SELECTOR` is used.
 - `FULLSCREEN_BG` — Background color to use behind the fullscreened element. Default: `#000`.
 - `FULLSCREEN_DELAY_MS` — Small delay after fullscreening to allow layout to settle. Default: `400`.
 - `VIEWPORT_WIDTH` — Browser viewport width in pixels. Default: `1920`.
 - `VIEWPORT_HEIGHT` — Browser viewport height in pixels. Default: `1080`.
- `DEVICE_SCALE_FACTOR` — Pixel density multiplier for sharper output (e.g., `2` for “retina”-like). Default: `1`.
- `CLICK_IFRAME_FULLSCREEN` — When `true`, tries to click the player's fullscreen button inside the iframe (e.g., IPCamLive) before capturing. Default: `false`.
- `CLICK_IFRAME_PLAY` — When `true`, tries to click the player's central Play button inside the iframe before capturing, then waits briefly for playback. Helps when the player shows a static poster with a big Play icon. Default: `false`.
- `CLICK_IFRAME_PLAY_FULLSCREEN` — When `true`, performs a combined sequence: click Play, hover over the video to reveal controls, then click the player's Fullscreen button inside the iframe before capturing. Produces a full-viewport screenshot of the playing video. Default: `false`.
- `PLAYER_FRAME_URL_MATCH` — Substring to identify the player iframe URL. Default: `ipcamlive.com`.
- `PLAYER_FULLSCREEN_SELECTORS` — Optional comma-separated CSS selectors to find the fullscreen control inside the player iframe. Defaults include common variants like `button[aria-label*="Full"]`, `.vjs-fullscreen-control`, `.fullscreen`.
- `PLAYER_PLAY_SELECTORS` — Optional comma-separated CSS selectors to find the Play control inside the player iframe. Defaults include common variants like `.vjs-big-play-button`, `button[aria-label*="Play"]`, `.jw-icon-playback`.
- `PLAY_WAIT_MS` — Delay after clicking Play before capturing, in ms. Default: `1200`.
- `WAIT_FOR_PLAYING_TIMEOUT_MS` — How long to poll for `<video>` playback after clicking Play, in ms. Default: `4000`.
- `AUTO_CLIP_IFRAME_BY_URL` — When `true` (default), if no `CLIP_SELECTOR` is provided the service auto-detects the largest visible `<iframe>` whose `src` includes `PLAYER_FRAME_URL_MATCH` and crops to it.

### Capture only the video (iframe) region

If your target page embeds the webcam inside an `<iframe>` (like IPCamLive), you can tell the service to capture only that element. By default the service captures the element at its embedded size. You can also promote it to fullscreen if desired.

```
docker run --rm \
  -e TARGET_URL=https://www.algarapictures.com/webcam \
  -e CLIP_SELECTOR='iframe[src*="ipcamlive.com"]' \
  -e MAKE_CLIP_FULLSCREEN=false \
  -e CLIP_PADDING=8 \
  -p 8080:8080 \
  -v "$(pwd)/images:/tmp/images" \
  webcam-snapshot:local
```

The service waits for the element to be visible and screenshots only that element’s box. If you prefer a full-viewport image of the video, set `-e MAKE_CLIP_FULLSCREEN=true` and the element will be promoted to fullscreen before capture. If the selector doesn’t appear within the timeout, it falls back to a regular screenshot of the page.

If you see a cookie/consent dialog, the service will try to automatically accept common consent prompts (Google Funding Choices) in both the page and any iframes. You can also persist the decision by using a Chromium profile via `USER_DATA_DIR` (see below).

To make the embedded player itself go fullscreen (instead of CSS-promoting the iframe), enable:

```
-e CLICK_IFRAME_FULLSCREEN=true \
-e PLAYER_FRAME_URL_MATCH=ipcamlive.com
```

The service tries several common selectors for the fullscreen control, attempts to generate a user gesture inside the player, and (as a last resort) requests fullscreen on a likely media element.

### Start playback before capture (new)

If your capture shows only a static poster with a big Play icon, enable Play-then-capture so the service clicks the central Play button first and then takes the screenshot:

```
-e CLICK_IFRAME_PLAY=true \
-e PLAYER_FRAME_URL_MATCH=ipcamlive.com
```

You can tune delays/selectors with `PLAY_WAIT_MS`, `WAIT_FOR_PLAYING_TIMEOUT_MS`, and `PLAYER_PLAY_SELECTORS`.

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

Open http://localhost:8080 to see the UI. You can browse the raw files under http://localhost:8080/images/.

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
