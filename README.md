# Web Arenales - Alicante Webcam Time-lapse

A full-stack application that captures screenshots from the Algarapictures webcam in Alicante, Spain, overlays weather information for both Alicante and Bratislava, and presents them through a React frontend with time-lapse video generation.

## Features

- **Automated Screenshot Capture**: Captures webcam every ~10 minutes (with random jitter of +/- 30 seconds)
- **Weather Overlay**: Displays sunrise, sunset, day length, and temperature for both Alicante and Bratislava
- **Temperature Gauges**: Visual temperature gauges in corners of each image
- **6 Frontend Views**:
  1. Latest Image - Most recent capture with auto-refresh
  2. Daily Images - Browse images by date with lightbox
  3. Daily Videos - 30fps time-lapse videos for each day
  4. Daylight Videos - Videos containing only daylight captures
  5. Combined 24h - All daily videos concatenated
  6. Combined Daylight - All daylight videos concatenated
- **Video Generation Queue**: Prevents system overload by processing one video at a time

## Tech Stack

- **Scraper**: Python + Selenium + PIL
- **Backend**: Node.js + Express
- **Frontend**: React + Vite + React Router
- **Video Processing**: FFmpeg
- **Weather API**: Open-Meteo (free, no API key required)
- **Container**: Docker with Supervisor

## Quick Start

### Using Docker Compose

```bash
# Clone the repository
git clone https://github.com/yourusername/web-arenales.git
cd web-arenales

# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Access the application
open http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `OUTPUT_DIR` | `/data` | Path to store images and videos |
| `TARGET_URL` | `https://www.algarapictures.com/webcam` | Webcam URL to capture |

## Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-arenales
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-arenales
  template:
    metadata:
      labels:
        app: web-arenales
    spec:
      containers:
      - name: web-arenales
        image: web-arenales:latest
        ports:
        - containerPort: 3000
        env:
        - name: OUTPUT_DIR
          value: /data
        - name: TARGET_URL
          value: https://www.algarapictures.com/webcam
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: web-arenales-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-arenales-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
---
apiVersion: v1
kind: Service
metadata:
  name: web-arenales
spec:
  selector:
    app: web-arenales
  ports:
  - port: 80
    targetPort: 3000
```

## Development

### Prerequisites

- Node.js 20+
- Python 3.10+
- Chrome/Chromium
- FFmpeg

### Local Development

```bash
# Install frontend dependencies
cd frontend
npm install

# Install server dependencies
cd ../server
npm install

# Install Python dependencies
cd ../scraper
pip install -r requirements.txt

# Run frontend dev server (terminal 1)
cd frontend
npm run dev

# Run backend server (terminal 2)
cd server
npm run dev

# Run scraper once (terminal 3)
cd scraper
python scraper.py --once
```

## Storage Structure

```
/data/
├── images/
│   ├── 2025-12-16/
│   │   ├── 08-30-45.jpg
│   │   └── ...
│   └── ...
├── videos/
│   ├── daily/
│   │   └── 2025-12-16.mp4
│   ├── daylight/
│   │   └── 2025-12-16-daylight.mp4
│   ├── combined-24h/
│   │   └── combined-all.mp4
│   └── combined-daylight/
│       └── combined-daylight-all.mp4
└── metadata/
    └── weather_cache.json
```

## API Endpoints

### Images
- `GET /api/images/latest` - Latest captured image
- `GET /api/images/days` - List of days with images
- `GET /api/images/day/:date` - Images for a specific day

### Videos
- `GET /api/videos/daily` - List of daily videos
- `GET /api/videos/daylight` - List of daylight videos
- `GET /api/videos/combined-24h` - Combined 24h videos
- `GET /api/videos/combined-daylight` - Combined daylight videos
- `GET /api/videos/queue` - Video generation queue status
- `POST /api/videos/generate/:type` - Queue video generation
- `POST /api/videos/generate-all` - Generate all missing videos

## License

MIT
