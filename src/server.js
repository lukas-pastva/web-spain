const express = require('express');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8080', 10);
const TARGET_URL = process.env.TARGET_URL || 'https://www.algarapictures.com/webcam';
const CAPTURE_INTERVAL_MS = parseInt(process.env.CAPTURE_INTERVAL_MS || '300000', 10); // default 5 minutes
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/tmp/images';
const IMAGE_FORMAT = (process.env.IMAGE_FORMAT || 'jpeg').toLowerCase(); // 'jpeg' or 'png'
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || '80', 10); // 0-100

// Optional: capture only a specific element (e.g., the webcam iframe)
// Example: CLIP_SELECTOR='iframe[src*="ipcamlive.com"]'
const CLIP_SELECTOR = process.env.CLIP_SELECTOR || '';
// Optionally, promote a selector to fullscreen before capture. If FULLSCREEN_SELECTOR is not set,
// the CLIP_SELECTOR will be used. Enabled by default to better match "capture the video on fullscreen".
const FULLSCREEN_SELECTOR = process.env.FULLSCREEN_SELECTOR || '';
const MAKE_CLIP_FULLSCREEN = /^(1|true|yes|on)$/i.test(process.env.MAKE_CLIP_FULLSCREEN || 'true');
const FULLSCREEN_BG = process.env.FULLSCREEN_BG || '#000';
const FULLSCREEN_DELAY_MS = parseInt(process.env.FULLSCREEN_DELAY_MS || '400', 10);
const CLIP_PADDING = parseInt(process.env.CLIP_PADDING || '0', 10); // px around the element
const WAIT_FOR_SELECTOR_TIMEOUT_MS = parseInt(process.env.WAIT_FOR_SELECTOR_TIMEOUT_MS || '30000', 10);
const POST_NAV_WAIT_MS = parseInt(process.env.POST_NAV_WAIT_MS || '1500', 10); // small delay to allow paint
// Some streaming pages never reach network idle; allow configuring the goto waitUntil.
const NAV_WAIT_UNTIL = (process.env.NAV_WAIT_UNTIL || 'domcontentloaded'); // 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
// Jitter settings so captures don't look like a strict cron
const JITTER_MS = parseInt(process.env.JITTER_MS || '30000', 10); // ±30s by default

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Lazy-load puppeteer on first use to speed cold start of the web server
let puppeteer; // assigned on first capture
let browser;    // reused across captures
let capturing = false;
let scheduleTimer = null;

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
      '--autoplay-policy=no-user-gesture-required',
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
    await page.goto(TARGET_URL, { waitUntil: NAV_WAIT_UNTIL, timeout: 60_000 });
    if (POST_NAV_WAIT_MS > 0) {
      await sleep(POST_NAV_WAIT_MS);
    }

    // Try to promote the target element (webcam iframe) to fullscreen to capture only the video
    // at a full-viewport resolution. This is especially useful when the page constrains the
    // iframe to a smaller box.
    let fullscreenApplied = false;
    const fullscreenTargetSelector = (FULLSCREEN_SELECTOR || CLIP_SELECTOR || '').trim();
    if (fullscreenTargetSelector && MAKE_CLIP_FULLSCREEN) {
      try {
        await page.waitForSelector(fullscreenTargetSelector, { timeout: WAIT_FOR_SELECTOR_TIMEOUT_MS, visible: true });
        fullscreenApplied = await page.evaluate((sel, bg) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          // Hide everything except the element and its ancestor chain
          const ancestors = new Set();
          let n = el;
          while (n) { ancestors.add(n); n = n.parentElement; }
          const body = document.body;
          for (const child of Array.from(body.children)) {
            if (!ancestors.has(child)) {
              child.style.setProperty('display', 'none', 'important');
              child.style.setProperty('visibility', 'hidden', 'important');
            }
          }
          document.documentElement.style.setProperty('overflow', 'hidden', 'important');
          body.style.setProperty('margin', '0', 'important');
          body.style.setProperty('padding', '0', 'important');

          // Make the element itself fixed and cover the viewport
          const s = el.style;
          s.setProperty('position', 'fixed', 'important');
          s.setProperty('top', '0', 'important');
          s.setProperty('left', '0', 'important');
          s.setProperty('width', '100vw', 'important');
          s.setProperty('height', '100vh', 'important');
          s.setProperty('max-width', '100vw', 'important');
          s.setProperty('max-height', '100vh', 'important');
          s.setProperty('margin', '0', 'important');
          s.setProperty('padding', '0', 'important');
          s.setProperty('transform', 'none', 'important');
          s.setProperty('z-index', '2147483647', 'important');
          s.setProperty('background', bg || '#000', 'important');
          return true;
        }, fullscreenTargetSelector, FULLSCREEN_BG);
        if (fullscreenApplied && FULLSCREEN_DELAY_MS > 0) {
          await sleep(FULLSCREEN_DELAY_MS);
        }
      } catch (e) {
        // If fullscreen attempt fails, continue with normal clipping logic
        fullscreenApplied = false;
      }
    }

    const ts = nowIsoNoColons();
    const fileBase = `webcam-${ts}`;
    const filePath = path.join(OUTPUT_DIR, `${fileBase}.${IMAGE_FORMAT === 'png' ? 'png' : 'jpg'}`);

    const shotOptions = IMAGE_FORMAT === 'png'
      ? { path: filePath, type: 'png' }
      : { path: filePath, type: 'jpeg', quality: Math.max(0, Math.min(100, JPEG_QUALITY)) };

    let clipped = false;
    if (!fullscreenApplied && CLIP_SELECTOR) {
      try {
        await page.waitForSelector(CLIP_SELECTOR, { timeout: WAIT_FOR_SELECTOR_TIMEOUT_MS, visible: true });
        const el = await page.$(CLIP_SELECTOR);
        if (!el) throw new Error('element not found after waitForSelector');

        if (CLIP_PADDING > 0) {
          // Ensure element is in view before measuring
          try { await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' })); } catch (_) {}
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

    if (fullscreenApplied) {
      await page.screenshot(shotOptions);
    } else if (!clipped) {
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

function computeNextDelay() {
  const base = Math.max(10_000, CAPTURE_INTERVAL_MS);
  const jitter = Math.max(0, JITTER_MS);
  if (jitter === 0) return base;
  const delta = Math.floor(Math.random() * (2 * jitter + 1)) - jitter; // [-jitter, +jitter]
  const delay = Math.max(10_000, base + delta);
  return delay;
}

function scheduleNext() {
  const delay = computeNextDelay();
  if (scheduleTimer) clearTimeout(scheduleTimer);
  console.log(`[schedule] Next capture in ${Math.round(delay / 1000)}s (base=${Math.round(CAPTURE_INTERVAL_MS/1000)}s ±${Math.round(JITTER_MS/1000)}s)`);
  scheduleTimer = setTimeout(runCaptureThenSchedule, delay);
}

async function runCaptureThenSchedule() {
  try {
    await captureOnce();
  } catch (_) {
    // captureOnce already logs errors
  } finally {
    scheduleNext();
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

// Kick off an immediate first capture shortly after start, then schedule with jitter
setTimeout(() => runCaptureThenSchedule(), 5000);

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
