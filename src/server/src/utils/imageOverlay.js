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
 * Generate SVG for a city info panel (weather + gauge combined)
 */
function generateCityPanelSVG(weather, x, y, panelWidth, panelHeight) {
  if (!weather) return '';

  const city = weather.city || 'Unknown';
  const temp = weather.temperature ?? '--';
  const sunrise = weather.sunrise || '--:--';
  const sunset = weather.sunset || '--:--';
  const dayLength = weather.day_length || '--';

  const tempColor = typeof temp === 'number' ? getTemperatureColor(temp) : 'rgb(200,200,200)';
  const gaugeSize = 90;
  const gaugeCx = x + panelWidth / 2;
  const gaugeCy = y + 80;

  // Temperature arc
  let arcPath = '';
  if (typeof temp === 'number') {
    const tempClamped = Math.max(-20, Math.min(50, temp));
    const tempRatio = (tempClamped + 20) / 70;
    const startAngle = 150;
    const arcAngle = tempRatio * 300;
    const endAngle = startAngle - arcAngle;
    arcPath = describeArc(gaugeCx, gaugeCy, gaugeSize / 2 - 8, endAngle, startAngle);
  }

  return `
    <!-- City name -->
    <text x="${x + panelWidth / 2}" y="${y + 25}" fill="white" font-size="24" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${city}</text>

    <!-- Temperature gauge -->
    <circle cx="${gaugeCx}" cy="${gaugeCy}" r="${gaugeSize / 2}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
    ${arcPath ? `<path d="${arcPath}" fill="none" stroke="${tempColor}" stroke-width="12" stroke-linecap="round" />` : ''}
    <text x="${gaugeCx}" y="${gaugeCy + 8}" fill="white" font-size="28" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${typeof temp === 'number' ? Math.round(temp) : temp}°C</text>

    <!-- Weather details -->
    <text x="${x + panelWidth / 2}" y="${gaugeCy + 70}" fill="rgba(255,255,255,0.9)" font-size="16" text-anchor="middle" font-family="Arial, sans-serif">Sunrise: ${sunrise}</text>
    <text x="${x + panelWidth / 2}" y="${gaugeCy + 92}" fill="rgba(255,255,255,0.9)" font-size="16" text-anchor="middle" font-family="Arial, sans-serif">Sunset: ${sunset}</text>
    <text x="${x + panelWidth / 2}" y="${gaugeCy + 114}" fill="rgba(255,255,255,0.9)" font-size="16" text-anchor="middle" font-family="Arial, sans-serif">Day: ${dayLength}</text>
  `;
}

/**
 * Generate HD layout SVG (1280x720) with image placeholder and info panels
 * @param {Object} options - Layout options
 * @param {Object} options.alicanteWeather - Alicante weather data
 * @param {Object} options.bratislavaWeather - Bratislava weather data
 * @param {string} options.date - Date in YYYY-MM-DD format
 * @returns {string} Complete SVG markup for info panels (not including image)
 */
export function generateHDLayoutSVG({ alicanteWeather, bratislavaWeather, date }) {
  const canvasWidth = 1280;
  const canvasHeight = 720;
  const imageWidth = 800;
  const imageHeight = 450;
  const sidePanelWidth = canvasWidth - imageWidth; // 480
  const bottomPanelHeight = canvasHeight - imageHeight; // 270

  // Parse date
  const [year, month, day] = date.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayPosition = ((day - 1) / (daysInMonth - 1)) * 100;

  // Generate 5 months
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

  // Temperature difference
  const aliTemp = alicanteWeather?.temperature ?? 0;
  const braTemp = bratislavaWeather?.temperature ?? 0;
  const diff = aliTemp - braTemp;
  const diffSign = diff > 0 ? '+' : '';
  const diffColor = diff > 0 ? 'rgb(255,180,100)' : diff < 0 ? 'rgb(100,180,255)' : 'rgb(200,200,200)';
  const diffLabel = diff > 0 ? 'Alicante warmer' : diff < 0 ? 'Bratislava warmer' : 'Same temperature';

  // Day length difference
  const parseDayLength = (str) => {
    if (!str || str === '--') return null;
    const match = str.match(/(\d+)h\s*(\d+)m?/);
    if (match) {
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    }
    return null;
  };

  const aliDayMins = parseDayLength(alicanteWeather?.day_length);
  const braDayMins = parseDayLength(bratislavaWeather?.day_length);
  let dayLengthDiff = null;
  let dayLengthDiffStr = '--';
  let dayLengthColor = 'rgb(200,200,200)';
  let dayLengthLabel = '';

  if (aliDayMins !== null && braDayMins !== null) {
    dayLengthDiff = aliDayMins - braDayMins;
    const absDiff = Math.abs(dayLengthDiff);
    const diffHours = Math.floor(absDiff / 60);
    const diffMins = absDiff % 60;
    const sign = dayLengthDiff > 0 ? '+' : '-';
    dayLengthDiffStr = diffHours > 0 ? `${sign}${diffHours}h ${diffMins}m` : `${sign}${diffMins}m`;
    dayLengthColor = dayLengthDiff > 0 ? 'rgb(255,220,100)' : dayLengthDiff < 0 ? 'rgb(180,140,255)' : 'rgb(200,200,200)';
    dayLengthLabel = dayLengthDiff > 0 ? 'Longer in Alicante' : dayLengthDiff < 0 ? 'Longer in Bratislava' : 'Same length';
  }

  // Date indicator positioning in bottom panel
  const dateY = imageHeight + 180;
  const trackMargin = 100;
  const trackWidth = canvasWidth - trackMargin * 2;
  const trackHeight = 8;
  const markerHeight = 40;
  const markerX = trackMargin + (trackWidth * dayPosition / 100);

  return `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Ocean/beach gradient background -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(15,52,96)" />
          <stop offset="40%" style="stop-color:rgb(22,78,99)" />
          <stop offset="70%" style="stop-color:rgb(14,116,144)" />
          <stop offset="100%" style="stop-color:rgb(6,95,124)" />
        </linearGradient>
        <!-- Warm sunset accent for panels -->
        <linearGradient id="panelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(255,183,77,0.1)" />
          <stop offset="100%" style="stop-color:rgba(20,80,100,0.3)" />
        </linearGradient>
        <!-- Track gradient - ocean teal -->
        <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(34,211,238)" />
          <stop offset="50%" style="stop-color:rgb(56,189,248)" />
          <stop offset="100%" style="stop-color:rgb(34,211,238)" />
        </linearGradient>
        <!-- Label gradient - warm sand/sunset -->
        <linearGradient id="labelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(251,146,60)" />
          <stop offset="100%" style="stop-color:rgb(245,158,11)" />
        </linearGradient>
        <!-- Wave pattern -->
        <pattern id="waves" x="0" y="0" width="100" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q25 0 50 10 T100 10" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="2"/>
        </pattern>
      </defs>

      <!-- Background -->
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#bgGrad)" />
      <!-- Subtle wave pattern overlay -->
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#waves)" />

      <!-- Image border/frame -->
      <rect x="0" y="0" width="${imageWidth}" height="${imageHeight}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" />

      <!-- Right side panel - Alicante (top half) - warm tones for Spanish sun -->
      <rect x="${imageWidth}" y="0" width="${sidePanelWidth}" height="${imageHeight / 2}" fill="rgba(251,146,60,0.08)" />
      <rect x="${imageWidth}" y="${imageHeight / 2 - 1}" width="${sidePanelWidth}" height="2" fill="rgba(255,255,255,0.1)" />
      ${generateCityPanelSVG(
        alicanteWeather ? { ...alicanteWeather, city: 'Alicante' } : null,
        imageWidth, 10, sidePanelWidth, imageHeight / 2 - 20
      )}

      <!-- Right side panel - Bratislava (bottom half) - cooler tones -->
      <rect x="${imageWidth}" y="${imageHeight / 2}" width="${sidePanelWidth}" height="${imageHeight / 2}" fill="rgba(56,189,248,0.08)" />
      ${generateCityPanelSVG(
        bratislavaWeather ? { ...bratislavaWeather, city: 'Bratislava' } : null,
        imageWidth, imageHeight / 2 + 10, sidePanelWidth, imageHeight / 2 - 20
      )}

      <!-- Bottom panel - sandy gradient -->
      <rect x="0" y="${imageHeight}" width="${canvasWidth}" height="${bottomPanelHeight}" fill="rgba(245,208,160,0.05)" />
      <rect x="0" y="${imageHeight}" width="${canvasWidth}" height="2" fill="rgba(255,255,255,0.1)" />

      <!-- Temperature difference (bottom left area) -->
      <rect x="20" y="${imageHeight + 20}" width="200" height="130" rx="12" fill="rgba(0,0,0,0.2)" />
      <text x="120" y="${imageHeight + 48}" fill="rgba(255,255,255,0.7)" font-size="12" text-anchor="middle" font-family="Arial, sans-serif">TEMPERATURE</text>
      <text x="120" y="${imageHeight + 95}" fill="${diffColor}" font-size="38" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${diffSign}${diff.toFixed(1)}°C</text>
      <text x="120" y="${imageHeight + 125}" fill="rgba(255,255,255,0.6)" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">${diffLabel}</text>

      <!-- Day length difference (next to temperature) -->
      <rect x="230" y="${imageHeight + 20}" width="200" height="130" rx="12" fill="rgba(0,0,0,0.2)" />
      <text x="330" y="${imageHeight + 48}" fill="rgba(255,255,255,0.7)" font-size="12" text-anchor="middle" font-family="Arial, sans-serif">DAY LENGTH</text>
      <text x="330" y="${imageHeight + 95}" fill="${dayLengthColor}" font-size="38" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${dayLengthDiffStr}</text>
      <text x="330" y="${imageHeight + 125}" fill="rgba(255,255,255,0.6)" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">${dayLengthLabel}</text>

      <!-- Month labels -->
      ${months.map((m, i) => {
        const monthX = 500 + i * 140;
        return `
          <text
            x="${monthX}"
            y="${imageHeight + 55}"
            fill="${m.isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)'}"
            font-size="${m.isActive ? 16 : 13}"
            font-weight="${m.isActive ? '600' : '400'}"
            text-anchor="middle"
            font-family="Arial, sans-serif"
          >${m.label}</text>
        `;
      }).join('')}

      <!-- Track bar with glow effect -->
      <rect x="${trackMargin}" y="${dateY}" width="${trackWidth}" height="${trackHeight}" fill="rgba(0,0,0,0.3)" rx="${trackHeight / 2}" />
      <rect x="${trackMargin}" y="${dateY}" width="${trackWidth}" height="${trackHeight}" fill="url(#trackGrad)" rx="${trackHeight / 2}" opacity="0.9" />

      <!-- Day marker with glow -->
      <rect x="${markerX - 3}" y="${dateY - (markerHeight - trackHeight) / 2}" width="6" height="${markerHeight}" fill="rgba(255,255,255,0.3)" rx="3" />
      <rect x="${markerX - 2}" y="${dateY - (markerHeight - trackHeight) / 2 + 2}" width="4" height="${markerHeight - 4}" fill="white" rx="2" />

      <!-- Day label badge -->
      <rect x="${markerX - 24}" y="${dateY - markerHeight / 2 - 38}" width="48" height="30" fill="url(#labelGrad)" rx="8" />
      <text x="${markerX}" y="${dateY - markerHeight / 2 - 16}" fill="white" font-size="18" font-weight="700" text-anchor="middle" font-family="Arial, sans-serif">${day}</text>

      <!-- Current date display (right side) -->
      <rect x="${canvasWidth - 180}" y="${imageHeight + 30}" width="150" height="50" rx="10" fill="rgba(0,0,0,0.25)" />
      <text x="${canvasWidth - 105}" y="${imageHeight + 63}" fill="rgba(255,255,255,0.9)" font-size="22" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${date}</text>
    </svg>
  `;
}

/**
 * Apply HD layout overlay to an image buffer
 * Creates a 1280x720 canvas with image in top-left and info panels around it
 * @param {Buffer} imageBuffer - Input image buffer (800x450)
 * @param {Object} weatherData - Weather metadata
 * @param {Object} weatherData.alicante - Alicante weather
 * @param {Object} weatherData.bratislava - Bratislava weather
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Buffer>} Output image buffer (1280x720) with layout
 */
export async function applyOverlayToBuffer(imageBuffer, weatherData, date) {
  const canvasWidth = 1280;
  const canvasHeight = 720;

  // Build weather objects
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

  // Generate HD layout SVG (background + info panels)
  const layoutSVG = generateHDLayoutSVG({
    alicanteWeather,
    bratislavaWeather,
    date
  });

  const svgBuffer = Buffer.from(layoutSVG);

  // Create the HD canvas with the layout SVG as background
  // Then composite the original image on top-left
  const result = await sharp(svgBuffer)
    .composite([{
      input: imageBuffer,
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
