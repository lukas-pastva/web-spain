# Webcam Snapshot Service

A tiny Node/Express + Puppeteer service that periodically captures screenshots of a target web page and saves them into `/tmp/images` (designed to be a mounted volume in Kubernetes). The service also serves a simple web page showing the latest screenshot and exposes the image directory.

- Default target: `https://www.algarapictures.com/webcam`
- Default interval: `60000` ms (60 seconds)
- Default output dir: `/tmp/images`
- Web port: `8080`

## Environment variables

- `TARGET_URL` — Page to capture. Default: `https://www.algarapictures.com/webcam`
- `CAPTURE_INTERVAL_MS` — Period between captures in ms. Default: `60000`
- `OUTPUT_DIR` — Directory for images. Default: `/tmp/images`
- `PORT` — HTTP server port. Default: `8080`
- `IMAGE_FORMAT` — `jpeg` (default) or `png`
- `JPEG_QUALITY` — 0–100, only for `jpeg`. Default: `80`

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
