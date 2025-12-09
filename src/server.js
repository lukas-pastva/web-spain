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
// the CLIP_SELECTOR will be used. Disabled by default to align with "capture only the video area".
const FULLSCREEN_SELECTOR = process.env.FULLSCREEN_SELECTOR || '';
const MAKE_CLIP_FULLSCREEN = /^(1|true|yes|on)$/i.test(process.env.MAKE_CLIP_FULLSCREEN || 'false');
const FULLSCREEN_BG = process.env.FULLSCREEN_BG || '#000';
const FULLSCREEN_DELAY_MS = parseInt(process.env.FULLSCREEN_DELAY_MS || '400', 10);
// Handle consent/cookie banners automatically so capture isn't blocked
const AUTO_CONSENT = /^(1|true|yes|on)$/i.test(process.env.AUTO_CONSENT || 'true');
const CONSENT_TIMEOUT_MS = parseInt(process.env.CONSENT_TIMEOUT_MS || '8000', 10);
const CLIP_PADDING = parseInt(process.env.CLIP_PADDING || '0', 10); // px around the element
const WAIT_FOR_SELECTOR_TIMEOUT_MS = parseInt(process.env.WAIT_FOR_SELECTOR_TIMEOUT_MS || '30000', 10);
const POST_NAV_WAIT_MS = parseInt(process.env.POST_NAV_WAIT_MS || '1500', 10); // small delay to allow paint
// Some streaming pages never reach network idle; allow configuring the goto waitUntil.
const NAV_WAIT_UNTIL = (process.env.NAV_WAIT_UNTIL || 'domcontentloaded'); // 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
// Jitter settings so captures don't look like a strict cron
const JITTER_MS = parseInt(process.env.JITTER_MS || '30000', 10); // ±30s by default

// Viewport tuning (resolution and sharpness)
const VIEWPORT_WIDTH = parseInt(process.env.VIEWPORT_WIDTH || '1920', 10);
const VIEWPORT_HEIGHT = parseInt(process.env.VIEWPORT_HEIGHT || '1080', 10);
const DEVICE_SCALE_FACTOR = parseFloat(process.env.DEVICE_SCALE_FACTOR || '1');

// Optionally click the player's own fullscreen control inside the iframe
const CLICK_IFRAME_FULLSCREEN = /^(1|true|yes|on)$/i.test(process.env.CLICK_IFRAME_FULLSCREEN || 'false');
// New: try clicking the player's central Play button before capture
const CLICK_IFRAME_PLAY = /^(1|true|yes|on)$/i.test(process.env.CLICK_IFRAME_PLAY || 'false');
// New: combined mode – click play, then click fullscreen (also used by capture mode)
const CLICK_IFRAME_PLAY_FULLSCREEN = /^(1|true|yes|on)$/i.test(process.env.CLICK_IFRAME_PLAY_FULLSCREEN || 'false');
const PLAYER_FRAME_URL_MATCH = process.env.PLAYER_FRAME_URL_MATCH || 'ipcamlive.com';
// Comma-separated list to override default fullscreen control selectors inside the frame
const PLAYER_FULLSCREEN_SELECTORS = (process.env.PLAYER_FULLSCREEN_SELECTORS || '').split(',').map(s => s.trim()).filter(Boolean);
// Comma-separated list to override default play control selectors inside the frame
const PLAYER_PLAY_SELECTORS = (process.env.PLAYER_PLAY_SELECTORS || '').split(',').map(s => s.trim()).filter(Boolean);
// How long to wait after clicking play before capturing (ms)
const PLAY_WAIT_MS = parseInt(process.env.PLAY_WAIT_MS || '1200', 10);
// How long to wait for a <video> element to start playing (polling timeout, ms)
const WAIT_FOR_PLAYING_TIMEOUT_MS = parseInt(process.env.WAIT_FOR_PLAYING_TIMEOUT_MS || '4000', 10);
// If CLIP_SELECTOR isn't provided, attempt to auto-clip the visible iframe matching PLAYER_FRAME_URL_MATCH
const AUTO_CLIP_IFRAME_BY_URL = /^(1|true|yes|on)$/i.test(process.env.AUTO_CLIP_IFRAME_BY_URL || 'true');

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
  // Persist session/cookies between runs if a user data dir is provided
  if (process.env.USER_DATA_DIR) {
    launchOptions.userDataDir = process.env.USER_DATA_DIR;
  }

  browser = await puppeteer.launch(launchOptions);
  return browser;
}

function nowIsoNoColons() {
  // Make filename friendly for most filesystems
  return new Date().toISOString().replace(/[:]/g, '-');
}

async function tryHandleConsent(page) {
  if (!AUTO_CONSENT) return;
  const deadline = Date.now() + Math.max(0, CONSENT_TIMEOUT_MS);
  let accepted = false;
  let bannerDismissed = false;

  async function clickInContext(ctx, sel) {
    try {
      const el = await ctx.$(sel);
      if (!el) return false;
      await el.click({ delay: 10 });
      return true;
    } catch (_) {
      try {
        return await ctx.evaluate((s) => {
          const e = document.querySelector(s);
          if (!e) return false;
          e.click();
          return true;
        }, sel);
      } catch (_) {
        return false;
      }
    }
  }

  const consentSelectors = [
    'button.fc-cta-consent',
    'button.fc-data-preferences-accept-all',
    'button.fc-vendor-preferences-accept-all',
    'button.fc-confirm-choices',
    '.fc-consent-root button.fc-primary-button',
  ];

  // Fallback: search for common consent labels (English + Spanish minimal set)
  const consentTextRegexes = [
    /^(?:consent|accept|accept all|agree|allow|confirm|ok)\b/i,
    /^(?:aceptar|aceptar todo|consentir|confirmar|permitir|de acuerdo)\b/i,
  ];
  async function clickByText(ctx) {
    try {
      return await ctx.evaluate((patterns) => {
        function textOf(el) { return (el.innerText || el.textContent || '').trim(); }
        const matchesAny = (txt) => patterns.some((p) => new RegExp(p).test(txt));
        const q = [
          'button', '[role="button"]',
          '.fc-consent-root button', '.fc-consent-root [role="button"]',
        ].join(',');
        const els = Array.from(document.querySelectorAll(q));
        for (const el of els) {
          const txt = textOf(el);
          if (!txt) continue;
          if (matchesAny(txt) && !/manage|options|reject|rechazar/i.test(txt)) {
            el.click();
            return true;
          }
        }
        return false;
      }, consentTextRegexes.map((r) => r.source));
    } catch (_) {
      return false;
    }
  }

  while (Date.now() < deadline && (!accepted || !bannerDismissed)) {
    try {
      if (!bannerDismissed) {
        bannerDismissed = await page.evaluate(() => {
          const btn = document.querySelector('#d-notification-bar .notification-dismiss');
          if (btn) { btn.click(); return true; }
          return false;
        }).catch(() => false);
      }

      if (!accepted) {
        for (const sel of consentSelectors) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await clickInContext(page, sel);
          if (ok) { accepted = true; break; }
        }
        if (!accepted) {
          // Try text-based fallback in main document
          // eslint-disable-next-line no-await-in-loop
          accepted = await clickByText(page);
        }
      }

      if (!accepted) {
        const frames = page.frames();
        for (const f of frames) {
          // eslint-disable-next-line no-await-in-loop
          for (const sel of consentSelectors) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await clickInContext(f, sel);
            if (ok) { accepted = true; break; }
          }
          if (accepted) break;
          // eslint-disable-next-line no-await-in-loop
          if (!accepted) accepted = await clickByText(f);
          if (accepted) break;
        }
      }

      if (accepted) {
        await new Promise(r => setTimeout(r, 200));
        const stillVisible = await page.evaluate(() => !!document.querySelector('.fc-consent-root'))
          .catch(() => false);
        if (!stillVisible) break;
      }
    } catch (_) {
      // ignore and retry briefly
    }
    await new Promise(r => setTimeout(r, 250));
  }

  if (accepted) {
    console.log('[consent] Accepted cookie/consent dialog');
  } else {
    console.log('[consent] No consent dialog handled (not found or skipped)');
  }
}

async function tryClickPlayerFullscreen(page, opts = {}) {
  const force = !!opts.force;
  if (!CLICK_IFRAME_FULLSCREEN && !force) return false;
  try {
    // Find the iframe frame that likely hosts the player
    const frames = page.frames();
    const playerFrame = frames.find(f => (f.url() || '').includes(PLAYER_FRAME_URL_MATCH));
    if (!playerFrame) return false;

    // Try to generate a user gesture inside the frame (some players require a gesture for fullscreen)
    try { await playerFrame.click('body', { delay: 10 }); } catch (_) {}

    const selectors = PLAYER_FULLSCREEN_SELECTORS.length ? PLAYER_FULLSCREEN_SELECTORS : [
      // Common HTML attributes/text
      'button[aria-label*="Full" i]',
      'button[title*="Full" i]',
      'button[aria-label*="pantalla" i]',
      'button[title*="pantalla" i]',
      // Popular player classes
      '.vjs-fullscreen-control',
      '.jw-icon-fullscreen',
      // Generic fallbacks
      'button[class*="full" i]',
      '[class*="fullscreen" i]',
      'a[title*="full" i]',
    ];

    for (const sel of selectors) {
      try {
        const el = await playerFrame.$(sel);
        if (!el) continue;
        await el.click({ delay: 10 });
        // brief wait for layout
        await sleep(Math.max(150, FULLSCREEN_DELAY_MS));
        // Heuristic: if the document has a fullscreen element or body is styled fullscreen-ish
        const wentFs = await playerFrame.evaluate(() => {
          if (document.fullscreenElement) return true;
          // Many players toggle a fullscreen class on body or root
          const cls = (document.body && document.body.className) || '';
          return /full\s?screen|vjs-fullscreen/i.test(cls);
        }).catch(() => true); // cross-origin heuristics may fail; assume success after click
        if (wentFs) return true;
      } catch (_) {
        // try next selector
      }
    }

    // As a last resort, attempt programmatic fullscreen on a likely media element.
    try {
      const ok = await playerFrame.evaluate(async () => {
        const el = document.querySelector('video, canvas, .player, #player, [class*="player"]');
        const target = el || document.documentElement;
        if (target && target.requestFullscreen) {
          try { await target.requestFullscreen(); return true; } catch (_) { /* ignored */ }
        }
        return false;
      });
      if (ok) {
        await sleep(Math.max(150, FULLSCREEN_DELAY_MS));
        return true;
      }
    } catch (_) { /* ignore */ }
  } catch (_) {
    // ignore
  }
  return false;
}

async function tryClickPlayerPlay(page, opts = {}) {
  const force = !!opts.force;
  if (!CLICK_IFRAME_PLAY && !force) return false;
  try {
    const frames = page.frames();
    const playerFrame = frames.find(f => (f.url() || '').includes(PLAYER_FRAME_URL_MATCH));
    if (!playerFrame) return false;

    // Attempt to click a central/big play control commonly used by players
    const selectors = PLAYER_PLAY_SELECTORS.length ? PLAYER_PLAY_SELECTORS : [
      // Common ARIA/title labels
      'button[aria-label*="play" i]',
      'button[title*="play" i]',
      'button[aria-label*="reproducir" i]',
      'button[title*="reproducir" i]',
      // Popular players
      '.vjs-big-play-button',
      '.jw-icon-playback',
      '.jw-icon-play',
      '.fp-play',
      // Generic fallbacks
      'button[class*="play" i]',
      '[class*="big-play" i]',
      '[class*="center" i][class*="play" i]'
    ];

    // Try a light tap inside the frame to generate a gesture context
    try { await playerFrame.click('body', { delay: 10 }); } catch (_) {}

    for (const sel of selectors) {
      try {
        const el = await playerFrame.$(sel);
        if (!el) continue;
        await el.click({ delay: 10 });
        // Wait a moment for playback to start
        await sleep(Math.max(0, PLAY_WAIT_MS));
        const isPlaying = await playerFrame.evaluate((timeoutMs) => new Promise(resolve => {
          const deadline = Date.now() + Math.max(0, timeoutMs || 0);
          function check() {
            try {
              const v = document.querySelector('video');
              if (v && !v.paused && v.readyState >= 2) return resolve(true);
            } catch (_) {}
            if (Date.now() > deadline) return resolve(false);
            setTimeout(check, 200);
          }
          check();
        }), WAIT_FOR_PLAYING_TIMEOUT_MS).catch(() => true); // if cross-origin execution fails, assume success
        if (isPlaying) return true;
      } catch (_) {
        // try next selector
      }
    }

    // As a last resort, programmatically attempt to start playback on a <video>
    try {
      const ok = await playerFrame.evaluate(async () => {
        const v = document.querySelector('video');
        if (!v) return false;
        try { v.muted = true; } catch (_) {}
        try { await v.play(); return true; } catch (_) { return false; }
      });
      if (ok) {
        await sleep(Math.max(0, PLAY_WAIT_MS));
        return true;
      }
    } catch (_) { /* ignore */ }
  } catch (_) {
    // ignore
  }
  return false;
}

// Helper: hover over the video (prefer bottom-right) to reveal controls inside the frame
async function hoverVideoBottomRight(playerFrame, page) {
  try {
    const el = await playerFrame.$('video, .vjs-tech, .jw-video, canvas, .player, [class*="player" i]');
    if (!el) {
      try { await playerFrame.hover('body'); } catch (_) {}
      await sleep(200);
      return false;
    }
    try { await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' })); } catch (_) {}
    const box = await el.boundingBox();
    if (!box) { try { await playerFrame.hover('video'); } catch (_) {} await sleep(200); return false; }
    const x = Math.floor(box.x + Math.max(0, box.width) - 4);
    const y = Math.floor(box.y + Math.max(0, box.height) - 4);
    try {
      await page.mouse.move(x, y, { steps: 2 });
    } catch (_) {
      try { await playerFrame.hover('video'); } catch (_) {}
    }
    await sleep(250);
    return true;
  } catch (_) {
    return false;
  }
}

// Combined: play then hover to reveal controls and click fullscreen
async function tryClickPlayerPlayThenFullscreen(page) {
  try {
    const frames = page.frames();
    const playerFrame = frames.find(f => (f.url() || '').includes(PLAYER_FRAME_URL_MATCH));
    if (!playerFrame) return false;

    // Try to start playback first
    await tryClickPlayerPlay(page, { force: true });
    // Hover to reveal the controls (bottom-right)
    await hoverVideoBottomRight(playerFrame, page);
    // Then click fullscreen inside the frame
    const ok = await tryClickPlayerFullscreen(page, { force: true });
    if (ok) return true;
  } catch (_) { /* ignore */ }
  return false;
}

async function captureOnce(options = {}) {
  if (capturing) return; // skip overlapping runs
  capturing = true;
  try {
    const b = await ensureBrowser();
    const page = await b.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
    await page.goto(TARGET_URL, { waitUntil: NAV_WAIT_UNTIL, timeout: 60_000 });
    if (POST_NAV_WAIT_MS > 0) {
      await sleep(POST_NAV_WAIT_MS);
    }

    // Attempt to accept cookie/consent banners that may obscure content
    await tryHandleConsent(page);

    // Option 0: if requested, click play then hover to reveal controls and click fullscreen
    const wantPlayThenFullscreen = options.playThenFullscreen === true || (options.playThenFullscreen === undefined && CLICK_IFRAME_PLAY_FULLSCREEN);
    let combinedFullscreen = false;
    if (wantPlayThenFullscreen) {
      try { combinedFullscreen = await tryClickPlayerPlayThenFullscreen(page); } catch (_) { /* ignore */ }
    }

    // Option 1: try clicking the player's own fullscreen button inside the iframe
    let playerFullscreen = combinedFullscreen || await tryClickPlayerFullscreen(page);

    // Option 1b: optionally click the player's central Play control before capture
    let playerPlayClicked = false;
    try {
      const wantPlay = !combinedFullscreen && (options.playThenCapture === true || (options.playThenCapture === undefined && CLICK_IFRAME_PLAY));
      if (wantPlay) {
        playerPlayClicked = await tryClickPlayerPlay(page);
      }
    } catch (_) { /* ignore */ }

    // Option 2: as a fallback, promote the target element (webcam iframe) to fullscreen via CSS
    let fullscreenApplied = false;
    if (!playerFullscreen) {
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

    if (playerFullscreen || fullscreenApplied) {
      await page.screenshot(shotOptions);
    } else if (!clipped) {
      // Optional auto-clip: if CLIP_SELECTOR not provided, crop to the visible iframe that matches PLAYER_FRAME_URL_MATCH
      let autoClipped = false;
      if (AUTO_CLIP_IFRAME_BY_URL && (!CLIP_SELECTOR || CLIP_SELECTOR.trim() === '')) {
        try {
          const rect = await page.evaluate((match, pad) => {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const cand = iframes
              .map(iframe => {
                const src = iframe.getAttribute('src') || '';
                if (!src.includes(match)) return null;
                const r = iframe.getBoundingClientRect();
                const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0;
                if (!visible) return null;
                return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
              })
              .filter(Boolean)
              .sort((a, b) => (b.width * b.height) - (a.width * a.height));
            if (!cand.length) return null;
            const r = cand[0];
            return {
              x: Math.max(0, Math.floor(r.x - pad)),
              y: Math.max(0, Math.floor(r.y - pad)),
              width: Math.ceil(r.width + pad * 2),
              height: Math.ceil(r.height + pad * 2),
            };
          }, PLAYER_FRAME_URL_MATCH, CLIP_PADDING);
          if (rect) {
            await page.screenshot({ ...shotOptions, clip: rect });
            autoClipped = true;
          }
        } catch (e) {
          console.warn(`[capture] AUTO_CLIP_IFRAME_BY_URL failed: ${e && e.message ? e.message : e}`);
        }
      }

      if (!autoClipped) {
        await page.screenshot(shotOptions);
      }
    }
    await page.close();

    console.log(`[capture] Saved ${filePath}`);
    return filePath;
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
        <a class="button" href="/capture?mode=normal">Capture now (normal)</a>
        <a class="button" href="/capture?mode=play">Capture now (play first)</a>
        <a class="button" href="/capture?mode=playfs">Capture now (play + fullscreen)</a>
      </div>
    </header>
    ${latestUrl ? `<img src="${latestUrl}" alt="Latest screenshot" />` : '<p>No screenshots yet. First capture will appear soon…</p>'}
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(body);
});

// On-demand capture endpoint with optional mode
app.get('/capture', async (req, res) => {
  if (capturing) {
    return res.status(409).send('Capture already in progress');
  }
  const mode = String(req.query.mode || '').toLowerCase();
  const playThenCapture = mode === 'play' || mode === 'playfirst' || mode === 'play-first';
  const playThenFullscreen = mode === 'playfs' || mode === 'play-fullscreen' || mode === 'playfs-first';
  try {
    const file = await captureOnce({ playThenCapture, playThenFullscreen });
    if (!file) return res.status(500).send('Capture failed');
    // Redirect back to home where the latest screenshot is shown
    res.redirect(303, '/');
  } catch (e) {
    res.status(500).send('Capture error');
  }
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
