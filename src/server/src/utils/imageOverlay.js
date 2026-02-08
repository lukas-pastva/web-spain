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
 * Generate SVG for 7-day temperature chart
 * @param {Array} temperatureHistory - Array of {time, alicanteTemp, bratislavaTemp}
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Chart width
 * @param {number} height - Chart height
 * @returns {string} SVG markup
 */
function generateTemperatureChartSVG(temperatureHistory, x, y, width, height) {
  if (!temperatureHistory || temperatureHistory.length < 2) {
    return `
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="rgba(0,0,0,0.3)" />
      <text x="${x + width/2}" y="${y + height/2}" fill="rgba(255,255,255,0.5)" font-size="14" text-anchor="middle" font-family="Arial, sans-serif">No temperature data</text>
    `;
  }

  // Find min/max temps for scaling
  let minTemp = Infinity, maxTemp = -Infinity;
  for (const point of temperatureHistory) {
    if (point.alicanteTemp !== null) {
      minTemp = Math.min(minTemp, point.alicanteTemp);
      maxTemp = Math.max(maxTemp, point.alicanteTemp);
    }
    if (point.bratislavaTemp !== null) {
      minTemp = Math.min(minTemp, point.bratislavaTemp);
      maxTemp = Math.max(maxTemp, point.bratislavaTemp);
    }
  }

  // Add padding to temp range
  const tempPadding = Math.max(3, (maxTemp - minTemp) * 0.15);
  minTemp = Math.floor(minTemp - tempPadding);
  maxTemp = Math.ceil(maxTemp + tempPadding);
  const tempRange = maxTemp - minTemp || 1;

  const chartPadding = { top: 35, right: 15, bottom: 35, left: 45 };
  const chartWidth = width - chartPadding.left - chartPadding.right;
  const chartHeight = height - chartPadding.top - chartPadding.bottom;
  const chartX = x + chartPadding.left;
  const chartY = y + chartPadding.top;

  // Generate path points
  const pointCount = temperatureHistory.length;
  const alicantePoints = [];
  const bratislavaPoints = [];

  for (let i = 0; i < pointCount; i++) {
    const point = temperatureHistory[i];
    const xPos = chartX + (i / (pointCount - 1)) * chartWidth;

    if (point.alicanteTemp !== null) {
      const yPos = chartY + chartHeight - ((point.alicanteTemp - minTemp) / tempRange) * chartHeight;
      alicantePoints.push({ x: xPos, y: yPos, temp: point.alicanteTemp });
    }
    if (point.bratislavaTemp !== null) {
      const yPos = chartY + chartHeight - ((point.bratislavaTemp - minTemp) / tempRange) * chartHeight;
      bratislavaPoints.push({ x: xPos, y: yPos, temp: point.bratislavaTemp });
    }
  }

  // Create smooth SVG paths using bezier curves
  const createSmoothPath = (points) => {
    if (points.length < 2) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
    }
    return path;
  };

  const alicantePath = createSmoothPath(alicantePoints);
  const bratislavaPath = createSmoothPath(bratislavaPoints);

  // Create area fill paths
  const createAreaPath = (points) => {
    if (points.length < 2) return '';
    let path = createSmoothPath(points);
    const last = points[points.length - 1];
    const first = points[0];
    path += ` L ${last.x} ${chartY + chartHeight} L ${first.x} ${chartY + chartHeight} Z`;
    return path;
  };

  // Generate day labels (7 days)
  const dayLabels = [];
  const daysCount = 7;
  for (let d = 0; d <= daysCount; d++) {
    const xPos = chartX + (d / daysCount) * chartWidth;
    const label = d === daysCount ? 'Now' : `-${daysCount - d}d`;
    dayLabels.push({ x: xPos, label });
  }

  // Generate temp labels
  const tempLabels = [];
  const tempStep = Math.ceil(tempRange / 5);
  for (let t = minTemp; t <= maxTemp; t += tempStep) {
    const yPos = chartY + chartHeight - ((t - minTemp) / tempRange) * chartHeight;
    tempLabels.push({ y: yPos, label: `${t}°` });
  }

  // Current temps (last point)
  const lastPoint = temperatureHistory[temperatureHistory.length - 1];
  const currentAliTemp = lastPoint?.alicanteTemp?.toFixed(1) || '--';
  const currentBraTemp = lastPoint?.bratislavaTemp?.toFixed(1) || '--';

  return `
    <!-- Chart background with subtle gradient -->
    <defs>
      <linearGradient id="chartBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.4)" />
        <stop offset="100%" style="stop-color:rgba(0,0,0,0.25)" />
      </linearGradient>
      <linearGradient id="aliAreaGrad7" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgb(251,146,60);stop-opacity:0.35" />
        <stop offset="100%" style="stop-color:rgb(251,146,60);stop-opacity:0.05" />
      </linearGradient>
      <linearGradient id="braAreaGrad7" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgb(56,189,248);stop-opacity:0.35" />
        <stop offset="100%" style="stop-color:rgb(56,189,248);stop-opacity:0.05" />
      </linearGradient>
    </defs>

    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="url(#chartBgGrad)" />

    <!-- Chart title -->
    <text x="${x + width/2}" y="${y + 22}" fill="rgba(255,255,255,0.9)" font-size="14" font-weight="600" text-anchor="middle" font-family="Arial, sans-serif">7-DAY TEMPERATURE TREND</text>

    <!-- Horizontal grid lines -->
    ${tempLabels.map(t => `
      <line x1="${chartX}" y1="${t.y}" x2="${chartX + chartWidth}" y2="${t.y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <text x="${chartX - 8}" y="${t.y + 4}" fill="rgba(255,255,255,0.6)" font-size="11" text-anchor="end" font-family="Arial, sans-serif">${t.label}</text>
    `).join('')}

    <!-- Vertical grid lines for days -->
    ${dayLabels.map((d, i) => i < dayLabels.length - 1 ? `
      <line x1="${d.x}" y1="${chartY}" x2="${d.x}" y2="${chartY + chartHeight}" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="4,4" />
    ` : '').join('')}

    <!-- Day labels -->
    ${dayLabels.map(d => `
      <text x="${d.x}" y="${chartY + chartHeight + 18}" fill="rgba(255,255,255,0.6)" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">${d.label}</text>
    `).join('')}

    <!-- Area fills -->
    ${alicantePath ? `<path d="${createAreaPath(alicantePoints)}" fill="url(#aliAreaGrad7)" />` : ''}
    ${bratislavaPath ? `<path d="${createAreaPath(bratislavaPoints)}" fill="url(#braAreaGrad7)" />` : ''}

    <!-- Temperature lines -->
    ${bratislavaPath ? `<path d="${bratislavaPath}" fill="none" stroke="rgb(56,189,248)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ''}
    ${alicantePath ? `<path d="${alicantePath}" fill="none" stroke="rgb(251,146,60)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ''}

    <!-- Current value markers with glow -->
    ${alicantePoints.length > 0 ? `
      <circle cx="${alicantePoints[alicantePoints.length-1].x}" cy="${alicantePoints[alicantePoints.length-1].y}" r="6" fill="rgb(251,146,60)" opacity="0.3" />
      <circle cx="${alicantePoints[alicantePoints.length-1].x}" cy="${alicantePoints[alicantePoints.length-1].y}" r="4" fill="rgb(251,146,60)" stroke="white" stroke-width="2" />
    ` : ''}
    ${bratislavaPoints.length > 0 ? `
      <circle cx="${bratislavaPoints[bratislavaPoints.length-1].x}" cy="${bratislavaPoints[bratislavaPoints.length-1].y}" r="6" fill="rgb(56,189,248)" opacity="0.3" />
      <circle cx="${bratislavaPoints[bratislavaPoints.length-1].x}" cy="${bratislavaPoints[bratislavaPoints.length-1].y}" r="4" fill="rgb(56,189,248)" stroke="white" stroke-width="2" />
    ` : ''}

    <!-- Legend -->
    <circle cx="${x + 20}" cy="${y + height - 14}" r="5" fill="rgb(251,146,60)" />
    <text x="${x + 30}" y="${y + height - 10}" fill="rgba(255,255,255,0.9)" font-size="11" font-family="Arial, sans-serif">Alicante ${currentAliTemp}°</text>
    <circle cx="${x + 140}" cy="${y + height - 14}" r="5" fill="rgb(56,189,248)" />
    <text x="${x + 150}" y="${y + height - 10}" fill="rgba(255,255,255,0.9)" font-size="11" font-family="Arial, sans-serif">Bratislava ${currentBraTemp}°</text>
  `;
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
 * Generate SVG for calendar gauge showing day progress in month and year
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} size - Gauge size
 * @returns {string} SVG markup
 */
function generateCalendarGaugeSVG(cx, cy, date, size = 200) {
  const [year, month, day] = date.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfYear = Math.floor((new Date(year, month - 1, day) - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
  const daysInYear = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;

  const monthProgress = (day - 1) / (daysInMonth - 1);
  const yearProgress = (dayOfYear - 1) / (daysInYear - 1);

  const outerRadius = size / 2 - 5;
  const innerRadius = size / 2 - 35;
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  // Year progress arc (outer ring) - goes from -135° to 135° (270° total)
  const yearStartAngle = -135;
  const yearEndAngle = yearStartAngle + (yearProgress * 270);
  const yearArcPath = describeArc(cx, cy, outerRadius, yearStartAngle, yearEndAngle);
  const yearBgArcPath = describeArc(cx, cy, outerRadius, -135, 135);

  // Month progress arc (inner ring)
  const monthStartAngle = -135;
  const monthEndAngle = monthStartAngle + (monthProgress * 270);
  const monthArcPath = describeArc(cx, cy, innerRadius, monthStartAngle, monthEndAngle);
  const monthBgArcPath = describeArc(cx, cy, innerRadius, -135, 135);

  // Calculate marker positions
  const yearMarkerPos = polarToCartesian(cx, cy, outerRadius, yearEndAngle);
  const monthMarkerPos = polarToCartesian(cx, cy, innerRadius, monthEndAngle);

  return `
    <!-- Calendar gauge background -->
    <circle cx="${cx}" cy="${cy}" r="${size/2}" fill="rgba(0,0,0,0.3)" />

    <!-- Year progress background arc -->
    <path d="${yearBgArcPath}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="18" stroke-linecap="round" />

    <!-- Year progress arc with gradient -->
    <defs>
      <linearGradient id="yearGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgb(34,211,238)" />
        <stop offset="50%" style="stop-color:rgb(56,189,248)" />
        <stop offset="100%" style="stop-color:rgb(99,102,241)" />
      </linearGradient>
      <linearGradient id="monthGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:rgb(251,146,60)" />
        <stop offset="100%" style="stop-color:rgb(245,158,11)" />
      </linearGradient>
    </defs>
    <path d="${yearArcPath}" fill="none" stroke="url(#yearGrad)" stroke-width="18" stroke-linecap="round" />

    <!-- Month progress background arc -->
    <path d="${monthBgArcPath}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="14" stroke-linecap="round" />

    <!-- Month progress arc -->
    <path d="${monthArcPath}" fill="none" stroke="url(#monthGrad)" stroke-width="14" stroke-linecap="round" />

    <!-- Year marker dot -->
    <circle cx="${yearMarkerPos.x}" cy="${yearMarkerPos.y}" r="6" fill="white" />

    <!-- Month marker dot -->
    <circle cx="${monthMarkerPos.x}" cy="${monthMarkerPos.y}" r="5" fill="white" />

    <!-- Center content -->
    <text x="${cx}" y="${cy - 20}" fill="rgba(255,255,255,0.6)" font-size="12" text-anchor="middle" font-family="Arial, sans-serif">${monthNames[month - 1]}</text>
    <text x="${cx}" y="${cy + 12}" fill="white" font-size="42" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${day}</text>
    <text x="${cx}" y="${cy + 35}" fill="rgba(255,255,255,0.6)" font-size="14" text-anchor="middle" font-family="Arial, sans-serif">${year}</text>

    <!-- Legend at bottom -->
    <circle cx="${cx - 40}" cy="${cy + size/2 - 25}" r="4" fill="rgb(56,189,248)" />
    <text x="${cx - 30}" y="${cy + size/2 - 21}" fill="rgba(255,255,255,0.7)" font-size="10" font-family="Arial, sans-serif">Year</text>
    <circle cx="${cx + 15}" cy="${cy + size/2 - 25}" r="4" fill="rgb(251,146,60)" />
    <text x="${cx + 25}" y="${cy + size/2 - 21}" fill="rgba(255,255,255,0.7)" font-size="10" font-family="Arial, sans-serif">Month</text>
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
 * @param {Array} options.temperatureHistory - Optional 7-day temperature history
 * @returns {string} Complete SVG markup for info panels (not including image)
 */
export function generateHDLayoutSVG({ alicanteWeather, bratislavaWeather, date, temperatureHistory = null }) {
  const canvasWidth = 1280;
  const canvasHeight = 720;
  const imageWidth = 800;
  const imageHeight = 450;
  const sidePanelWidth = canvasWidth - imageWidth; // 480
  const bottomPanelHeight = canvasHeight - imageHeight; // 270

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

  // Chart dimensions - wider for 7-day view
  const chartWidth = 820;
  const chartHeight = 230;
  const chartX = 20;
  const chartY = imageHeight + 20;

  // Calendar gauge position - right side of bottom panel
  const gaugeSize = 200;
  const gaugeCx = canvasWidth - 140;
  const gaugeCy = imageHeight + bottomPanelHeight / 2 + 10;

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

      <!-- 7-day Temperature chart (always shown) -->
      ${generateTemperatureChartSVG(temperatureHistory, chartX, chartY, chartWidth, chartHeight)}

      <!-- Difference indicators (compact, next to chart) -->
      <rect x="${chartX + chartWidth + 15}" y="${chartY}" width="105" height="110" rx="10" fill="rgba(0,0,0,0.25)" />
      <text x="${chartX + chartWidth + 67}" y="${chartY + 22}" fill="rgba(255,255,255,0.7)" font-size="10" text-anchor="middle" font-family="Arial, sans-serif">TEMP DIFF</text>
      <text x="${chartX + chartWidth + 67}" y="${chartY + 55}" fill="${diffColor}" font-size="26" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${diffSign}${diff.toFixed(1)}°</text>
      <text x="${chartX + chartWidth + 67}" y="${chartY + 75}" fill="rgba(255,255,255,0.5)" font-size="9" text-anchor="middle" font-family="Arial, sans-serif">${diffLabel}</text>

      <rect x="${chartX + chartWidth + 15}" y="${chartY + 120}" width="105" height="110" rx="10" fill="rgba(0,0,0,0.25)" />
      <text x="${chartX + chartWidth + 67}" y="${chartY + 142}" fill="rgba(255,255,255,0.7)" font-size="10" text-anchor="middle" font-family="Arial, sans-serif">DAY LENGTH</text>
      <text x="${chartX + chartWidth + 67}" y="${chartY + 175}" fill="${dayLengthColor}" font-size="22" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif">${dayLengthDiffStr}</text>
      <text x="${chartX + chartWidth + 67}" y="${chartY + 195}" fill="rgba(255,255,255,0.5)" font-size="9" text-anchor="middle" font-family="Arial, sans-serif">${dayLengthLabel}</text>

      <!-- Calendar gauge (right side) -->
      ${generateCalendarGaugeSVG(gaugeCx, gaugeCy, date, gaugeSize)}
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
 * @param {Object} options - Optional settings
 * @param {Array} options.temperatureHistory - 7-day temperature history
 * @returns {Promise<Buffer>} Output image buffer (1280x720) with layout
 */
export async function applyOverlayToBuffer(imageBuffer, weatherData, date, options = {}) {
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
    date,
    temperatureHistory: options.temperatureHistory || null
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
