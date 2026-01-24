import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data';

/**
 * Get temperature color based on value (-20 to 50°C range)
 * @param {number} temp - Temperature in Celsius
 * @returns {string} RGB color string
 */
function getTemperatureColor(temp) {
  const tempClamped = Math.max(-20, Math.min(50, temp));

  let r, g, b;
  if (tempClamped < 0) {
    // Blue to cyan
    const ratio = (tempClamped + 20) / 20;
    r = 0;
    g = Math.round(100 + ratio * 155);
    b = 255;
  } else if (tempClamped < 15) {
    // Cyan to green
    const ratio = tempClamped / 15;
    r = 0;
    g = Math.round(200 + ratio * 55);
    b = Math.round(255 - ratio * 255);
  } else if (tempClamped < 25) {
    // Green to yellow
    const ratio = (tempClamped - 15) / 10;
    r = Math.round(ratio * 255);
    g = 255;
    b = 0;
  } else if (tempClamped < 35) {
    // Yellow to orange
    const ratio = (tempClamped - 25) / 10;
    r = 255;
    g = Math.round(255 - ratio * 100);
    b = 0;
  } else {
    // Orange to red
    const ratio = (tempClamped - 35) / 15;
    r = 255;
    g = Math.round(155 - ratio * 155);
    b = 0;
  }

  return `rgb(${r},${g},${b})`;
}

/**
 * Generate SVG for weather info box
 * @param {Object} weather - Weather data
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} align - 'left' or 'right'
 * @returns {string} SVG markup
 */
function generateWeatherInfoSVG(weather, x, y, align = 'left') {
  if (!weather) return '';

  const city = weather.city || 'Unknown';
  const temp = weather.temperature ?? '--';
  const sunrise = weather.sunrise || '--:--';
  const sunset = weather.sunset || '--:--';
  const dayLength = weather.day_length || '--';

  const lines = [
    { text: city, size: 28, weight: 'bold' },
    { text: `Temp: ${temp}°C`, size: 22 },
    { text: `Sunrise: ${sunrise}`, size: 22 },
    { text: `Sunset: ${sunset}`, size: 22 },
    { text: `Day: ${dayLength}`, size: 22 }
  ];

  const lineHeight = 30;
  const textAnchor = align === 'right' ? 'end' : 'start';

  return lines.map((line, i) => `
    <text
      x="${x}"
      y="${y + (i * lineHeight) + line.size}"
      fill="black"
      font-size="${line.size}"
      font-weight="${line.weight || 'normal'}"
      text-anchor="${textAnchor}"
      font-family="Arial, sans-serif"
      dx="2" dy="2"
    >${line.text}</text>
    <text
      x="${x}"
      y="${y + (i * lineHeight) + line.size}"
      fill="white"
      font-size="${line.size}"
      font-weight="${line.weight || 'normal'}"
      text-anchor="${textAnchor}"
      font-family="Arial, sans-serif"
    >${line.text}</text>
  `).join('');
}

/**
 * Generate SVG arc path for temperature gauge
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Radius
 * @param {number} startAngle - Start angle in degrees
 * @param {number} endAngle - End angle in degrees
 * @returns {string} SVG path d attribute
 */
function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

/**
 * Generate SVG for temperature gauge
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} temperature - Temperature in Celsius
 * @param {string} city - City name
 * @param {number} size - Gauge diameter
 * @returns {string} SVG markup
 */
function generateTemperatureGaugeSVG(cx, cy, temperature, city, size = 80) {
  const radius = size / 2;
  const tempColor = getTemperatureColor(temperature);

  // Temperature range: -20°C to 50°C
  const tempClamped = Math.max(-20, Math.min(50, temperature));
  const tempRatio = (tempClamped + 20) / 70;

  // Arc goes from 150° to -150° (300° total range)
  const startAngle = 150;
  const arcAngle = tempRatio * 300;
  const endAngle = startAngle - arcAngle;

  const arcPath = describeArc(cx, cy, radius - 8, endAngle, startAngle);

  return `
    <!-- Outer circle -->
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="white" stroke-width="3" />

    <!-- Temperature arc -->
    <path d="${arcPath}" fill="none" stroke="${tempColor}" stroke-width="15" stroke-linecap="round" />

    <!-- Temperature text shadow -->
    <text x="${cx + 2}" y="${cy + 2}" fill="black" font-size="32" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${Math.round(temperature)}°</text>
    <!-- Temperature text -->
    <text x="${cx}" y="${cy}" fill="white" font-size="32" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${Math.round(temperature)}°</text>

    <!-- City name shadow -->
    <text x="${cx + 2}" y="${cy + radius + 22}" fill="black" font-size="18" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${city}</text>
    <!-- City name -->
    <text x="${cx}" y="${cy + radius + 20}" fill="white" font-size="18" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${city}</text>
  `;
}

/**
 * Generate SVG for temperature difference indicator
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} alicanteTemp - Alicante temperature
 * @param {number} bratislavaTemp - Bratislava temperature
 * @returns {string} SVG markup
 */
function generateTemperatureDifferenceSVG(cx, cy, alicanteTemp, bratislavaTemp) {
  const diff = alicanteTemp - bratislavaTemp;
  const boxWidth = 140;
  const boxHeight = 70;

  const bgLeft = cx - boxWidth / 2;
  const bgTop = cy - boxHeight / 2;

  // Border color based on difference
  let borderColor;
  if (diff > 0) {
    borderColor = 'rgb(255,200,100)';
  } else if (diff < 0) {
    borderColor = 'rgb(100,200,255)';
  } else {
    borderColor = 'rgb(200,200,200)';
  }

  // Diff text color
  let diffColor;
  if (diff > 15) {
    diffColor = 'rgb(255,100,50)';
  } else if (diff > 8) {
    diffColor = 'rgb(255,165,0)';
  } else if (diff > 0) {
    diffColor = 'rgb(255,200,100)';
  } else if (diff < -15) {
    diffColor = 'rgb(50,150,255)';
  } else if (diff < -8) {
    diffColor = 'rgb(100,200,255)';
  } else if (diff < 0) {
    diffColor = 'rgb(150,220,255)';
  } else {
    diffColor = 'rgb(200,200,200)';
  }

  const sign = diff > 0 ? '+' : '';
  const diffText = `${sign}${diff.toFixed(1)}°`;

  let arrow, label;
  if (diff > 0) {
    arrow = '▲';
    label = 'ALI warmer';
  } else if (diff < 0) {
    arrow = '▼';
    label = 'BRA warmer';
  } else {
    arrow = '=';
    label = 'Same temp';
  }

  return `
    <!-- Background -->
    <rect x="${bgLeft}" y="${bgTop}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="rgba(30,30,50,0.8)" />
    <!-- Border -->
    <rect x="${bgLeft}" y="${bgTop}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="none" stroke="${borderColor}" stroke-width="2" />

    <!-- Title -->
    <text x="${cx}" y="${bgTop + 16}" fill="rgb(180,180,200)" font-size="12" text-anchor="middle" font-family="Arial, sans-serif">DIFFERENCE</text>

    <!-- Diff value shadow -->
    <text x="${cx + 1}" y="${cy + 9}" fill="black" font-size="28" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${diffText}</text>
    <!-- Diff value -->
    <text x="${cx}" y="${cy + 8}" fill="${diffColor}" font-size="28" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${diffText}</text>

    <!-- Arrow and label -->
    <text x="${cx - 35}" y="${bgTop + boxHeight - 10}" fill="${diffColor}" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">${arrow}</text>
    <text x="${cx + 10}" y="${bgTop + boxHeight - 10}" fill="rgb(180,180,200)" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">${label}</text>
  `;
}

/**
 * Generate full overlay SVG with weather info, gauges, difference, and date indicator
 * @param {Object} options - Overlay options
 * @param {number} options.width - Image width
 * @param {number} options.height - Image height
 * @param {Object} options.alicanteWeather - Alicante weather data
 * @param {Object} options.bratislavaWeather - Bratislava weather data
 * @param {string} options.date - Date in YYYY-MM-DD format
 * @returns {string} Complete SVG markup
 */
export function generateFullOverlaySVG({ width, height, alicanteWeather, bratislavaWeather, date }) {
  const margin = 20;

  // Weather info positions
  const weatherY = margin;

  // Gauge positions
  const gaugeSize = 80;
  const gaugeY = height - gaugeSize / 2 - 50;

  // Date indicator dimensions
  const dateOverlayHeight = Math.max(30, Math.round(height * 0.065));
  const dateY = height - dateOverlayHeight - 10;

  // Parse date for date indicator
  const [year, month, day] = date.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);
  const daysInMonth = new Date(year, month, 0).getDate();
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

  // Date indicator sizing
  const fontSize = Math.max(11, dateOverlayHeight * 0.18);
  const activeFontSize = Math.max(13, dateOverlayHeight * 0.22);
  const trackHeight = Math.max(4, dateOverlayHeight * 0.08);
  const markerHeight = Math.max(20, dateOverlayHeight * 0.35);
  const dayLabelSize = Math.max(12, dateOverlayHeight * 0.20);
  const trackMargin = 40;
  const trackWidth = width - trackMargin * 2;
  const trackY = dateY + dateOverlayHeight * 0.65;
  const markerX = trackMargin + (trackWidth * dayPosition / 100);
  const monthWidth = width / 5;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(102,126,234)" />
          <stop offset="100%" style="stop-color:rgb(102,126,234)" />
        </linearGradient>
        <linearGradient id="labelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(102,126,234)" />
          <stop offset="100%" style="stop-color:rgb(118,75,162)" />
        </linearGradient>
      </defs>

      <!-- Weather info - Alicante (top-left) -->
      ${generateWeatherInfoSVG(alicanteWeather, margin, weatherY, 'left')}

      <!-- Weather info - Bratislava (top-right) -->
      ${generateWeatherInfoSVG(bratislavaWeather, width - margin, weatherY, 'right')}

      <!-- Temperature gauge - Alicante (bottom-left) -->
      ${alicanteWeather ? generateTemperatureGaugeSVG(margin + gaugeSize / 2 + 20, gaugeY, alicanteWeather.temperature || 0, 'Alicante', gaugeSize) : ''}

      <!-- Temperature gauge - Bratislava (bottom-right) -->
      ${bratislavaWeather ? generateTemperatureGaugeSVG(width - margin - gaugeSize / 2 - 20, gaugeY, bratislavaWeather.temperature || 0, 'Bratislava', gaugeSize) : ''}

      <!-- Temperature difference (bottom-center) -->
      ${alicanteWeather && bratislavaWeather ? generateTemperatureDifferenceSVG(width / 2, gaugeY, alicanteWeather.temperature || 0, bratislavaWeather.temperature || 0) : ''}

      <!-- Date indicator - Month labels -->
      ${months.map((m, i) => `
        <text
          x="${i * monthWidth + monthWidth / 2}"
          y="${dateY + 18}"
          fill="${m.isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'}"
          font-size="${m.isActive ? activeFontSize : fontSize}"
          font-weight="${m.isActive ? '600' : '500'}"
          text-anchor="middle"
          font-family="Arial, sans-serif"
        >${m.label}</text>
      `).join('')}

      <!-- Date indicator - Track bar -->
      <rect x="${trackMargin}" y="${trackY}" width="${trackWidth}" height="${trackHeight}" fill="url(#trackGrad)" rx="${trackHeight / 2}" />

      <!-- Date indicator - Day marker -->
      <rect x="${markerX - 1.5}" y="${trackY - (markerHeight - trackHeight) / 2}" width="3" height="${markerHeight}" fill="white" rx="1.5" />

      <!-- Date indicator - Day label background -->
      <rect x="${markerX - dayLabelSize * 1.2}" y="${trackY - markerHeight / 2 - dayLabelSize * 1.8}" width="${dayLabelSize * 2.4}" height="${dayLabelSize * 1.4}" fill="url(#labelGrad)" rx="4" />

      <!-- Date indicator - Day number -->
      <text x="${markerX}" y="${trackY - markerHeight / 2 - dayLabelSize * 0.8}" fill="white" font-size="${dayLabelSize}" font-weight="700" text-anchor="middle" font-family="Arial, sans-serif">${day}</text>
    </svg>
  `;
}

/**
 * Apply full overlay to an image buffer
 * @param {Buffer} imageBuffer - Input image buffer
 * @param {Object} weatherData - Weather metadata
 * @param {Object} weatherData.alicante - Alicante weather
 * @param {Object} weatherData.bratislava - Bratislava weather
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Buffer>} Output image buffer with overlay
 */
export async function applyOverlayToBuffer(imageBuffer, weatherData, date) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  // Build weather objects with city names
  const alicanteWeather = weatherData.alicante ? {
    city: 'Alicante',
    temperature: weatherData.alicante.temp,
    sunrise: weatherData.alicante.sunrise,
    sunset: weatherData.alicante.sunset,
    day_length: weatherData.alicante.day_length
  } : null;

  const bratislavaWeather = weatherData.bratislava ? {
    city: 'Bratislava',
    temperature: weatherData.bratislava.temp,
    sunrise: weatherData.bratislava.sunrise,
    sunset: weatherData.bratislava.sunset,
    day_length: weatherData.bratislava.day_length
  } : null;

  // Generate full overlay SVG
  const overlaySVG = generateFullOverlaySVG({
    width,
    height,
    alicanteWeather,
    bratislavaWeather,
    date
  });

  const svgBuffer = Buffer.from(overlaySVG);

  // Composite overlay onto image
  const result = await sharp(imageBuffer)
    .composite([{
      input: svgBuffer,
      top: 0,
      left: 0
    }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

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
