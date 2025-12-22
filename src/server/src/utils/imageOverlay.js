import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data';

/**
 * Generate SVG overlay for date indicator
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} width - Image width
 * @param {number} height - Image height
 */
function generateDateIndicatorSVG(date, width, height) {
  const [year, month, day] = date.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Calculate day position (0-100%)
  const dayPosition = ((day - 1) / (daysInMonth - 1)) * 100;

  // Generate 5 months centered around current month
  const months = [];
  for (let i = -2; i <= 2; i++) {
    const targetDate = new Date(year, month - 1 + i, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1;
    months.push({
      label: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      isActive: i === 0
    });
  }

  // Responsive sizing based on image dimensions
  const overlayHeight = Math.max(60, height * 0.08);
  const fontSize = Math.max(10, overlayHeight * 0.15);
  const activeFontSize = Math.max(12, overlayHeight * 0.18);
  const trackHeight = Math.max(4, overlayHeight * 0.08);
  const markerHeight = Math.max(20, overlayHeight * 0.35);
  const dayLabelSize = Math.max(11, overlayHeight * 0.16);
  const padding = Math.max(10, width * 0.015);

  const monthWidth = (width - padding * 2) / 5;
  const trackY = overlayHeight * 0.65;
  const trackWidth = width - padding * 2;
  const markerX = padding + (trackWidth * dayPosition / 100);

  return `
    <svg width="${width}" height="${overlayHeight}">
      <!-- Background gradient -->
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(0,0,0);stop-opacity:0.9" />
          <stop offset="100%" style="stop-color:rgb(0,0,0);stop-opacity:0.6" />
        </linearGradient>
        <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(102,126,234);stop-opacity:0.3" />
          <stop offset="50%" style="stop-color:rgb(118,75,162);stop-opacity:0.5" />
          <stop offset="100%" style="stop-color:rgb(102,126,234);stop-opacity:0.3" />
        </linearGradient>
        <linearGradient id="markerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(255,255,255);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(255,255,255);stop-opacity:0.8" />
        </linearGradient>
        <linearGradient id="labelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(102,126,234);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(118,75,162);stop-opacity:1" />
        </linearGradient>

        <!-- Glow filters -->
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${overlayHeight}" fill="url(#bgGrad)"/>

      <!-- Month labels -->
      ${months.map((m, i) => `
        <text
          x="${padding + monthWidth * i + monthWidth / 2}"
          y="${overlayHeight * 0.25}"
          fill="${m.isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)'}"
          font-size="${m.isActive ? activeFontSize : fontSize}"
          font-weight="${m.isActive ? '600' : '500'}"
          text-anchor="middle"
          font-family="Arial, sans-serif"
        >${m.label}</text>
      `).join('')}

      <!-- Track bar -->
      <rect
        x="${padding}"
        y="${trackY}"
        width="${trackWidth}"
        height="${trackHeight}"
        fill="url(#trackGrad)"
        rx="${trackHeight / 2}"
        filter="url(#glow)"
      />

      <!-- Day marker line -->
      <rect
        x="${markerX - 1.5}"
        y="${trackY - (markerHeight - trackHeight) / 2}"
        width="3"
        height="${markerHeight}"
        fill="url(#markerGrad)"
        rx="1.5"
        filter="url(#glow)"
      />

      <!-- Day label -->
      <rect
        x="${markerX - dayLabelSize * 1.2}"
        y="${trackY - markerHeight / 2 - dayLabelSize * 1.8}"
        width="${dayLabelSize * 2.4}"
        height="${dayLabelSize * 1.4}"
        fill="url(#labelGrad)"
        rx="${dayLabelSize * 0.3}"
      />
      <text
        x="${markerX}"
        y="${trackY - markerHeight / 2 - dayLabelSize * 0.9}"
        fill="white"
        font-size="${dayLabelSize}"
        font-weight="700"
        text-anchor="middle"
        font-family="Arial, sans-serif"
      >${day}</text>
    </svg>
  `;
}

/**
 * Add date indicator overlay to an image
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to output image (can be same as input to overwrite)
 * @param {string} date - Date in YYYY-MM-DD format
 */
export async function addDateIndicator(inputPath, outputPath, date) {
  try {
    // Get image metadata
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Generate SVG overlay
    const svgOverlay = generateDateIndicatorSVG(date, width, height);
    const overlayHeight = Math.max(60, height * 0.08);

    // Create SVG buffer
    const svgBuffer = Buffer.from(svgOverlay);

    // Composite overlay onto image
    await sharp(inputPath)
      .composite([{
        input: svgBuffer,
        top: height - overlayHeight,
        left: 0
      }])
      .toFile(outputPath);

    return { success: true };
  } catch (error) {
    console.error(`Error adding date indicator to ${inputPath}:`, error);
    throw error;
  }
}

/**
 * Process all images for a specific day, adding date indicators
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {boolean} inPlace - If true, overwrites original images. If false, creates new files
 */
export async function processImagesForDay(date, inPlace = false) {
  const imagesPath = path.join(OUTPUT_DIR, 'images', date);
  const outputPath = inPlace ? imagesPath : path.join(OUTPUT_DIR, 'images', `${date}-processed`);

  try {
    // Ensure output directory exists if not processing in place
    if (!inPlace) {
      await fs.mkdir(outputPath, { recursive: true });
    }

    // Get all image files
    const files = await fs.readdir(imagesPath);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    console.log(`Processing ${imageFiles.length} images for ${date}...`);

    let processed = 0;
    for (const file of imageFiles) {
      const inputFile = path.join(imagesPath, file);
      const outputFile = inPlace ? inputFile : path.join(outputPath, file);

      await addDateIndicator(inputFile, outputFile, date);
      processed++;

      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${imageFiles.length} images...`);
      }
    }

    console.log(`✓ Successfully processed ${processed} images for ${date}`);
    return { success: true, processed, total: imageFiles.length };

  } catch (error) {
    console.error(`Error processing images for ${date}:`, error);
    throw error;
  }
}

/**
 * Process multiple days
 * @param {string[]} dates - Array of dates in YYYY-MM-DD format
 * @param {boolean} inPlace - If true, overwrites original images
 */
export async function processMultipleDays(dates, inPlace = false) {
  const results = [];

  for (const date of dates) {
    try {
      const result = await processImagesForDay(date, inPlace);
      results.push({ date, ...result });
    } catch (error) {
      results.push({ date, success: false, error: error.message });
    }
  }

  return results;
}
