# Image Processing with Date Indicators

## Overview

This feature allows you to burn a graphical date indicator directly into your webcam images. The date indicator shows:
- **Month timeline**: 5 months (2 before, current, 2 after) in YYYY-MM format
- **Day marker**: A visual indicator showing the exact day within the month
- **Position-based display**: The day marker's position represents the day of the month (like a speedometer)

## Why This Feature?

When images are compiled into time-lapse videos, the date indicator becomes part of the video frames. This lets you see what date each frame represents when watching fullscreen videos.

## Installation

### 1. Install Sharp (Image Processing Library)

```bash
cd src/server
npm install
```

This will install the `sharp` package which is required for image processing.

### 2. Verify Installation

Check that sharp is listed in `src/server/package.json`:

```json
"dependencies": {
  "sharp": "^0.33.0"
}
```

## Usage

### Option 1: Web UI (Easiest)

1. Navigate to the **Daily Images** page
2. Select a date from the dropdown
3. Click the **"📅 Add Date Overlay"** button
4. Wait for processing to complete (progress shown in console)
5. Images will be automatically refreshed with the date indicator burned in

### Option 2: API Endpoints

#### Process a Single Day

```bash
POST /api/images/process/:date

# Example:
curl -X POST http://localhost:3000/api/images/process/2025-12-22 \
  -H "Content-Type: application/json" \
  -d '{"inPlace": true}'
```

**Parameters:**
- `date`: Date in YYYY-MM-DD format
- `inPlace`: (optional) `true` to overwrite originals, `false` to create copies (default: `true`)

**Response:**
```json
{
  "success": true,
  "processed": 287,
  "total": 287
}
```

#### Process Multiple Days

```bash
POST /api/images/process-multiple

# Example:
curl -X POST http://localhost:3000/api/images/process-multiple \
  -H "Content-Type: application/json" \
  -d '{
    "dates": ["2025-12-20", "2025-12-21", "2025-12-22"],
    "inPlace": true
  }'
```

**Response:**
```json
{
  "results": [
    {"date": "2025-12-20", "success": true, "processed": 287, "total": 287},
    {"date": "2025-12-21", "success": true, "processed": 289, "total": 289},
    {"date": "2025-12-22", "success": true, "processed": 290, "total": 290}
  ]
}
```

#### Process All Available Days

```bash
POST /api/images/process-all

# Example:
curl -X POST http://localhost:3000/api/images/process-all \
  -H "Content-Type": application/json" \
  -d '{"inPlace": true}'
```

**Response:**
```json
{
  "results": [...],
  "total": 15
}
```

## How It Works

### 1. SVG Generation

The date indicator is generated as an SVG overlay with:
- Responsive sizing based on image dimensions
- Gradient backgrounds and glowing effects
- Month labels with active month highlighting
- Dynamic day marker positioned based on the day of the month

### 2. Image Compositing

Using the Sharp library:
1. Read original image
2. Get image dimensions
3. Generate SVG overlay
4. Composite SVG onto image at the bottom
5. Save processed image (overwriting original or creating new file)

### 3. Video Integration

When you generate videos, the video service automatically uses the processed images (if they've been processed). Since processing overwrites the originals by default, all subsequent video generations will include the date indicators.

## Visual Design

The date indicator appears at the bottom of each image with:

- **Dark gradient background**: Black fading from bottom (90% opacity) to top (60% opacity)
- **Month labels**: 5 months displayed horizontally
  - Inactive months: 40% white opacity
  - Active (current) month: 95% white opacity, larger font
- **Track bar**: Purple/blue gradient with glow effect
- **Day marker**:
  - Vertical white line with glow
  - Purple/blue gradient label showing day number
  - Position: Calculated as `(day - 1) / (daysInMonth - 1) * 100%`

### Example Positions:
- Jan 1st (31 days): 0% (far left)
- Jan 15th (31 days): 46.7% (middle)
- Jan 31st (31 days): 100% (far right)

## Performance

- Processing speed: ~50-100 images per second (depends on image size and CPU)
- For a typical day with 288 images (5-minute intervals): ~3-6 seconds
- SVG overlay size: ~3-5 KB
- Image file size increase: Minimal (~1-2%)

## Important Notes

### ⚠️ Warning: Processing Overwrites Original Images

By default, `inPlace: true` means the original images are overwritten. Make sure you:
- Have backups if needed
- Are certain you want the date indicator on all images
- Understand this affects future video generations

### Best Practices

1. **Test First**: Process one day and generate a test video before processing all days
2. **Check Results**: Review processed images to ensure the overlay looks good
3. **Process Before Video Generation**: Process images first, then generate videos
4. **Consistent Processing**: Either process all days or none - mixed processing may look inconsistent in combined videos

### Troubleshooting

**Error: "Cannot find module 'sharp'"**
- Solution: Run `npm install` in the `src/server` directory

**Error: "Sharp installation failed"**
- Solution: Sharp requires native binaries. Try:
  ```bash
  cd src/server
  npm rebuild sharp
  ```

**Processed images not showing**
- Solution: Clear browser cache or hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

**Date indicator too small/large**
- The overlay automatically scales to 8% of image height (minimum 60px)
- For custom sizing, modify the `overlayHeight` calculation in `imageOverlay.js`

## File Locations

- **Image Processing Utility**: `src/server/src/utils/imageOverlay.js`
- **API Routes**: `src/server/src/routes/images.js`
- **Frontend UI**: `src/frontend/src/pages/DailyImages.jsx`
- **Preview Component** (CSS only): `src/frontend/src/components/DateIndicator.jsx`

## Future Enhancements

Potential improvements:
- Configurable date format
- Customizable colors and styling
- Option to add time (HH:MM) alongside date
- Batch processing with progress bar in UI
- Undo functionality (restore originals from backup)
