const express = require('express');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8080', 10);
const TARGET_URL = process.env.TARGET_URL || 'https://www.algarapictures.com/webcam';
const CAPTURE_INTERVAL_MS = parseInt(process.env.CAPTURE_INTERVAL_MS || '60000', 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/tmp/images';
const IMAGE_FORMAT = (process.env.IMAGE_FORMAT || 'jpeg').toLowerCase(); // 'jpeg' or 'png'
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || '80', 10); // 0-100

// Optional: capture only a specific element (e.g., the webcam iframe)
// Example: CLIP_SELECTOR='iframe[src*="ipcamlive.com"]'
const CLIP_SELECTOR = process.env.CLIP_SELECTOR || '';
const CLIP_PADDING = parseInt(process.env.CLIP_PADDING || '0', 10); // px around the element
const WAIT_FOR_SELECTOR_TIMEOUT_MS = parseInt(process.env.WAIT_FOR_SELECTOR_TIMEOUT_MS || '30000', 10);
const POST_NAV_WAIT_MS = parseInt(process.env.POST_NAV_WAIT_MS || '1500', 10); // small delay to allow paint

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Lazy-load puppeteer on first use to speed cold start of the web server
let puppeteer; // assigned on first capture
let browser;    // reused across captures
let capturing = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBrowser() {
  if (!puppeteer) {
    puppeteer = require('puppeteer');
  }
  if (browser && browser.isConnected()) return browser;

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  };

  // Allow Puppeteer image to provide chromium path
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  browser = await puppeteer.launch(launchOptions);
  return browser;
}

function nowIsoNoColons() {
  // Make filename friendly for most filesystems
  return new Date().toISOString().replace(/[:]/g, '-');
}

async function captureOnce() {
  if (capturing) return; // skip overlapping runs
  capturing = true;
  try {
    const b = await ensureBrowser();
    const page = await b.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    if (POST_NAV_WAIT_MS > 0) {
      await sleep(POST_NAV_WAIT_MS);
    }

    const ts = nowIsoNoColons();
    const fileBase = `webcam-${ts}`;
    const filePath = path.join(OUTPUT_DIR, `${fileBase}.${IMAGE_FORMAT === 'png' ? 'png' : 'jpg'}`);

    const shotOptions = IMAGE_FORMAT === 'png'
      ? { path: filePath, type: 'png' }
      : { path: filePath, type: 'jpeg', quality: Math.max(0, Math.min(100, JPEG_QUALITY)) };

    let clipped = false;
    if (CLIP_SELECTOR) {
      try {
        await page.waitForSelector(CLIP_SELECTOR, { timeout: WAIT_FOR_SELECTOR_TIMEOUT_MS, visible: true });
        const el = await page.$(CLIP_SELECTOR);
        if (!el) throw new Error('element not found after waitForSelector');

        if (CLIP_PADDING > 0) {
          const box = await el.boundingBox();
          if (!box) throw new Error('no bounding box for element');
          const clip = {
            x: Math.max(0, Math.floor(box.x - CLIP_PADDING)),
            y: Math.max(0, Math.floor(box.y - CLIP_PADDING)),
            width: Math.ceil(box.width + CLIP_PADDING * 2),
            height: Math.ceil(box.height + CLIP_PADDING * 2),
          };
          await page.screenshot({ ...shotOptions, clip });
        } else {
          await el.screenshot(shotOptions);
        }
        clipped = true;
      } catch (e) {
        console.warn(`[capture] CLIP_SELECTOR failed: ${e && e.message ? e.message : e}. Falling back to full-page viewport screenshot.`);
      }
    }

    if (!clipped) {
      await page.screenshot(shotOptions);
    }
    await page.close();

    console.log(`[capture] Saved ${filePath}`);
  } catch (err) {
    console.error('[capture] Error:', err && err.message ? err.message : err);
    try {
      if (browser) {
        await browser.close();
      }
    } catch (_) {
      // ignore
    } finally {
      browser = null;
    }
  } finally {
    capturing = false;
  }
}

function getLatestImagePath() {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
      .map(name => ({ name, full: path.join(OUTPUT_DIR, name), stat: fs.statSync(path.join(OUTPUT_DIR, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return files.length ? files[0].name : null;
  } catch (e) {
    return null;
  }
}

// Start periodic capture timer
setInterval(() => {
  captureOnce();
}, Math.max(10_000, CAPTURE_INTERVAL_MS));

// Kick off an immediate first capture shortly after start
setTimeout(() => captureOnce(), 5000);

// Web server
const app = express();
app.disable('x-powered-by');
app.use(morgan('tiny'));

// Health checks
app.get('/healthz', (req, res) => res.status(200).send('OK'));
app.get('/readyz', (req, res) => res.status(200).send('READY'));

// Static serving of captured images
app.use('/images', express.static(OUTPUT_DIR, { maxAge: '60s', index: false }));

// Simple index page that shows the latest screenshot
app.get('/', (req, res) => {
  const latest = getLatestImagePath();
  const latestUrl = latest ? `/images/${encodeURIComponent(latest)}` : null;
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Webcam Snapshot Service</title>
    <meta http-equiv="refresh" content="30" />
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; }
      header { margin-bottom: 16px; }
      img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }
      .meta { color: #666; font-size: 0.9em; margin: 8px 0; }
      .grid { display: grid; gap: 16px; }
      a.button { display: inline-block; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; }
      code { background: #f6f8fa; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <header>
      <h1>Webcam Snapshot Service</h1>
      <div class="meta">Target: <code>${TARGET_URL}</code></div>
      <div class="meta">Interval: <code>${CAPTURE_INTERVAL_MS} ms</code> • Output: <code>${OUTPUT_DIR}</code></div>
      <div class="grid">
        <a class="button" href="/images/" target="_blank">Browse images</a>
        <a class="button" href="/healthz" target="_blank">Health</a>
      </div>
    </header>
    ${latestUrl ? `<img src="${latestUrl}" alt="Latest screenshot" />` : '<p>No screenshots yet. First capture will appear soon…</p>'}
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(body);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  console.log(`Saving images to ${OUTPUT_DIR}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`Received ${signal}, shutting down…`);
  Promise.resolve()
    .then(() => browser && browser.close())
    .catch(() => {})
    .finally(() => process.exit(0));
}
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => shutdown(sig)));
