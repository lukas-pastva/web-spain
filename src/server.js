const express = require('express');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '8080', 10);
const TARGET_URL = process.env.TARGET_URL || 'https://www.algarapictures.com/webcam';
const CAPTURE_INTERVAL_MS = parseInt(process.env.CAPTURE_INTERVAL_MS || '300000', 10); // default 5 minutes
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/tmp/images';
const VIDEOS_DIR = path.join(OUTPUT_DIR, 'videos');
const TMP_DIR = path.join(OUTPUT_DIR, '.tmp');
const FULL_VIDEO_NAME = process.env.FULL_VIDEO_NAME || 'full.mp4';
const FULL_VIDEO_PATH = path.join(VIDEOS_DIR, FULL_VIDEO_NAME);
const IMAGE_FORMAT = (process.env.IMAGE_FORMAT || 'jpeg').toLowerCase(); // 'jpeg' or 'png'
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || '80', 10); // 0-100

const FULLSCREEN_DELAY_MS = parseInt(process.env.FULLSCREEN_DELAY_MS || '400', 10);
// Handle consent/cookie banners automatically so capture isn't blocked
const AUTO_CONSENT = /^(1|true|yes|on)$/i.test(process.env.AUTO_CONSENT || 'true');
const CONSENT_TIMEOUT_MS = parseInt(process.env.CONSENT_TIMEOUT_MS || '8000', 10);
const POST_NAV_WAIT_MS = parseInt(process.env.POST_NAV_WAIT_MS || '1500', 10); // small delay to allow paint
// Some streaming pages never reach network idle; allow configuring the goto waitUntil.
const NAV_WAIT_UNTIL = (process.env.NAV_WAIT_UNTIL || 'domcontentloaded'); // 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
// Jitter settings so captures don't look like a strict cron
const JITTER_MS = parseInt(process.env.JITTER_MS || '30000', 10); // ±30s by default

// Viewport tuning (resolution and sharpness)
const VIEWPORT_WIDTH = parseInt(process.env.VIEWPORT_WIDTH || '1920', 10);
const VIEWPORT_HEIGHT = parseInt(process.env.VIEWPORT_HEIGHT || '1080', 10);
const DEVICE_SCALE_FACTOR = parseFloat(process.env.DEVICE_SCALE_FACTOR || '1');

// Always attempt Play + Fullscreen inside the iframe; no env toggles.
const PLAYER_FRAME_URL_MATCH = process.env.PLAYER_FRAME_URL_MATCH || 'ipcamlive.com';
// Comma-separated list to override default fullscreen control selectors inside the frame
const PLAYER_FULLSCREEN_SELECTORS = (process.env.PLAYER_FULLSCREEN_SELECTORS || '').split(',').map(s => s.trim()).filter(Boolean);
// Comma-separated list to override default play control selectors inside the frame
const PLAYER_PLAY_SELECTORS = (process.env.PLAYER_PLAY_SELECTORS || '').split(',').map(s => s.trim()).filter(Boolean);
// How long to wait after clicking play before capturing (ms)
const PLAY_WAIT_MS = parseInt(process.env.PLAY_WAIT_MS || '1200', 10);
// How long to wait for a <video> element to start playing (polling timeout, ms)
const WAIT_FOR_PLAYING_TIMEOUT_MS = parseInt(process.env.WAIT_FOR_PLAYING_TIMEOUT_MS || '4000', 10);
// Auto-clip removed; capture is fullscreen-first

// Ensure output directories exist
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
try { fs.mkdirSync(VIDEOS_DIR, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) {}

// Date helpers
function ymdFromMs(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function ymdToday() { return ymdFromMs(Date.now()); }

// Discover date-named folders under OUTPUT_DIR (YYYY-MM-DD)
function getDateFolders(limit) {
  try {
    const names = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true });
    const dates = names
      .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
      .map(d => d.name)
      .sort((a,b) => b.localeCompare(a)); // newest first
    return typeof limit === 'number' ? dates.slice(0, Math.max(0, limit)) : dates;
  } catch (_) { return []; }
}

function videoPathForDate(ymd) {
  return path.join(VIDEOS_DIR, `${ymd}.mp4`);
}
function videoExistsForDate(ymd) {
  try { return fs.existsSync(videoPathForDate(ymd)); } catch (_) { return false; }
}

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch (_) {} }

// Create a numbered sequence of symlinks for ffmpeg under a temp dir
function prepareSequence(tmpBase, files, extHint) {
  ensureDir(tmpBase);
  // Clean tmpBase
  for (const n of fs.readdirSync(tmpBase)) {
    try { fs.rmSync(path.join(tmpBase, n), { force: true, recursive: true }); } catch (_) {}
  }
  // Decide extension group to use (prefer majority ext to avoid mixing)
  const counts = files.reduce((acc, f) => { const e = (f.name.split('.').pop() || '').toLowerCase(); acc[e] = (acc[e]||0)+1; return acc; }, {});
  const chosenExt = extHint || Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'jpg';
  let idx = 1;
  const used = [];
  for (const f of files) {
    const e = (f.name.split('.').pop() || '').toLowerCase();
    if (e !== chosenExt) continue; // skip differing ext to keep ffmpeg input simple
    const num = String(idx).padStart(6, '0');
    const linkPath = path.join(tmpBase, `${num}.${chosenExt}`);
    try {
      try { fs.symlinkSync(f.full, linkPath); }
      catch (_) { fs.copyFileSync(f.full, linkPath); }
      used.push(linkPath);
      idx++;
    } catch (_) { /* ignore */ }
  }
  return { chosenExt, used };
}

function ffmpegAvailable() {
  return new Promise((resolve) => {
    try {
      const p = spawn('ffmpeg', ['-version']);
      let resolved = false;
      p.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
      p.on('exit', (code) => { if (!resolved) { resolved = true; resolve(code === 0 || code === 1); } });
    } catch (_) { resolve(false); }
  });
}

async function generateVideoForDate(ymd, files) {
  if (!files || files.length === 0) return false;
  const hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) {
    console.warn(`[video] ffmpeg not available; skipping generation for ${ymd}`);
    return false;
  }
  const tmpBase = path.join(TMP_DIR, `seq-${ymd}`);
  const { chosenExt, used } = prepareSequence(tmpBase, files);
  if (used.length === 0) {
    console.warn(`[video] No images prepared for ${ymd}`);
    return false;
  }
  ensureDir(VIDEOS_DIR);
  const out = videoPathForDate(ymd);
  const args = ['-y', '-framerate', '30', '-i', path.join(tmpBase, `%06d.${chosenExt}`), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', out];
  console.log(`[video] ffmpeg ${args.join(' ')}`);
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  }).catch((e) => { console.warn(`[video] Generation failed for ${ymd}: ${e && e.message ? e.message : e}`); });
  // Clean temp sequence
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
  const ok = fs.existsSync(out);
  if (ok) console.log(`[video] Created ${out}`);
  return ok;
}

async function processUnarchivedDays() {
  const today = ymdToday();
  // For each date-named folder (except today), ensure a video exists.
  const dates = getDateFolders();
  for (const ymd of dates) {
    if (ymd >= today) continue; // only process days strictly before today
    if (!videoExistsForDate(ymd)) {
      const files = listImagesForDate(ymd);
      try { await generateVideoForDate(ymd, files); } catch (_) { /* ignore */ }
    }
  }
}

// Lazy-load puppeteer on first use to speed cold start of the web server
let puppeteer; // assigned on first capture
let browser;    // reused across captures
let capturing = false;
let scheduleTimer = null;
let mergeTimer = null;
let nextCaptureDueAtMs = 0;

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
      '--no-zygote'
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
    console.log('[capture] Starting');
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

    // Always attempt to start playback and enter fullscreen inside the player iframe
    try { await tryClickPlayerPlayThenFullscreen(page); } catch (_) { /* ignore */ }
    // Ensure fullscreen attempt was made even if play wasn’t required
    try { await tryClickPlayerFullscreen(page, { force: true }); } catch (_) { /* ignore */ }

    const ts = nowIsoNoColons();
    const fileBase = `webcam-${ts}`;
    const todayDir = path.join(OUTPUT_DIR, ymdToday());
    ensureDir(todayDir);
    const filePath = path.join(todayDir, `${fileBase}.${IMAGE_FORMAT === 'png' ? 'png' : 'jpg'}`);

    const shotOptions = IMAGE_FORMAT === 'png'
      ? { path: filePath, type: 'png' }
      : { path: filePath, type: 'jpeg', quality: Math.max(0, Math.min(100, JPEG_QUALITY)) };

    // Always capture the current viewport (fullscreen if the player handled it)
    await page.screenshot(shotOptions);
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
  nextCaptureDueAtMs = Date.now() + delay;
  console.log(`[schedule] Next capture in ${Math.round(delay / 1000)}s (base=${Math.round(CAPTURE_INTERVAL_MS/1000)}s ±${Math.round(JITTER_MS/1000)}s)`);
  scheduleTimer = setTimeout(runCaptureThenSchedule, delay);
}

async function runCaptureThenSchedule() {
  console.log('[schedule] Timer fired');
  try {
    await captureOnce();
    // After each capture, attempt to process previous days into videos and archive
    await processUnarchivedDays().catch(() => {});
  } catch (_) {
    // captureOnce already logs errors
  } finally {
    scheduleNext();
  }
}

// Daily full-time merge at ~1am local time
function msUntilNext1am() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(1, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(5_000, next - now);
}

async function runMergeThenSchedule() {
  try {
    await mergeDailyVideosIntoFull().catch(() => {});
  } finally {
    const delay = 24 * 60 * 60 * 1000; // 24h
    if (mergeTimer) clearTimeout(mergeTimer);
    console.log('[merge] Next full merge scheduled in ~24h');
    mergeTimer = setTimeout(runMergeThenSchedule, delay);
  }
}

function scheduleFullMergeAt1am() {
  const delay = msUntilNext1am();
  if (mergeTimer) clearTimeout(mergeTimer);
  console.log(`[merge] Scheduling full merge in ${Math.round(delay/1000)}s (at ~1am)`);
  mergeTimer = setTimeout(runMergeThenSchedule, delay);
}

function getLatestImagePath() {
  try {
    const dir = path.join(OUTPUT_DIR, ymdToday());
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
      .map(name => ({ name, full: path.join(dir, name), stat: fs.statSync(path.join(dir, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return files.length ? path.join(ymdToday(), files[0].name) : null;
  } catch (e) {
    return null;
  }
}

function getVideosSorted(limit) {
  try {
    const files = fs.readdirSync(VIDEOS_DIR)
      .filter(f => f.toLowerCase().endsWith('.mp4'))
      .map(name => ({ name, full: path.join(VIDEOS_DIR, name), stat: fs.statSync(path.join(VIDEOS_DIR, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return typeof limit === 'number' ? files.slice(0, Math.max(0, limit)) : files;
  } catch (e) {
    return [];
  }
}

// Only YYYY-MM-DD.mp4 daily videos
function getDailyVideosSorted() {
  try {
    const re = /^\d{4}-\d{2}-\d{2}\.mp4$/i;
    return fs.readdirSync(VIDEOS_DIR)
      .filter(name => re.test(name))
      .map(name => ({ name, full: path.join(VIDEOS_DIR, name), stat: fs.statSync(path.join(VIDEOS_DIR, name)) }))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first
  } catch (_) { return []; }
}

async function mergeDailyVideosIntoFull() {
  const hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) { console.warn('[merge] ffmpeg not available; skipping full merge'); return false; }
  const vids = getDailyVideosSorted();
  if (vids.length === 0) { console.log('[merge] No daily videos to merge'); return false; }
  ensureDir(VIDEOS_DIR);
  ensureDir(TMP_DIR);
  const listPath = path.join(TMP_DIR, 'concat-full.txt');
  try { fs.unlinkSync(listPath); } catch (_) {}
  const lines = vids.map(v => `file '${v.full.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, lines, 'utf8');
  const out = FULL_VIDEO_PATH;
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-an', out];
  console.log(`[merge] ffmpeg ${args.join(' ')}`);
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  }).catch((e) => console.warn(`[merge] Failed to create full video: ${e && e.message ? e.message : e}`));
  try { fs.unlinkSync(listPath); } catch (_) {}
  const ok = fs.existsSync(out);
  if (ok) console.log(`[merge] Full-time video updated at ${out}`);
  return ok;
}

// List stored images (newest first). Optional limit
function getImagesSorted(limit) {
  try {
    const dir = path.join(OUTPUT_DIR, ymdToday());
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
      .map(name => ({ name, full: path.join(dir, name), stat: fs.statSync(path.join(dir, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return typeof limit === 'number' ? files.slice(0, Math.max(0, limit)) : files;
  } catch (e) {
    return [];
  }
}

// Date folders under OUTPUT_DIR (YYYY-MM-DD)
function getProcessedDateFolders(limit) { // kept name for compatibility in UI
  return getDateFolders(limit);
}

function listImagesForDate(ymd) {
  try {
    const baseDir = path.join(OUTPUT_DIR, ymd);
    const files = fs.readdirSync(baseDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
      .map(name => ({ name, full: path.join(baseDir, name), stat: fs.statSync(path.join(baseDir, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return files;
  } catch (e) { return []; }
}

function getCoverForDate(ymd) {
  const imgs = listImagesForDate(ymd);
  if (!imgs.length) return null;
  const f = imgs[0];
  const rel = `/${ymd}`;
  return { url: `/images${rel}/${encodeURIComponent(f.name)}?v=${Math.floor(f.stat.mtimeMs)}`, count: imgs.length };
}

// Kick off an immediate first capture shortly after start, then schedule with jitter
setTimeout(() => runCaptureThenSchedule(), 5000);
// Schedule daily full-time video merge at ~1am local time
scheduleFullMergeAt1am();

// Watchdog: if a scheduled capture fails to fire (e.g., timer lost), recover.
setInterval(() => {
  try {
    const now = Date.now();
    const overdueByMs = nextCaptureDueAtMs ? (now - nextCaptureDueAtMs) : -1;
    const isOverdue = nextCaptureDueAtMs > 0 && overdueByMs > 2000; // 2s grace
    const noTimer = !scheduleTimer;
    if (!capturing && (noTimer || isOverdue)) {
      if (scheduleTimer) { try { clearTimeout(scheduleTimer); } catch (_) {} }
      scheduleTimer = null;
      console.warn('[schedule] Watchdog: missed or lost timer; triggering capture now');
      // Trigger immediately; runCaptureThenSchedule() will reschedule on completion.
      runCaptureThenSchedule().catch(() => {});
    }
  } catch (_) { /* ignore */ }
}, 10_000);

// Web server
const app = express();
app.disable('x-powered-by');
app.use(morgan('tiny'));

// Health checks
app.get('/healthz', (req, res) => res.status(200).send('OK'));
app.get('/readyz', (req, res) => res.status(200).send('READY'));

// Static serving of captured images
app.use('/images', express.static(OUTPUT_DIR, { maxAge: '60s', index: false }));

// API: Reprocess/regenerate daily video for a specific date
app.post('/api/reprocess/:ymd', async (req, res) => {
  try {
    const ymd = String(req.params.ymd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return res.status(400).json({ success: false, error: 'Bad date' });
    }
    const imgs = listImagesForDate(ymd);
    if (!imgs.length) {
      return res.status(404).json({ success: false, error: 'No images for date' });
    }
    const ok = await generateVideoForDate(ymd, imgs);
    return res.status(200).json({ success: !!ok });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// Simple index page that shows the latest screenshot
app.get('/', (req, res) => {
  const latest = getLatestImagePath();
  const latestUrl = latest ? `/images/${latest}` : null;
  const all = getImagesSorted(100);
  const vids = getDailyVideosSorted().slice(0, 30);
  const fullExists = (() => { try { return fs.existsSync(FULL_VIDEO_PATH); } catch (_) { return false; } })();
  const fullStat = (() => { try { return fullExists ? fs.statSync(FULL_VIDEO_PATH) : null; } catch (_) { return null; } })();
  const fullUrl = fullExists ? `/images/videos/${encodeURIComponent(FULL_VIDEO_NAME)}?v=${fullStat ? Math.floor(fullStat.mtimeMs) : Date.now()}` : null;
  // Build simple date list (no images) for Stored tab
  const todayDate = ymdToday();
  const allDates = getProcessedDateFolders();
  const datesHtml = allDates
    .map((d) => {
      // Skip today if it has no images yet (keep previous behavior)
      if (d === todayDate) {
        const cover = getCoverForDate(d);
        if (!cover) return '';
      }
      const count = listImagesForDate(d).length;
      return `<li><a class="date-item" href="/day/${d}" aria-label="Open ${d}"><span class="name">${d}</span><span class="count">${count}</span></a></li>`;
    })
    .filter(Boolean)
    .join('');
  const videosHtml = vids.map(v => {
    const url = `/images/videos/${encodeURIComponent(v.name)}?v=${Math.floor(v.stat.mtimeMs)}`;
    const caption = v.name.replace(/\.mp4$/i, '');
    return `<a href="${url}" target="_blank" rel="noopener"><div class="video-card"><video src="${url}" preload="metadata" controls playsinline></video><div class="caption">${caption}</div></div></a>`;
  }).join('');
  // Total number of stored images across all date folders
  const storedCount = getProcessedDateFolders().reduce((acc, d) => acc + listImagesForDate(d).length, 0);
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Webcam Snapshot Service</title>
    <meta http-equiv="refresh" content="${Math.max(30, Math.floor(CAPTURE_INTERVAL_MS / 1000 / 2))}" />
    <style>
      :root {
        --bg: #ffffff;
        --fg: #111111;
        --muted: #666666;
        --border: #dddddd;
        --button-bg: #ffffff;
        --button-fg: #333333;
        --button-border: #cccccc;
        --code-bg: #f6f8fa;
      }
      [data-theme="dark"] {
        --bg: #0f1115;
        --fg: #e6e6e6;
        --muted: #a0a0a0;
        --border: #2a2f3a;
        --button-bg: #171a21;
        --button-fg: #e6e6e6;
        --button-border: #2a2f3a;
        --code-bg: #111827;
      }
      html, body { background: var(--bg); color: var(--fg); }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; }
      header { margin-bottom: 16px; }
      header .header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 4px; }
      .meta { color: var(--muted); font-size: 0.9em; margin: 8px 0; }
      .grid { display: grid; gap: 16px; }
      .rows { display: grid; gap: 24px; }
      .row h2 { margin: 0 0 8px; font-size: 1.15em; color: var(--fg); }
      .folders { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
      .folder { display: block; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; text-decoration: none; background: var(--button-bg); color: var(--fg); }
      .folder img { width: 100%; height: 140px; object-fit: cover; display: block; background: #000; }
      .folder .empty { width: 100%; height: 140px; display: grid; place-items: center; color: var(--muted); background: var(--code-bg); }
      .folder-caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.95em; padding: 8px 10px; }
      .folder-caption .name { font-weight: 600; }
      .folder-caption .count { color: var(--muted); font-variant-numeric: tabular-nums; }
      /* Stored dates list (no thumbnails) */
      .date-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
      .date-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; text-decoration: none; background: var(--button-bg); color: var(--fg); }
      .date-item .name { font-weight: 600; }
      .date-item .count { color: var(--muted); font-variant-numeric: tabular-nums; }
      .videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
      .videos a { display: block; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; text-decoration: none; background: var(--button-bg); color: var(--fg); }
      .videos video { width: 100%; height: 150px; background: #000; display: block; object-fit: cover; }
      .videos .caption { font-size: 0.85em; padding: 6px 8px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      a.button { display: inline-block; padding: 6px 10px; border: 1px solid var(--button-border); border-radius: 4px; text-decoration: none; color: var(--button-fg); background: var(--button-bg); }
      a.button:hover { filter: brightness(0.98); }
      code { background: var(--code-bg); color: var(--fg); padding: 2px 4px; border-radius: 4px; }
      /* Icon-only theme button */
      .icon-btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); border-radius: 999px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; line-height: 1; }
      .icon-btn:hover { filter: brightness(0.98); }
      .icon-btn:focus { outline: 2px solid #5b9cff; outline-offset: 2px; }
      /* Tabs */
      .tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border); margin-top: 12px; }
      .tab { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px; cursor: pointer; }
      .tab[aria-selected="true"] { background: var(--bg); color: var(--fg); border-color: var(--button-border); border-bottom-color: var(--bg); }
      .tab:focus { outline: 2px solid #5b9cff; outline-offset: 2px; }
      .tabpanels { border: 1px solid var(--button-border); border-top: none; padding: 12px; border-radius: 0 6px 6px 6px; }
      .full video { width: 100%; height: auto; display: block; background: #000; }
    </style>
    <script>
      (function() {
        var KEY = 'theme-preference';
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        function getStored() {
          try { return localStorage.getItem(KEY) || 'auto'; } catch (_) { return 'auto'; }
        }
        function applyTheme(mode) {
          var effective = mode === 'auto' ? (mql.matches ? 'dark' : 'light') : mode;
          document.documentElement.setAttribute('data-theme', effective);
        }
        var mode = getStored();
        applyTheme(mode);
        function iconFor(m) { return m === 'light' ? '☀️' : (m === 'dark' ? '🌙' : '🖥️'); }
        function titleFor(m) { return 'Theme: ' + (m.charAt(0).toUpperCase() + m.slice(1)); }
        function updateUi() {
          var btn = document.getElementById('theme-btn');
          var ico = document.getElementById('theme-icon');
          if (btn) btn.setAttribute('title', titleFor(mode));
          if (ico) ico.textContent = iconFor(mode);
        }
        window.__cycleTheme = function() {
          mode = mode === 'auto' ? 'light' : (mode === 'light' ? 'dark' : 'auto');
          try { localStorage.setItem(KEY, mode); } catch (_) {}
          applyTheme(mode);
          updateUi();
        };
        if (mql && mql.addEventListener) {
          mql.addEventListener('change', function() { if (mode === 'auto') applyTheme(mode); });
        } else if (mql && mql.addListener) {
          mql.addListener(function() { if (mode === 'auto') applyTheme(mode); });
        }
        window.addEventListener('DOMContentLoaded', updateUi);
      })();
    </script>
    <script>
      (function() {
        var KEY = 'home-active-tab';
        var order = ['tab-live','tab-stored','tab-videos','tab-full'];
        function select(tabId) {
          order.forEach(function(id) {
            var btn = document.getElementById(id);
            var panel = document.getElementById('panel-' + id.split('-')[1]);
            var active = id === tabId;
            if (btn) btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (panel) {
              panel.hidden = !active;
              panel.setAttribute('aria-hidden', active ? 'false' : 'true');
            }
          });
          try { localStorage.setItem(KEY, tabId); } catch (_) {}
        }
        function init() {
          var saved = 'tab-live';
          try { saved = localStorage.getItem(KEY) || 'tab-live'; } catch (_) {}
          if (!document.getElementById(saved)) saved = 'tab-live';
          order.forEach(function(id, idx) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', function() { select(id); });
            el.addEventListener('keydown', function(e) {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                var next = order[(idx + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length];
                var ne = document.getElementById(next);
                if (ne) { ne.focus(); select(next); }
              }
            });
          });
          select(saved);
        }
        window.addEventListener('DOMContentLoaded', init);
      })();
    </script>
  </head>
  <body>
    <header>
      <div class="header-row">
        <h1>Webcam Snapshot Service</h1>
        <button id="theme-btn" class="icon-btn" onclick="__cycleTheme()" aria-label="Toggle theme" title="Theme: Auto"><span id="theme-icon" aria-hidden="true">🖥️</span></button>
      </div>
      <div class="meta">Target: <code>${TARGET_URL}</code></div>
    </header>
    <div class="tabs" role="tablist" aria-label="Views">
      <button id="tab-live" role="tab" aria-controls="panel-live" aria-selected="true" class="tab">Live</button>
      <button id="tab-stored" role="tab" aria-controls="panel-stored" aria-selected="false" class="tab">Stored (${storedCount})</button>
      <button id="tab-videos" role="tab" aria-controls="panel-videos" aria-selected="false" class="tab">Videos</button>
      <button id="tab-full" role="tab" aria-controls="panel-full" aria-selected="false" class="tab">Full-time</button>
    </div>
    <div class="tabpanels">
      <section id="panel-live" class="tabpanel" role="tabpanel" aria-labelledby="tab-live" aria-hidden="false">
        ${latestUrl ? `<img src="${latestUrl}" alt="Latest screenshot" />` : '<p>No screenshots yet. First capture will appear soon…</p>'}
      </section>
      <section id="panel-stored" class="tabpanel" role="tabpanel" aria-labelledby="tab-stored" hidden aria-hidden="true">
        ${datesHtml ? `<ul class="date-list">${datesHtml}</ul>` : '<p>No stored snapshots yet.</p>'}
      </section>
      <section id="panel-videos" class="tabpanel" role="tabpanel" aria-labelledby="tab-videos" hidden aria-hidden="true">
        ${vids.length ? `<div class="videos">${videosHtml}</div>` : '<p>No videos yet. They are generated daily.</p>'}
      </section>
      <section id="panel-full" class="tabpanel" role="tabpanel" aria-labelledby="tab-full" hidden aria-hidden="true">
        ${fullUrl ? `<div class="full"><video src="${fullUrl}" controls preload="metadata" playsinline></video></div>` : '<p>No full-time video yet. It updates daily around 1:00.</p>'}
      </section>
    </div>
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(body);
});

// Day view: thumbnails for a specific YYYY-MM-DD
app.get('/day/:ymd', (req, res) => {
  const ymd = String(req.params.ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return res.status(400).send('Bad date');
  const imgs = listImagesForDate(ymd);
  const latest = getLatestImagePath();
  const latestUrl = latest ? `/images/${latest}` : null;
  const vids = getDailyVideosSorted().slice(0, 30);
  const fullExists = (() => { try { return fs.existsSync(FULL_VIDEO_PATH); } catch (_) { return false; } })();
  const fullStat = (() => { try { return fullExists ? fs.statSync(FULL_VIDEO_PATH) : null; } catch (_) { return null; } })();
  const fullUrl = fullExists ? `/images/videos/${encodeURIComponent(FULL_VIDEO_NAME)}?v=${fullStat ? Math.floor(fullStat.mtimeMs) : Date.now()}` : null;
  const grid = imgs.map(f => {
    const url = `/images/${ymd}/${encodeURIComponent(f.name)}?v=${Math.floor(f.stat.mtimeMs)}`;
    const caption = new Date(f.stat.mtimeMs).toLocaleString();
    return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${f.name}" loading="lazy" /><div class="caption">${caption}</div></a>`;
  }).join('');
  const videosHtml = vids.map(v => {
    const url = `/images/videos/${encodeURIComponent(v.name)}?v=${Math.floor(v.stat.mtimeMs)}`;
    const caption = v.name.replace(/\.mp4$/i, '');
    return `<a href="${url}" target="_blank" rel="noopener"><div class="video-card"><video src="${url}" preload="metadata" controls playsinline></video><div class="caption">${caption}</div></div></a>`;
  }).join('');
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Snapshots for ${ymd}</title>
    <style>
      :root { --bg:#fff; --fg:#111; --muted:#666; --border:#ddd; --button-bg:#fff; --button-fg:#333; --button-border:#ccc; --code-bg:#f6f8fa; }
      [data-theme="dark"] { --bg:#0f1115; --fg:#e6e6e6; --muted:#a0a0a0; --border:#2a2f3a; --button-bg:#171a21; --button-fg:#e6e6e6; --button-border:#2a2f3a; --code-bg:#111827; }
      html, body { background: var(--bg); color: var(--fg); }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; }
      header { margin-bottom: 16px; }
      header .header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 4px; }
      .meta { color: var(--muted); font-size: 0.9em; margin: 8px 0; }
      a.button { display: inline-block; padding: 6px 10px; border: 1px solid var(--button-border); border-radius: 4px; text-decoration: none; color: var(--button-fg); background: var(--button-bg); }
      code { background: var(--code-bg); color: var(--fg); padding: 2px 4px; border-radius: 4px; }
      /* Icon-only theme button */
      .icon-btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); border-radius: 999px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; line-height: 1; }
      .icon-btn:focus { outline: 2px solid #5b9cff; outline-offset: 2px; }
      /* Tabs */
      .tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border); margin-top: 12px; }
      .tab { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px; cursor: pointer; }
      .tab[aria-selected="true"] { background: var(--bg); color: var(--fg); border-color: var(--button-border); border-bottom-color: var(--bg); }
      .tab:focus { outline: 2px solid #5b9cff; outline-offset: 2px; }
      .tabpanels { border: 1px solid var(--button-border); border-top: none; padding: 12px; border-radius: 0 6px 6px 6px; }
      /* Grids */
      .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
      .thumbs a { display: block; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; text-decoration: none; background: var(--button-bg); color: var(--fg); }
      .thumbs img { width: 100%; height: 120px; object-fit: cover; display: block; background: #000; }
      .thumbs .caption { font-size: 0.85em; padding: 6px 8px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
      .videos a { display: block; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; text-decoration: none; background: var(--button-bg); color: var(--fg); }
      .videos video { width: 100%; height: 150px; background: #000; display: block; object-fit: cover; }
      .videos .caption { font-size: 0.85em; padding: 6px 8px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .full video { width: 100%; height: auto; display: block; background: #000; }
      .hint { color: var(--muted); font-size: 0.9em; margin: 0 0 8px; }
      .actions { margin: 8px 0 16px; display: flex; gap: 8px; align-items: center; }
      .btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-radius: 4px; cursor: pointer; }
      .btn[disabled] { opacity: 0.6; cursor: progress; }
    </style>
    <script>
      (function() {
        var KEY = 'theme-preference';
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        function getStored() { try { return localStorage.getItem(KEY) || 'auto'; } catch (_) { return 'auto'; } }
        function applyTheme(mode) { var effective = mode === 'auto' ? (mql.matches ? 'dark' : 'light') : mode; document.documentElement.setAttribute('data-theme', effective); }
        var mode = getStored();
        applyTheme(mode);
        function iconFor(m) { return m === 'light' ? '☀️' : (m === 'dark' ? '🌙' : '🖥️'); }
        function titleFor(m) { return 'Theme: ' + (m.charAt(0).toUpperCase() + m.slice(1)); }
        function updateUi() { var btn = document.getElementById('theme-btn'); var ico = document.getElementById('theme-icon'); if (btn) btn.setAttribute('title', titleFor(mode)); if (ico) ico.textContent = iconFor(mode); }
        window.__cycleTheme = function() { mode = mode === 'auto' ? 'light' : (mode === 'light' ? 'dark' : 'auto'); try { localStorage.setItem(KEY, mode); } catch (_) {} applyTheme(mode); updateUi(); };
        if (mql && mql.addEventListener) { mql.addEventListener('change', function() { if (mode === 'auto') applyTheme(mode); }); }
        else if (mql && mql.addListener) { mql.addListener(function() { if (mode === 'auto') applyTheme(mode); }); }
        window.addEventListener('DOMContentLoaded', updateUi);
      })();
    </script>
    <script>
      function reprocessDay(ymd) {
        var btn = document.getElementById('reprocess-btn');
        var status = document.getElementById('reprocess-status');
        if (btn) btn.disabled = true;
        if (status) status.textContent = 'Reprocessing…';
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            if (status) status.textContent = data && data.success ? 'Done.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (btn) btn.disabled = false;
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; if (btn) btn.disabled = false; });
      }
    </script>
    <script>
      (function() {
        var KEY = 'home-active-tab';
        var order = ['tab-live','tab-stored','tab-videos','tab-full'];
        function select(tabId) {
          order.forEach(function(id) {
            var btn = document.getElementById(id);
            var panel = document.getElementById('panel-' + id.split('-')[1]);
            var active = id === tabId;
            if (btn) btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (panel) { panel.hidden = !active; panel.setAttribute('aria-hidden', active ? 'false' : 'true'); }
          });
          try { localStorage.setItem(KEY, tabId); } catch (_) {}
        }
        function init() {
          var saved = 'tab-stored';
          try { saved = localStorage.getItem(KEY) || 'tab-stored'; } catch (_) {}
          if (!document.getElementById(saved)) saved = 'tab-stored';
          order.forEach(function(id, idx) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', function() { select(id); });
            el.addEventListener('keydown', function(e) {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                var next = order[(idx + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length];
                var ne = document.getElementById(next);
                if (ne) { ne.focus(); select(next); }
              }
            });
          });
          select(saved);
        }
        window.addEventListener('DOMContentLoaded', init);
      })();
    </script>
  </head>
  <body>
    <header>
      <div class="header-row">
        <h1>Webcam Snapshot Service</h1>
        <button id="theme-btn" class="icon-btn" onclick="__cycleTheme()" aria-label="Toggle theme" title="Theme: Auto"><span id="theme-icon" aria-hidden="true">🖥️</span></button>
      </div>
      <div class="meta">Target: <code>${TARGET_URL}</code></div>
      <div class="meta"><a href="/" class="button" aria-label="Back to days list">&larr; Back to days</a></div>
    </header>
    <div class="tabs" role="tablist" aria-label="Views">
      <button id="tab-live" role="tab" aria-controls="panel-live" aria-selected="false" class="tab">Live</button>
      <button id="tab-stored" role="tab" aria-controls="panel-stored" aria-selected="true" class="tab">Stored (${imgs.length})</button>
      <button id="tab-videos" role="tab" aria-controls="panel-videos" aria-selected="false" class="tab">Videos</button>
      <button id="tab-full" role="tab" aria-controls="panel-full" aria-selected="false" class="tab">Full-time</button>
    </div>
    <div class="tabpanels">
      <section id="panel-live" class="tabpanel" role="tabpanel" aria-labelledby="tab-live" hidden aria-hidden="true">
        ${latestUrl ? `<img src="${latestUrl}" alt="Latest screenshot" />` : '<p>No screenshots yet. First capture will appear soon…</p>'}
      </section>
      <section id="panel-stored" class="tabpanel" role="tabpanel" aria-labelledby="tab-stored" aria-hidden="false">
        <div class="hint">Snapshots for <strong>${ymd}</strong></div>
        ${imgs.length ? `<div class="thumbs">${grid}</div>` : '<p>No images for this date.</p>'}
      </section>
      <section id="panel-videos" class="tabpanel" role="tabpanel" aria-labelledby="tab-videos" hidden aria-hidden="true">
        <div class="actions"><button id="reprocess-btn" class="btn" onclick="reprocessDay('${ymd}')">Reprocess ${ymd} video</button><span id="reprocess-status" class="meta"></span></div>
        ${vids.length ? `<div class="videos">${videosHtml}</div>` : '<p>No videos yet. They are generated daily.</p>'}
      </section>
      <section id="panel-full" class="tabpanel" role="tabpanel" aria-labelledby="tab-full" hidden aria-hidden="true">
        ${fullUrl ? `<div class="full"><video src="${fullUrl}" controls preload="metadata" playsinline></video></div>` : '<p>No full-time video yet. It updates daily around 1:00.</p>'}
      </section>
    </div>
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(body);
});

// Manual capture endpoint removed; only scheduled captures are supported.

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
