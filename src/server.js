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
const FULL_DAYLIGHT_NAME = process.env.FULL_DAYLIGHT_NAME || 'full-daylight.mp4';
const FULL_DAYLIGHT_PATH = path.join(VIDEOS_DIR, FULL_DAYLIGHT_NAME);
const IMAGE_FORMAT = (process.env.IMAGE_FORMAT || 'jpeg').toLowerCase(); // 'jpeg' or 'png'
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || '80', 10); // 0-100
// Daylight-only window config (local clock for target location)
const DAYLIGHT_TZ = process.env.DAYLIGHT_TZ || 'Europe/Madrid';
const DAYLIGHT_START_LOCAL = process.env.DAYLIGHT_START_LOCAL || '06:00';
const DAYLIGHT_END_LOCAL = process.env.DAYLIGHT_END_LOCAL || '21:30';
// Weather/astronomy settings
const WX_REFRESH_MS = parseInt(process.env.WX_REFRESH_MS || '600000', 10); // 10 minutes
// Alicante, Spain
const ALICANTE = { name: 'Alicante, ES', lat: 38.345, lon: -0.481, tz: 'Europe/Madrid' };
// Bratislava, Slovakia
const BRATISLAVA = { name: 'Bratislava, SK', lat: 48.1486, lon: 17.1077, tz: 'Europe/Bratislava' };

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

// Daylight-only video naming helpers
function daylightVideoPathForDate(ymd) {
  return path.join(VIDEOS_DIR, `${ymd}-daylight.mp4`);
}
function daylightVideoExistsForDate(ymd) {
  try { return fs.existsSync(daylightVideoPathForDate(ymd)); } catch (_) { return false; }
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

// Internal primitive to generate a video from a prepared ordered file list to a specific output path
async function generateVideoFromFiles(ymd, files, outPath) {
  if (!files || files.length === 0) return false;
  const hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) {
    console.warn(`[video] ffmpeg not available; skipping generation for ${ymd}`);
    return false;
  }
  // Ensure frames are in chronological order (oldest -> newest) for video playback
  const chronological = files.slice().sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  const tmpBase = path.join(TMP_DIR, `seq-${ymd}`);
  const { chosenExt, used } = prepareSequence(tmpBase, chronological);
  if (used.length === 0) {
    console.warn(`[video] No images prepared for ${ymd}`);
    return false;
  }
  ensureDir(VIDEOS_DIR);
  const out = outPath;
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

async function generateVideoForDate(ymd, files) {
  return generateVideoFromFiles(ymd, files, videoPathForDate(ymd));
}

// Daylight window helpers
function parseHm(str) {
  try {
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const mi = Math.max(0, Math.min(59, parseInt(m[2], 10)));
    return { h, m: mi };
  } catch (_) { return null; }
}
const __daylightDtf = new Intl.DateTimeFormat('en-GB', { timeZone: DAYLIGHT_TZ, hour12: false, hour: '2-digit', minute: '2-digit' });
const __daylightDateDtf = new Intl.DateTimeFormat('en-CA', { timeZone: DAYLIGHT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
function hmToMinutes(h, m) { return h * 60 + m; }
function minutesOfLocalTz(ms) {
  try {
    const parts = __daylightDtf.formatToParts(new Date(ms));
    const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const mi = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return hmToMinutes(h, mi);
  } catch (_) { return -1; }
}
function ymdOfLocalTz(ms) {
  try {
    const s = __daylightDateDtf.format(new Date(ms)); // YYYY-MM-DD in en-CA
    return s;
  } catch (_) { return null; }
}
function filterFilesToDaylight(ymd, files) {
  const start = parseHm(DAYLIGHT_START_LOCAL) || { h: 6, m: 0 };
  const end = parseHm(DAYLIGHT_END_LOCAL) || { h: 21, m: 30 };
  const minStart = hmToMinutes(start.h, start.m);
  const minEnd = hmToMinutes(end.h, end.m);
  return files.filter(f => {
    const ms = f.stat.mtimeMs;
    // Use local time-of-day window only; do not hard-enforce date match to tolerate host TZ vs DAYLIGHT_TZ differences
    const mins = minutesOfLocalTz(ms);
    if (mins < 0) return false;
    return mins >= minStart && mins <= minEnd;
  });
}

// Compute Alicante sunrise/sunset minutes-of-day for a specific date (YYYY-MM-DD)
async function sunriseSunsetMinutesForDate(ymd) {
  // Fallback to static window if anything fails
  const fallback = () => {
    const s = parseHm(DAYLIGHT_START_LOCAL) || { h: 6, m: 0 };
    const e = parseHm(DAYLIGHT_END_LOCAL) || { h: 21, m: 30 };
    return { startMin: hmToMinutes(s.h, s.m), endMin: hmToMinutes(e.h, e.m), source: 'fallback' };
  };
  try {
    const base = 'https://api.open-meteo.com/v1/forecast';
    const params = new URLSearchParams({
      latitude: String(ALICANTE.lat),
      longitude: String(ALICANTE.lon),
      timezone: String(ALICANTE.tz || DAYLIGHT_TZ),
      daily: 'sunrise,sunset',
      start_date: ymd,
      end_date: ymd,
    });
    const url = `${base}?${params.toString()}`;
    const json = await httpGetJson(url);
    const sr = (() => { try { return json.daily.sunrise[0]; } catch (_) { return null; } })();
    const ss = (() => { try { return json.daily.sunset[0]; } catch (_) { return null; } })();
    const toMin = (s) => {
      if (typeof s !== 'string') return null;
      const t = s.includes('T') ? s.split('T')[1] : s; // 'HH:MM' (in Europe/Madrid per timezone param)
      const parts = t.split(':');
      if (!parts || parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isFinite(h) || !isFinite(m)) return null;
      return hmToMinutes(Math.max(0, Math.min(23, h)), Math.max(0, Math.min(59, m)));
    };
    const startMin = toMin(sr);
    const endMin = toMin(ss);
    if (typeof startMin === 'number' && typeof endMin === 'number' && endMin > startMin) {
      return { startMin, endMin, source: 'open-meteo' };
    }
    return fallback();
  } catch (e) {
    console.warn('[daylight] Failed to fetch sunrise/sunset for', ymd, e && e.message ? e.message : e);
    return fallback();
  }
}

function filterFilesToWindow(files, startMin, endMin) {
  return files.filter(f => {
    const ms = f.stat.mtimeMs;
    const mins = minutesOfLocalTz(ms);
    if (mins < 0) return false;
    return mins >= startMin && mins <= endMin;
  });
}
async function generateDaylightVideo(ymd) {
  const imgs = listImagesForDate(ymd);
  if (!imgs || !imgs.length) return false;
  // Prefer dynamic sunrise/sunset for Alicante; fall back to static window
  let startMin, endMin;
  try {
    const win = await sunriseSunsetMinutesForDate(ymd);
    startMin = win.startMin; endMin = win.endMin;
  } catch (_) {
    const s = parseHm(DAYLIGHT_START_LOCAL) || { h: 6, m: 0 };
    const e = parseHm(DAYLIGHT_END_LOCAL) || { h: 21, m: 30 };
    startMin = hmToMinutes(s.h, s.m);
    endMin = hmToMinutes(e.h, e.m);
  }
  const daylight = filterFilesToWindow(imgs, startMin, endMin);
  if (!daylight.length) { console.warn(`[video] No daylight images for ${ymd}`); return false; }
  return generateVideoFromFiles(ymd, daylight, daylightVideoPathForDate(ymd));
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

// --- Weather & Sun helpers (Open-Meteo) ---
const https = require('https');
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    try {
      const req = https.get(url, { timeout: 15_000 }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { try { req.destroy(); } catch (_) {} reject(new Error('timeout')); });
    } catch (e) { reject(e); }
  });
}

let wxState = {
  updatedAt: 0,
  alicante: null,
  bratislava: null,
};

function formatDayLength(sec) {
  if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function pickTodayDaily(entry) {
  // Open-Meteo daily arrays for time/sunrise/sunset/daylight_duration; take index 0 (today)
  try {
    const idx = 0;
    const time = entry.daily.time[idx];
    const sunrise = entry.daily.sunrise[idx];
    const sunset = entry.daily.sunset[idx];
    const daylight = entry.daily.daylight_duration[idx];
    return { time, sunrise, sunset, daylightSeconds: daylight };
  } catch (_) { return null; }
}

async function fetchWxFor(loc) {
  const base = 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    timezone: String(loc.tz || 'auto'),
    current: 'temperature_2m',
    daily: 'sunrise,sunset,daylight_duration',
  });
  const url = `${base}?${params.toString()}`;
  const json = await httpGetJson(url);
  const out = { name: loc.name };
  try { out.tempC = json.current?.temperature_2m; } catch (_) {}
  const today = pickTodayDaily(json) || {};
  out.sunrise = today.sunrise;
  out.sunset = today.sunset;
  out.daylightSeconds = today.daylightSeconds;
  return out;
}

async function refreshWeather() {
  try {
    const [a, b] = await Promise.allSettled([fetchWxFor(ALICANTE), fetchWxFor(BRATISLAVA)]);
    wxState.alicante = a.status === 'fulfilled' ? a.value : wxState.alicante;
    wxState.bratislava = b.status === 'fulfilled' ? b.value : wxState.bratislava;
    wxState.updatedAt = Date.now();
    if (a.status !== 'fulfilled' || b.status !== 'fulfilled') {
      console.warn('[weather] Partial refresh', a.status, b.status);
    } else {
      console.log('[weather] Refreshed');
    }
  } catch (e) {
    console.warn('[weather] Refresh failed:', e && e.message ? e.message : e);
  }
}

// Start background refresh loop
setTimeout(() => { refreshWeather().catch(()=>{}); }, 2000);
setInterval(() => { refreshWeather().catch(()=>{}); }, Math.max(60_000, WX_REFRESH_MS));

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

    // Overlay Alicante + Bratislava info (temp, sunrise, sunset, day length) on the image using ffmpeg (if available)
    try {
      const ensureRecent = async () => {
        const fresh = wxState.updatedAt && (Date.now() - wxState.updatedAt < 5 * 60_000) && wxState.alicante && wxState.bratislava;
        if (fresh) return wxState;
        try { await refreshWeather(); } catch (_) {}
        return wxState;
      };
      await ensureRecent();
      const a = wxState.alicante || {};
      const b = wxState.bratislava || {};
      const fmtTime = (s) => (typeof s === 'string' && s.includes('T')) ? s.split('T')[1] : (s || '—');
      const dayA = typeof a.daylightSeconds === 'number' ? formatDayLength(a.daylightSeconds) : '—';
      const dayB = typeof b.daylightSeconds === 'number' ? formatDayLength(b.daylightSeconds) : '—';
      const tA = typeof a.tempC === 'number' ? `${Math.round(a.tempC)}°C` : '—°C';
      const tB = typeof b.tempC === 'number' ? `${Math.round(b.tempC)}°C` : '—°C';
      const linesA = [
        `${ALICANTE.name.split(',')[0]}`,
        `Sunrise ${fmtTime(a.sunrise)}`,
        `Sunset ${fmtTime(a.sunset)}`,
        `Day ${dayA}`,
      ];
      const linesB = [
        `${BRATISLAVA.name.split(',')[0]}`,
        `Sunrise ${fmtTime(b.sunrise)}`,
        `Sunset ${fmtTime(b.sunset)}`,
        `Day ${dayB}`,
      ];
      await overlayMultiTextOnImage(filePath, [
        { text: linesA.join('\n'), x: '20', y: '20' },
        { text: linesB.join('\n'), x: 'w-tw-20', y: '20' },
        { text: tA, x: '20', y: 'h-th-20', fontsize: 26 },
        { text: tB, x: 'w-tw-20', y: 'h-th-20', fontsize: 26 },
      ]);
    } catch (e) {
      console.warn('[overlay] Failed to stamp info:', e && e.message ? e.message : e);
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

// Overlay helpers using ffmpeg drawtext
function buildDrawtext(text, opts) {
  const { x = '20', y = '20', fontsize = 36, box = true } = opts || {};
  const fontCandidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
  ];
  const fontFile = fontCandidates.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
  const fontPart = fontFile ? `fontfile=${fontFile}:` : '';
  // Escape drawtext special chars and allow \n for new lines
  const safeText = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
  const boxPart = box ? ':box=1:boxcolor=black@0.55:boxborderw=12' : '';
  return `drawtext=${fontPart}text='${safeText}':fontcolor=white:fontsize=${fontsize}${boxPart}:x=${x}:y=${y}:shadowcolor=black:shadowx=2:shadowy=2`;
}

async function overlayMultiTextOnImage(inputPath, blocks) {
  if (!blocks || !blocks.length) return false;
  const hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) { console.warn('[overlay] ffmpeg not available; skipping'); return false; }
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath);
  const out = path.join(dir, `.tmp-${base}`);
  try { fs.unlinkSync(out); } catch (_) {}
  const filter = blocks.map(b => buildDrawtext(b.text || '', b)).join(',');
  const ext = (path.extname(inputPath).toLowerCase().replace('.', '')) || 'jpg';
  const args = ['-y', '-i', inputPath, '-vf', filter];
  if (ext === 'jpg' || ext === 'jpeg') {
    args.push('-q:v', String(Math.max(2, Math.round((100 - JPEG_QUALITY) / 5))));
  }
  args.push(out);
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  try { fs.renameSync(out, inputPath); }
  catch (e) { fs.copyFileSync(out, inputPath); try { fs.unlinkSync(out); } catch(_){} }
  return true;
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

// Only YYYY-MM-DD-daylight.mp4 daily daylight videos
function getDaylightDailyVideosSorted() {
  try {
    const re = /^\d{4}-\d{2}-\d{2}-daylight\.mp4$/i;
    return fs.readdirSync(VIDEOS_DIR)
      .filter(name => re.test(name))
      .map(name => ({ name, full: path.join(VIDEOS_DIR, name), stat: fs.statSync(path.join(VIDEOS_DIR, name)) }))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first
  } catch (_) { return []; }
}

async function mergeDailyVideosIntoFull() {
  const hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) { console.warn('[merge] ffmpeg not available; skipping full merge'); return false; }
  // Merge daily videos in chronological order (oldest -> newest)
  const vids = getDailyVideosSorted()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
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

// Merge all YYYY-MM-DD-daylight.mp4 into a single full daylight video
async function mergeDaylightVideosIntoFull() {
  const hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) { console.warn('[merge] ffmpeg not available; skipping full daylight merge'); return false; }
  const vids = getDaylightDailyVideosSorted()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name)); // chronological
  if (vids.length === 0) { console.log('[merge] No daylight daily videos to merge'); return false; }
  ensureDir(VIDEOS_DIR);
  ensureDir(TMP_DIR);
  const listPath = path.join(TMP_DIR, 'concat-full-daylight.txt');
  try { fs.unlinkSync(listPath); } catch (_) {}
  const lines = vids.map(v => `file '${v.full.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, lines, 'utf8');
  const out = FULL_DAYLIGHT_PATH;
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-an', out];
  console.log(`[merge] ffmpeg ${args.join(' ')}`);
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  }).catch((e) => console.warn(`[merge] Failed to create full daylight video: ${e && e.message ? e.message : e}`));
  try { fs.unlinkSync(listPath); } catch (_) {}
  const ok = fs.existsSync(out);
  if (ok) console.log(`[merge] Full daylight video updated at ${out}`);
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

  // API: Reprocess/regenerate daylight-only video for a specific date
  app.post('/api/reprocess-daylight/:ymd', async (req, res) => {
  try {
    const ymd = String(req.params.ymd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return res.status(400).json({ success: false, error: 'Bad date' });
    }
    const imgs = listImagesForDate(ymd);
    if (!imgs.length) {
      return res.status(404).json({ success: false, error: 'No images for date' });
    }
    const ok = await generateDaylightVideo(ymd);
    return res.status(200).json({ success: !!ok });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
  });

  // API: Delete all images for a given date folder (YYYY-MM-DD)
  app.post('/api/delete-images/:ymd', async (req, res) => {
    try {
      const ymd = String(req.params.ymd || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        return res.status(400).json({ success: false, error: 'Bad date' });
      }
      const baseDir = path.join(OUTPUT_DIR, ymd);
      let deleted = 0;
      try {
        const files = fs.readdirSync(baseDir);
        for (const name of files) {
          const lower = name.toLowerCase();
          if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
            try { fs.unlinkSync(path.join(baseDir, name)); deleted++; } catch (_) {}
          }
        }
      } catch (_) {
        // If folder missing, treat as nothing to delete
      }
      // Try remove date folder if empty after deletion
      let removedDir = false;
      try {
        const remain = fs.readdirSync(baseDir);
        if (!remain || remain.length === 0) { fs.rmdirSync(baseDir); removedDir = true; }
      } catch (_) { /* ignore */ }
      return res.status(200).json({ success: true, deleted, removedDir });
    } catch (e) {
      return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
    }
  });

// API: Re-merge all daily videos into the full-time video
app.post('/api/reprocess-full', async (req, res) => {
  try {
    const daily = getDailyVideosSorted();
    if (!daily || daily.length === 0) {
      return res.status(404).json({ success: false, error: 'No daily videos to merge' });
    }
    const ok = await mergeDailyVideosIntoFull();
    return res.status(ok ? 200 : 500).json({ success: !!ok });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// API: Merge all daylight daily videos into a single full daylight video
app.post('/api/reprocess-full-daylight', async (req, res) => {
  try {
    const daily = getDaylightDailyVideosSorted();
    if (!daily || daily.length === 0) {
      return res.status(404).json({ success: false, error: 'No daylight daily videos to merge' });
    }
    const ok = await mergeDaylightVideosIntoFull();
    return res.status(ok ? 200 : 500).json({ success: !!ok });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// Background queue to (re)generate daylight-only videos sequentially
let daylightQueue = { running: false, startedAt: 0, current: null, remaining: [], completed: [], total: 0 };
async function runDaylightQueue() {
  if (!daylightQueue.running) return;
  while (daylightQueue.running && daylightQueue.remaining.length > 0) {
    daylightQueue.current = daylightQueue.remaining.shift();
    try {
      // Only (re)generate if missing
      const ymd = daylightQueue.current;
      const imgs = listImagesForDate(ymd);
      if (imgs && imgs.length) {
        if (!daylightVideoExistsForDate(ymd)) {
          await generateDaylightVideo(ymd).catch(() => {});
        }
      }
    } catch (_) { /* ignore */ }
    daylightQueue.completed.push(daylightQueue.current);
    daylightQueue.current = null;
  }
  daylightQueue.running = false;
}

// Start or enqueue daylight generation for all days (except today)
app.post('/api/reprocess-daylight-all', async (req, res) => {
  try {
    const today = ymdToday();
    const dates = getDateFolders();
    const pending = dates.filter(d => d < today);
    if (!pending.length) return res.status(404).json({ success: false, error: 'No days to process' });
    if (!daylightQueue.running) {
      daylightQueue = { running: true, startedAt: Date.now(), current: null, remaining: pending.slice(), completed: [], total: pending.length };
      // Fire and forget
      setTimeout(() => { runDaylightQueue().catch(()=>{}); }, 0);
    } else {
      // Merge new items without duplicates
      const set = new Set(daylightQueue.remaining.concat(pending));
      daylightQueue.remaining = Array.from(set);
      daylightQueue.total = daylightQueue.completed.length + daylightQueue.remaining.length + (daylightQueue.current ? 1 : 0);
    }
    return res.status(200).json({ success: true, running: daylightQueue.running, total: daylightQueue.total });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

// Poll daylight queue status
app.get('/api/reprocess-daylight-status', (req, res) => {
  try {
    const st = daylightQueue || { running: false };
    return res.status(200).json({
      running: !!st.running,
      startedAt: st.startedAt || 0,
      current: st.current || null,
      completed: (st.completed || []).length,
      total: st.total || 0,
      remaining: (st.remaining || []).length,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e && e.message ? e.message : String(e) });
  }
});

  // Simple index page that shows the latest screenshot
  app.get('/', (req, res) => {
    // Unified single-screen view (no dropdowns)
    try {
      const latest = getLatestImagePath();
      const latestUrl = latest ? `/images/${latest}` : null;
      const allDates = getProcessedDateFolders();
      const total24h = getDailyVideosSorted().length;
      const totalDaylight = getDaylightDailyVideosSorted().length;
      const rowsHtml = allDates.map((d) => {
        const count = listImagesForDate(d).length;
        const has24 = videoExistsForDate(d);
        const hasDay = daylightVideoExistsForDate(d);
        let play24 = '<button class="btn sm" data-action="play-24" disabled aria-label="Play 24-hour video" data-tip="Play the 24-hour time-lapse for this date.">▶</button>';
        if (has24) {
          try {
            const st = fs.statSync(videoPathForDate(d));
            const url = `/images/videos/${encodeURIComponent(d + '.mp4')}?v=${Math.floor(st.mtimeMs)}`;
            play24 = `<button class=\"btn sm\" data-action=\"play-24\" aria-label=\"Play 24-hour video\" data-tip=\"Play the 24-hour time-lapse for this date.\" onclick=\"openPlayer('${url}')\">▶</button>`;
          } catch (_) {}
        }
        let playDay = '<button class="btn sm" data-action="play-day" disabled aria-label="Play daylight-only video" data-tip="Play the daylight-only time-lapse. Night frames are removed.">☀ ▶</button>';
        if (hasDay) {
          try {
            const st = fs.statSync(daylightVideoPathForDate(d));
            const url = `/images/videos/${encodeURIComponent(d + '-daylight.mp4')}?v=${Math.floor(st.mtimeMs)}`;
            playDay = `<button class=\"btn sm\" data-action=\"play-day\" aria-label=\"Play daylight-only video\" data-tip=\"Play the daylight-only time-lapse. Night frames are removed.\" onclick=\"openPlayer('${url}')\">☀ ▶</button>`;
          } catch (_) {}
        }
        const re24 = count > 0
          ? `<button class="btn sm" data-action="re-24" aria-label="Reprocess 24-hour video" data-tip="Rebuild the 24-hour video from stored photos for this date. Safe to run multiple times." onclick="reprocessDay('${d}', this)">♻️</button>`
          : `<button class="btn sm" data-action="re-24" aria-label="Reprocess 24-hour video" data-tip="Rebuild the 24-hour video from stored photos for this date." disabled>♻️</button>`;
        const reDay = count > 0
          ? `<button class="btn sm" data-action="re-day" aria-label="Reprocess daylight-only video" data-tip="Generate or rebuild the daylight-only video using sunrise/sunset. Night frames are excluded." onclick="reprocessDaylight('${d}', this)">♻️</button>`
          : `<button class="btn sm" data-action="re-day" aria-label="Reprocess daylight-only video" data-tip="Generate or rebuild the daylight-only video using sunrise/sunset." disabled>♻️</button>`;
        const del = `<button class="btn sm" data-action="delete" aria-label="Delete all photos" data-tip="Delete all captured photos for this date. This is irreversible and removes the source images." onclick="deleteImagesForDay('${d}', this)">🗑️</button>`;
        return `<li class=\"day-row\" data-ymd=\"${d}\"><span class=\"name\">${d}</span><span class=\"count\" title=\"Photos\">${count}</span><div class=\"group\">${play24}${re24}</div><div class=\"group\">${playDay}${reDay}</div><div class=\"group\">${del}</div></li>`;
      }).join('');
      const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Webcam Snapshots</title>
    <style>
      :root { --bg:#e8f7ff; --bg2:#fff3d6; --fg:#1f3b4d; --muted:#6e8a91; --border:#cfe7ef; --button-bg:#eaf6ff; --button-fg:#0b4f6c; --button-border:#bfe6f5; --code-bg:#fff2d6; --accent:#2bb3d9; }
      [data-theme=\"dark\"] { --bg:#0b1d26; --bg2:#041018; --fg:#cfe9f3; --muted:#8bb2bf; --border:#123542; --button-bg:#0f2a35; --button-fg:#cfe9f3; --button-border:#1f4756; --code-bg:#082028; --accent:#56cfe1; }
      html, body { background: linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%); color: var(--fg); }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 16px; }
      header { margin-bottom: 12px; }
      header .header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .meta { color: var(--muted); font-size: 0.9em; margin: 6px 0; }
      .summary { display: grid; grid-template-columns: 1fr; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: rgba(255,255,255,0.45); }
      [data-theme=\"dark\"] .summary { background: rgba(0,0,0,0.2); }
      .summary .line { display: flex; align-items: center; gap: 10px; }
      .summary img { max-width: 320px; height: auto; border: 1px solid var(--border); border-radius: 6px; }
      .days { list-style: none; padding: 0; margin: 12px 0; display: grid; grid-template-columns: 1fr; gap: 6px; }
      .day-row { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: rgba(255,255,255,0.5); }
      [data-theme=\"dark\"] .day-row { background: rgba(0,0,0,0.2); }
      .day-row .name { font-weight: 600; }
      .day-row .count { color: var(--muted); padding: 2px 8px; border: 1px solid var(--border); border-radius: 999px; font-variant-numeric: tabular-nums; }
      .group { display: inline-flex; gap: 6px; }
      .btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-radius: 999px; cursor: pointer; }
      .btn.sm { padding: 4px 8px; }
      .btn:hover { filter: brightness(0.98); }
      .btn:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
      .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
      /* Simple tooltip bubble for any element with data-tip */
      [data-tip] { position: relative; }
      [data-tip]::after {
        content: attr(data-tip);
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        transform: translateX(-50%) scale(0.98);
        background: rgba(0,0,0,0.85);
        color: #fff;
        padding: 6px 8px;
        border-radius: 6px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        width: max-content;
        max-width: 260px;
        font-size: 12px;
        line-height: 1.3;
        white-space: pre-line;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease, transform 120ms ease;
        z-index: 10000;
      }
      [data-tip]::before {
        content: '';
        position: absolute;
        left: 50%;
        bottom: calc(100% + 2px);
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: rgba(0,0,0,0.85);
        opacity: 0;
        transition: opacity 120ms ease;
        z-index: 10001;
      }
      [data-tip]:hover::after,
      [data-tip]:focus-visible::after,
      [data-tip]:hover::before,
      [data-tip]:focus-visible::before {
        opacity: 1;
        transform: translateX(-50%) scale(1);
      }
      .icon-btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); border-radius: 999px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; line-height: 1; }
      .icon-btn:hover { filter: brightness(0.98); }
      .icon-btn:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
      #player-overlay[hidden] { display: none !important; }
      #player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: grid; place-items: center; z-index: 9999; }
      .player-wrap { width: min(96vw, 1200px); }
      .player-wrap video { width: 100%; max-height: 80vh; background: #000; display: block; }
      .player-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
    </style>
    <script>
      (function() {
        var KEY = 'theme-preference';
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        function getStored() { try { return localStorage.getItem(KEY) || 'auto'; } catch (_) { return 'auto'; } }
        function applyTheme(mode) { var effective = mode === 'auto' ? (mql.matches ? 'dark' : 'light') : mode; document.documentElement.setAttribute('data-theme', effective); }
        var mode = getStored(); applyTheme(mode);
        function iconFor(m) { return m === 'light' ? '☀️' : (m === 'dark' ? '🌙' : '🖥️'); }
        function titleFor(m) { return 'Theme: ' + (m.charAt(0).toUpperCase() + m.slice(1)); }
        function updateUi() { var btn = document.getElementById('theme-btn'); var ico = document.getElementById('theme-icon'); if (btn) btn.setAttribute('title', titleFor(mode)); if (ico) ico.textContent = iconFor(mode); }
        window.__cycleTheme = function() { mode = mode === 'auto' ? 'light' : (mode === 'light' ? 'dark' : 'auto'); try { localStorage.setItem(KEY, mode); } catch (_) {} applyTheme(mode); updateUi(); };
        if (mql && mql.addEventListener) mql.addEventListener('change', function(){ if (mode === 'auto') applyTheme(mode); });
        else if (mql && mql.addListener) mql.addListener(function(){ if (mode === 'auto') applyTheme(mode); });
        window.addEventListener('DOMContentLoaded', updateUi);
      })();
    </script>
    <script>
      (function(){
        function byId(id){ return document.getElementById(id); }
        window.openPlayer = function(url){ var ov = byId('player-overlay'); var v = byId('player-video'); if (!ov || !v) return; try { v.pause(); } catch(_){} v.src = url; ov.hidden = false; try { v.play().catch(function(){}); } catch(_){} };
        window.closePlayer = function(){ var ov = byId('player-overlay'); var v = byId('player-video'); if (!ov || !v) return; try { v.pause(); } catch(_){} v.removeAttribute('src'); ov.hidden = true; };
        window.playerFullscreen = function(){ var v = byId('player-video'); if (!v) return; if (v.requestFullscreen) v.requestFullscreen().catch(function(){}); else if (v.webkitEnterFullscreen) try { v.webkitEnterFullscreen(); } catch(_){} };
        window.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePlayer(); });
      })();
    </script>
    <script>
      function setRowPlayEnabled(row, kind, ymd){
        if (!row) return;
        var btn = row.querySelector('[data-action="play-' + kind + '"]');
        if (!btn) return;
        btn.disabled = false;
        btn.onclick = function(){ var suffix = (kind === 'day') ? '-daylight' : ''; openPlayer('/images/videos/' + ymd + suffix + '.mp4?v=' + Date.now()); };
      }
      function setRowCount(row, n){ var c = row && row.querySelector('.count'); if (c) c.textContent = String(n); }
      function setStatus(msg){ var el = document.getElementById('status'); if (el) el.textContent = msg || ''; }
      function reprocessDay(ymd, el){
        setStatus('Reprocessing ' + ymd + ' (24h)…');
        if (el) { el.disabled = true; }
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){ var ok = !!(data && data.success); setStatus(ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''))); var row = el && el.closest ? el.closest('.day-row') : null; if (ok && row) setRowPlayEnabled(row, '24', ymd); if (ok) openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now()); })
          .catch(function(){ setStatus('Failed.'); })
          .finally(function(){ if (el) el.disabled = false; });
      }
      function reprocessDaylight(ymd, el){
        setStatus('Reprocessing daylight ' + ymd + '…');
        if (el) { el.disabled = true; }
        fetch('/api/reprocess-daylight/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){ var ok = !!(data && data.success); setStatus(ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''))); var row = el && el.closest ? el.closest('.day-row') : null; if (ok && row) setRowPlayEnabled(row, 'day', ymd); if (ok) openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now()); })
          .catch(function(){ setStatus('Failed.'); })
          .finally(function(){ if (el) el.disabled = false; });
      }
      function deleteImagesForDay(ymd, el){
        var row = el && el.closest ? el.closest('.day-row') : null;
        try { var ok = window.confirm('Delete all photos for ' + ymd + '?'); if (!ok) return; } catch(_){}
        setStatus('Deleting images for ' + ymd + '…');
        if (el) el.disabled = true;
        fetch('/api/delete-images/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){ var ok = !!(data && data.success); setStatus(ok ? ('Deleted ' + (data && typeof data.deleted === 'number' ? data.deleted : 0) + ' for ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''))); if (ok && row) { setRowCount(row, 0); var reBtns = row.querySelectorAll('[data-action=\"re-24\"], [data-action=\"re-day\"]'); for (var i=0;i<reBtns.length;i++){ reBtns[i].disabled = true; } } })
          .catch(function(){ setStatus('Failed.'); })
          .finally(function(){ if (el) el.disabled = false; });
      }
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
    <section class="summary">
      <div class="line"><strong>Current image</strong>${latestUrl ? `: <img src="${latestUrl}" alt="Latest" />` : ': none yet'}</div>
      <div class="line"><strong>Video total daylight</strong>: ${totalDaylight}</div>
      <div class="line"><strong>Video total 24h</strong>: ${total24h}</div>
      <div id="status" class="meta" aria-live="polite"></div>
    </section>
    <ul class="days" aria-label="Days">
      ${rowsHtml || '<li class="day-row"><span class="name">No days yet</span></li>'}
    </ul>
    <div id="player-overlay" hidden>
      <div class="player-wrap">
        <video id="player-video" controls playsinline></video>
        <div class="player-actions">
          <button class="btn" onclick="playerFullscreen()">Fullscreen</button>
          <button class="btn" onclick="closePlayer()">Close</button>
        </div>
      </div>
    </div>
  </body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(body);
    } catch (e) {
      // fall back to previous UI on any error
    }
    const latest = getLatestImagePath();
    const latestUrl = latest ? `/images/${latest}` : null;
    const _allDaily = getDailyVideosSorted();
  const vids = _allDaily.slice(0, 30);
  const hasAnyDaily = _allDaily.length > 0;
  const fullExists = (() => { try { return fs.existsSync(FULL_VIDEO_PATH); } catch (_) { return false; } })();
  const fullStat = (() => { try { return fullExists ? fs.statSync(FULL_VIDEO_PATH) : null; } catch (_) { return null; } })();
  const fullUrl = fullExists ? `/images/videos/${encodeURIComponent(FULL_VIDEO_NAME)}?v=${fullStat ? Math.floor(fullStat.mtimeMs) : Date.now()}` : null;
  // Full daylight aggregated video (optional)
  const fullDaylightExists = (() => { try { return fs.existsSync(FULL_DAYLIGHT_PATH); } catch (_) { return false; } })();
  const fullDaylightStat = (() => { try { return fullDaylightExists ? fs.statSync(FULL_DAYLIGHT_PATH) : null; } catch (_) { return null; } })();
  const fullDaylightUrl = fullDaylightExists ? `/images/videos/${encodeURIComponent(FULL_DAYLIGHT_NAME)}?v=${fullDaylightStat ? Math.floor(fullDaylightStat.mtimeMs) : Date.now()}` : null;
  // Dates for videos/daylight sections (image browsing removed)
  const todayDate = ymdToday();
  const allDates = getProcessedDateFolders();
  // Temperature color helper (white at <=0°C to red at >=40°C)
  function __tempToHex(t) {
    if (typeof t !== 'number' || !isFinite(t)) return '#cccccc';
    const cl = Math.max(0, Math.min(40, t));
    const frac = cl / 40;
    const r = 255;
    const g = Math.round(255 * (1 - frac));
    const b = Math.round(255 * (1 - frac));
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  // Build daily rows with Play, Reprocess, and Delete Images actions (no thumbnails)
  const videoRowsHtml = allDates.map((d) => {
    const count = listImagesForDate(d).length;
    const hasVid = videoExistsForDate(d);
    let playBtn = '<button class="btn" disabled aria-label="Play 24-hour video" data-tip="Play the 24-hour time-lapse for this date.">Play</button>';
    if (hasVid) {
      try {
        const st = fs.statSync(videoPathForDate(d));
        const url = `/images/videos/${encodeURIComponent(d + '.mp4')}?v=${Math.floor(st.mtimeMs)}`;
        playBtn = `<button class="btn" aria-label="Play 24-hour video" data-tip="Play the 24-hour time-lapse for this date." onclick="openPlayer('${url}')">Play</button>`;
      } catch (_) { /* fallback keeps disabled button */ }
    }
    const reBtn = count > 0
      ? `<button class="btn" aria-label="Reprocess 24-hour video" data-tip="Rebuild the 24-hour video from stored photos for this date. Safe to run multiple times." onclick="reprocessDay('${d}', this)">Reprocess</button>`
      : `<button class="btn" aria-label="Reprocess 24-hour video" data-tip="Rebuild the 24-hour video from stored photos for this date." disabled>Reprocess</button>`;
    const delBtn = `<button class="btn" aria-label="Delete images" data-tip="Delete all captured photos for this date. This is irreversible and removes the source images." onclick="deleteImagesForDay('${d}', this)"${count > 0 ? '' : ' disabled'}>Delete images</button>`;
    return `<li class="video-row"><span class="name">${d}</span><span class="meta-count">${count}</span>${playBtn}${reBtn}${delBtn}</li>`;
  }).join('');
  // Build daylight-only rows
  const daylightRowsHtml = allDates.map((d) => {
    const count = listImagesForDate(d).length;
    const hasVid = daylightVideoExistsForDate(d);
    let playBtn = '<button class="btn" disabled aria-label="Play daylight-only video" data-tip="Play the daylight-only time-lapse. Night frames are removed.">Play</button>';
    if (hasVid) {
      try {
        const st = fs.statSync(daylightVideoPathForDate(d));
        const url = `/images/videos/${encodeURIComponent(d + '-daylight.mp4')}?v=${Math.floor(st.mtimeMs)}`;
        playBtn = `<button class="btn" aria-label="Play daylight-only video" data-tip="Play the daylight-only time-lapse. Night frames are removed." onclick="openPlayer('${url}')">Play</button>`;
      } catch (_) { /* keep disabled */ }
    }
    const reBtn = count > 0
      ? `<button class="btn" aria-label="Reprocess daylight-only video" data-tip="Generate or rebuild the daylight-only video using sunrise/sunset. Night frames are excluded." onclick="reprocessDaylight('${d}', this)">Reprocess</button>`
      : `<button class="btn" aria-label="Reprocess daylight-only video" data-tip="Generate or rebuild the daylight-only video using sunrise/sunset." disabled>Reprocess</button>`;
    return `<li class="video-row"><span class="name">${d}</span><span class="meta-count">${count}</span>${playBtn}${reBtn}</li>`;
  }).join('');
  // Total number of stored images across all date folders
  const storedCount = getProcessedDateFolders().reduce((acc, d) => acc + listImagesForDate(d).length, 0);
  // Weather/Sun panel values
  const wxA = wxState.alicante || {};
  const wxB = wxState.bratislava || {};
  const fmt = (s) => (typeof s === 'string' && s.includes('T')) ? s.split('T')[1] : (s || '—');
  const dayA = typeof wxA.daylightSeconds === 'number' ? formatDayLength(wxA.daylightSeconds) : '—';
  const dayB = typeof wxB.daylightSeconds === 'number' ? formatDayLength(wxB.daylightSeconds) : '—';
  const tempA = (typeof wxA.tempC === 'number' ? `${Math.round(wxA.tempC)}°C` : '—');
  const tempB = (typeof wxB.tempC === 'number' ? `${Math.round(wxB.tempC)}°C` : '—');
  const wxUpdated = wxState.updatedAt ? new Date(wxState.updatedAt).toLocaleTimeString() : '—';
  // Temperature overlay values for both locations
  const tempValA = (typeof wxA.tempC === 'number' ? wxA.tempC : null);
  const tempValB = (typeof wxB.tempC === 'number' ? wxB.tempC : null);
  const tempColorA = __tempToHex(tempValA);
  const tempColorB = __tempToHex(tempValB);
  const tempDisplayA = (typeof tempValA === 'number' ? `${Math.round(tempValA)}°C` : '—');
  const tempDisplayB = (typeof tempValB === 'number' ? `${Math.round(tempValB)}°C` : '—');

  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Webcam Snapshot Service</title>
    <meta http-equiv="refresh" content="${Math.max(30, Math.floor(CAPTURE_INTERVAL_MS / 1000 / 2))}" />
    <style>
      :root {
        /* Beach vibe (day): sky → sand gradient + sea accents */
        --bg: #e8f7ff;        /* light sky */
        --bg2: #fff3d6;       /* warm sand */
        --fg: #1f3b4d;        /* deep sea slate */
        --muted: #6e8a91;     /* muted teal-gray */
        --border: #cfe7ef;    /* soft sky border */
        --button-bg: #eaf6ff; /* airy button */
        --button-fg: #0b4f6c; /* sea */
        --button-border: #bfe6f5;
        --code-bg: #fff2d6;   /* sandy code blocks */
        --accent: #2bb3d9;    /* turquoise accent */
      }
      [data-theme="dark"] {
        /* Beach vibe (night): deep navy with teal accents */
        --bg: #0b1d26;        /* deep night sky */
        --bg2: #041018;       /* horizon */
        --fg: #cfe9f3;        /* moonlit text */
        --muted: #8bb2bf;     /* muted teal */
        --border: #123542;    /* dark teal border */
        --button-bg: #0f2a35; /* button surface */
        --button-fg: #cfe9f3; /* readable on dark */
        --button-border: #1f4756;
        --code-bg: #082028;   /* dark panel */
        --accent: #56cfe1;    /* bright sea */
      }
      html, body { background: linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%); color: var(--fg); }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; }
      header { margin-bottom: 16px; }
      header .header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 4px; }
      .meta { color: var(--muted); font-size: 0.9em; margin: 8px 0; }
      .grid { display: grid; gap: 16px; }
      .rows { display: grid; gap: 24px; }
      /* Weather panel */
      .wx-section { margin-top: 5vh; }
      .wx { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 10px 0 4px; }
      .wx-card { border: 1px solid var(--border); background: var(--button-bg); color: var(--fg); border-radius: 6px; padding: 10px; }
      .wx-card .title { font-weight: 700; margin-bottom: 6px; }
      .wx-card .row { display: flex; justify-content: space-between; gap: 8px; }
      .wx-updated { color: var(--muted); font-size: 0.85em; }
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
      .videos { display: none; }
      .video-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
      .video-row { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--button-bg); color: var(--fg); }
      .video-row .name { font-weight: 600; }
      .video-row .meta-count { color: var(--muted); font-variant-numeric: tabular-nums; }
      .btn { display: inline-block; padding: 6px 10px; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); border-radius: 4px; text-decoration: none; cursor: pointer; }
      .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
      a.button { display: inline-block; padding: 6px 10px; border: 1px solid var(--button-border); border-radius: 4px; text-decoration: none; color: var(--button-fg); background: var(--button-bg); }
      a.button:hover { filter: brightness(0.98); }
      code { background: var(--code-bg); color: var(--fg); padding: 2px 4px; border-radius: 4px; }
      /* Icon-only theme button */
      .icon-btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); border-radius: 999px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; line-height: 1; }
      .icon-btn:hover { filter: brightness(0.98); }
      .icon-btn:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
      /* Compact view selector */
      .nav-views { display: flex; gap: 8px; align-items: center; margin: 12px 0 8px; }
      .view-select { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-radius: 6px; }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
      .tabpanels { border: 1px solid var(--button-border); padding: 12px; border-radius: 6px; }
      .full video { width: 100%; height: auto; display: block; background: #000; }
      /* Live image overlay: temperature */
      .live-wrap { position: relative; display: inline-block; }
      .temp-badge { position: absolute; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.35); backdrop-filter: blur(2px); }
      .temp-badge.badge-right { bottom: 8px; right: 8px; top: auto; transform-origin: right bottom; transform: scale(0.5); }
      .temp-badge.badge-left { bottom: 8px; left: 8px; top: auto; transform-origin: left bottom; transform: scale(0.5); }
      .temp-icon { width: 18px; height: 18px; color: var(--temp-color, #ccc); filter: drop-shadow(0 0 2px rgba(255,255,255,0.7)); }
      .temp-label { color: #ffffff; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.35); }
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
      // In-app video player overlay
      (function(){
        function byId(id){ return document.getElementById(id); }
        window.openPlayer = function(url){
          var ov = byId('player-overlay');
          var v = byId('player-video');
          if (!ov || !v) return;
          try { v.pause(); } catch (_) {}
          v.src = url;
          ov.hidden = false;
          try { v.play().catch(function(){}); } catch (_) {}
        };
        window.closePlayer = function(){
          var ov = byId('player-overlay');
          var v = byId('player-video');
          if (!ov || !v) return;
          try { v.pause(); } catch (_) {}
          v.removeAttribute('src');
          ov.hidden = true;
        };
        window.playerFullscreen = function(){
          var v = byId('player-video');
          if (!v) return;
          if (v.requestFullscreen) v.requestFullscreen().catch(function(){});
          else if (v.webkitEnterFullscreen) try { v.webkitEnterFullscreen(); } catch(_){}
        };
        window.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePlayer(); });
      })();
    </script>
    <script>
      // Manual reprocess helper for Videos tab (home page)
      function reprocessDay(ymd, el){
        var status = document.getElementById('reprocess-status');
        if (status) status.textContent = 'Reprocessing ' + ymd + '…';
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Reprocessing…'; }
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            // If successful, enable Play in the same row immediately
            if (ok && el) {
              var row = el.closest('.video-row');
              if (row) {
                var buttons = row.querySelectorAll('button.btn');
                for (var i = 0; i < buttons.length; i++) {
                  if (/^Play$/i.test(buttons[i].textContent || '')) {
                    buttons[i].disabled = false;
                    (function(btn){ btn.onclick = function(){ openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now()); }; })(buttons[i]);
                    break;
                  }
                }
              }
              // Also open the freshly generated video now
              openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (el) { el.disabled = false; el.textContent = el.dataset._label || 'Reprocess'; }});
      }
      // Delete all images for a given date (homepage Videos tab)
      function deleteImagesForDay(ymd, el){
        if (!ymd) return;
        var row = el && el.closest ? el.closest('.video-row') : null;
        var status = document.getElementById('reprocess-status');
        var confirmMsg = 'Delete all images for ' + ymd + '? This cannot be undone.';
        try {
          var ok = window.confirm(confirmMsg);
          if (!ok) return;
        } catch(_) {}
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Deleting…'; }
        if (status) status.textContent = 'Deleting images for ' + ymd + '…';
        fetch('/api/delete-images/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? ('Deleted ' + (data && typeof data.deleted === 'number' ? data.deleted : 0) + ' image(s) for ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok && row) {
              // Update count to 0 and disable reprocess
              var cnt = row.querySelector('.meta-count');
              if (cnt) cnt.textContent = '0';
              var buttons = row.querySelectorAll('button.btn');
              for (var i = 0; i < buttons.length; i++) {
                if (/^Reprocess$/i.test(buttons[i].textContent || '')) {
                  buttons[i].disabled = true;
                }
              }
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (el) { el.disabled = false; el.textContent = el.dataset._label || 'Delete images'; }});
      }
      // Manual reprocess helper for Daylight tab (home page)
      function reprocessDaylight(ymd, el){
        var status = document.getElementById('reprocess-daylight-status');
        if (status) status.textContent = 'Reprocessing daylight ' + ymd + '…';
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Reprocessing…'; }
        fetch('/api/reprocess-daylight/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok && el) {
              var row = el.closest('.video-row');
              if (row) {
                var buttons = row.querySelectorAll('button.btn');
                for (var i = 0; i < buttons.length; i++) {
                  if (/^Play$/i.test(buttons[i].textContent || '')) {
                    buttons[i].disabled = false;
                    (function(btn){ btn.onclick = function(){ openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now()); }; })(buttons[i]);
                    break;
                  }
                }
              }
              openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (el) { el.disabled = false; el.textContent = el.dataset._label || 'Reprocess'; }});
      }
      function reprocessDaylightAll(el){
        var btn = el || document.getElementById('reprocess-daylight-all-btn');
        var status = document.getElementById('reprocess-daylight-all-status');
        if (btn) { btn.disabled = true; btn.dataset._label = btn.textContent; btn.textContent = 'Starting…'; }
        if (status) status.textContent = 'Starting daylight queue…';
        fetch('/api/reprocess-daylight-all', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (!ok && status) status.textContent = 'Nothing to do.';
            if (ok) {
              updateDaylightQueueStatus();
              if (!window.__dlTimer) window.__dlTimer = setInterval(updateDaylightQueueStatus, 3000);
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed to start queue.'; })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || 'Generate missing daylight videos'; }});
      }
      function reprocessFullDaylight(el){
        var btn = el || document.getElementById('reprocess-full-daylight-btn');
        var status = document.getElementById('reprocess-daylight-all-status');
        if (btn) { btn.disabled = true; btn.dataset._label = btn.textContent; btn.textContent = 'Merging…'; }
        if (status) status.textContent = 'Merging all daylight videos…';
        fetch('/api/reprocess-full-daylight', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? 'Full daylight video merged.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok) {
              try {
                var url = '/images/videos/' + encodeURIComponent('${FULL_DAYLIGHT_NAME}') + '?v=' + Date.now();
                var container = document.getElementById('full-daylight-container');
                if (container) {
                  container.innerHTML = '<div class="full"><video id="full-daylight-video" src="' + url + '" controls preload="metadata" playsinline></video><div class="player-actions"><button class="btn" onclick="(function(){var v=document.getElementById(\'full-daylight-video\'); if (v && v.requestFullscreen) v.requestFullscreen();})();">Fullscreen</button></div></div>';
                }
              } catch (_) { /* ignore */ }
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed to merge.'; })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || 'Merge all daylight videos'; }});
      }
      function updateDaylightQueueStatus(){
        var status = document.getElementById('reprocess-daylight-all-status');
        fetch('/api/reprocess-daylight-status')
          .then(function(r){ return r.json().catch(function(){ return { running:false, completed:0, total:0, remaining:0 }; }); })
          .then(function(s){
            if (!status) return;
            if (!s || !s.running) {
              status.textContent = 'Idle' + (s && s.completed ? (' • Completed: ' + s.completed + '/' + (s.total||s.completed)) : '');
              if (window.__dlTimer) { clearInterval(window.__dlTimer); window.__dlTimer = null; }
              return;
            }
            var cur = s.current ? (' • Now: ' + s.current) : '';
            status.textContent = 'Running • Completed ' + s.completed + ' of ' + s.total + ' • Remaining ' + s.remaining + cur;
          })
          .catch(function(){ if (status) status.textContent = 'Queue status unavailable'; });
      }
    </script>
    <script>
      // Reprocess the full-time (merged) video
      function reprocessFull(el) {
        var btn = el || document.getElementById('reprocess-full-btn');
        var status = document.getElementById('reprocess-full-status');
        if (btn) { btn.disabled = true; btn.dataset._label = btn.textContent; btn.textContent = 'Reprocessing…'; }
        if (status) status.textContent = 'Reprocessing full-time video…';
        fetch('/api/reprocess-full', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? 'Full-time video updated.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok) {
              var v = document.getElementById('full-video');
              if (v) {
                var src = (v.getAttribute('src') || '').split('?')[0];
                v.setAttribute('src', src + '?v=' + Date.now());
                try { v.load(); } catch(_){}
              } else {
                try { location.reload(); } catch(_){}
              }
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || 'Reprocess'; }});
      }
    </script>
    <script>
      // Reprocess the full-time (merged) video
      function reprocessFull(el) {
        var btn = el || document.getElementById('reprocess-full-btn');
        var status = document.getElementById('reprocess-full-status');
        if (btn) { btn.disabled = true; btn.dataset._label = btn.textContent; btn.textContent = 'Reprocessing…'; }
        if (status) status.textContent = 'Reprocessing full-time video…';
        fetch('/api/reprocess-full', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? 'Full-time video updated.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok) {
              var v = document.getElementById('full-video');
              if (v) {
                var src = (v.getAttribute('src') || '').split('?')[0];
                v.setAttribute('src', src + '?v=' + Date.now());
                try { v.load(); } catch(_){}
              } else {
                try { location.reload(); } catch(_){}
              }
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || 'Reprocess'; }});
      }
    </script>
    <style>
      /* Overlay for in-app video playback */
      #player-overlay[hidden] { display: none !important; }
      #player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: grid; place-items: center; z-index: 9999; }
      .player-wrap { width: min(96vw, 1200px); }
      .player-wrap video { width: 100%; max-height: 80vh; background: #000; display: block; }
      .player-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
    </style>
    <script>
      (function() {
        var KEY = 'home-active-view';
        var keys = ['live','videos','daylight','lightall','full'];
        function setView(k) {
          keys.forEach(function(v){
            var panel = document.getElementById('panel-' + v);
            var active = v === k;
            if (panel) {
              panel.hidden = !active;
              panel.setAttribute('aria-hidden', active ? 'false' : 'true');
            }
          });
          try { localStorage.setItem(KEY, k); } catch (_) {}
        }
        function init() {
          var sel = document.getElementById('view-select');
          var saved = 'live';
          try { saved = localStorage.getItem(KEY) || 'live'; } catch (_) {}
          if (!keys.includes(saved) && /^tab-/.test(saved)) saved = (saved.split('-')[1] || 'live');
          if (!keys.includes(saved)) saved = 'live';
          if (sel) {
            sel.value = saved;
            sel.addEventListener('change', function(){ setView(sel.value); });
          }
          setView(saved);
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
    <section class="wx-section" aria-label="Weather and Sun">
      <div class="wx">
        <div class="wx-card" aria-live="polite">
          <div class="title">Alicante, ES</div>
          <div class="row"><span>Temp</span><span>${tempA}</span></div>
          <div class="row"><span>Sunrise</span><span>${fmt(wxA.sunrise)}</span></div>
          <div class="row"><span>Sunset</span><span>${fmt(wxA.sunset)}</span></div>
          <div class="row"><span>Day length</span><span>${dayA}</span></div>
        </div>
        <div class="wx-card">
          <div class="title">Bratislava, SK</div>
          <div class="row"><span>Temp</span><span>${tempB}</span></div>
          <div class="row"><span>Sunrise</span><span>${fmt(wxB.sunrise)}</span></div>
          <div class="row"><span>Sunset</span><span>${fmt(wxB.sunset)}</span></div>
          <div class="row"><span>Day length</span><span>${dayB}</span></div>
        </div>
      </div>
      <div class="wx-updated">Weather updated: ${wxUpdated}</div>
    </section>
    <div class="nav-views" aria-label="Views">
      <label for="view-select" class="sr-only">View</label>
      <select id="view-select" class="view-select" aria-controls="panel-live panel-videos panel-daylight panel-lightall panel-full">
        <option value="live">Live</option>
        <option value="videos">Videos</option>
        <option value="daylight">Daylight</option>
        <option value="lightall">Daylight All</option>
        <option value="full">Full-time</option>
      </select>
    </div>
    <div class="tabpanels">
      <section id="panel-live" class="tabpanel" role="tabpanel" aria-label="Live" aria-hidden="false">
        ${latestUrl ? `
        <div class="live-wrap">
          <img src="${latestUrl}" alt="Latest screenshot" />
          ${tempValA != null ? `
          <div class="temp-badge badge-left" style="--temp-color: ${tempColorA}" title="Alicante: ${tempDisplayA}">
            <svg class="temp-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0ZM12 22a6 6 0 0 1-3-11.2V5a3 3 0 0 1 6 0v5.8A6 6 0 0 1 12 22Zm0-9a 3 3 0 0 0-1 .17V5a1 1 0 0 1 2 0v8.17A3 3 0 0 0 12 13Z"/>
            </svg>
            <span class="temp-label">Alicante ${tempDisplayA}</span>
          </div>` : ''}
          ${tempValB != null ? `
          <div class="temp-badge badge-right" style="--temp-color: ${tempColorB}" title="Bratislava: ${tempDisplayB}">
            <svg class="temp-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0ZM12 22a6 6 0 0 1-3-11.2V5a3 3 0 0 1 6 0v5.8A6 6 0 0 1 12 22Zm0-9a 3 3 0 0 0-1 .17V5a1 1 0 0 1 2 0v8.17A3 3 0 0 0 12 13Z"/>
            </svg>
            <span class="temp-label">Bratislava ${tempDisplayB}</span>
          </div>` : ''}
        </div>
        ` : '<p>No screenshots yet. First capture will appear soon…</p>'}
      </section>
      <section id="panel-videos" class="tabpanel" role="tabpanel" aria-label="Videos" hidden aria-hidden="true">
        <div class="meta" id="reprocess-status"></div>
        ${videoRowsHtml ? `<ul class="video-list">${videoRowsHtml}</ul>` : '<p>No days yet.</p>'}
      </section>
      <section id="panel-daylight" class="tabpanel" role="tabpanel" aria-label="Daylight" hidden aria-hidden="true">
        <div class="meta" id="reprocess-daylight-status"></div>
        ${daylightRowsHtml ? `<ul class="video-list">${daylightRowsHtml}</ul>` : '<p>No days yet.</p>'}
      </section>
      <section id="panel-lightall" class="tabpanel" role="tabpanel" aria-label="Daylight All" hidden aria-hidden="true">
        <div class="actions">
          <button class="btn" id="reprocess-daylight-all-btn" aria-label="Generate missing daylight videos" data-tip="Scan all dates and create any missing daylight-only videos using existing images." onclick="reprocessDaylightAll(this)">Generate missing daylight videos</button>
          <button class="btn" id="reprocess-full-daylight-btn" aria-label="Merge all daylight videos" data-tip="Concatenate all existing daylight-only daily videos into one long video using ffmpeg." onclick="reprocessFullDaylight(this)">Merge all daylight videos</button>
          <span id="reprocess-daylight-all-status" class="meta"></span>
        </div>
        <div id="full-daylight-container">
          ${fullDaylightUrl ? `<div class=\"full\"><video id=\"full-daylight-video\" src=\"${fullDaylightUrl}\" controls preload=\"metadata\" playsinline></video><div class=\"player-actions\"><button class=\"btn\" onclick=\"(function(){var v=document.getElementById('full-daylight-video'); if (v && v.requestFullscreen) v.requestFullscreen();})();\">Fullscreen</button></div></div>` : '<p>No full daylight video yet. Click “Merge all daylight videos”.</p>'}
        </div>
        <p class="hint">Missing daylight videos are generated from images; merging uses ffmpeg to concatenate existing daylight videos only.</p>
      </section>
      <section id="panel-full" class="tabpanel" role="tabpanel" aria-label="Full-time" hidden aria-hidden="true">
        ${fullUrl ? `<div class=\"full\"><video id=\"full-video\" src=\"${fullUrl}\" controls preload=\"metadata\" playsinline></video><div class=\"player-actions\"><button class=\"btn\" onclick=\"(function(){var v=document.getElementById('full-video'); if (v && v.requestFullscreen) v.requestFullscreen();})();\">Fullscreen</button><button id=\"reprocess-full-btn\" class=\"btn\" aria-label=\"Reprocess full-time video\" data-tip=\"Regenerate the full-time video by concatenating all daily videos in order. Safe to run multiple times.\" onclick=\"reprocessFull(this)\"${hasAnyDaily ? '' : ' disabled'}>Reprocess</button><span id=\"reprocess-full-status\" class=\"meta\"></span></div></div>` : `<div class=\"actions\"><button id=\"reprocess-full-btn\" class=\"btn\" aria-label=\"Reprocess full-time video\" data-tip=\"Regenerate the full-time video by concatenating all daily videos in order.\" onclick=\"reprocessFull(this)\"${hasAnyDaily ? '' : ' disabled'}>Reprocess full-time video</button><span id=\"reprocess-full-status\" class=\"meta\"></span></div><p>No full-time video yet. It updates daily around 1:00.</p>`}
      </section>
    </div>
    <div id="player-overlay" hidden>
      <div class="player-wrap">
        <video id="player-video" controls playsinline></video>
        <div class="player-actions">
          <button class="btn" onclick="playerFullscreen()">Fullscreen</button>
          <button class="btn" onclick="closePlayer()">Close</button>
        </div>
      </div>
    </div>
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(body);
});

// Day view: thumbnails for a specific YYYY-MM-DD
app.get('/day/:ymd', (req, res) => {
  return res.status(404).send('Not found');
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
    return `<a href="${url}" onclick="openPlayer('${url}'); return false;"><div class="video-card"><video src="${url}" preload="metadata" controls playsinline></video><div class="caption">${caption}</div></div></a>`;
  }).join('');
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Snapshots for ${ymd}</title>
    <style>
      :root { --bg:#e8f7ff; --bg2:#fff3d6; --fg:#1f3b4d; --muted:#6e8a91; --border:#cfe7ef; --button-bg:#eaf6ff; --button-fg:#0b4f6c; --button-border:#bfe6f5; --code-bg:#fff2d6; --accent:#2bb3d9; }
      [data-theme="dark"] { --bg:#0b1d26; --bg2:#041018; --fg:#cfe9f3; --muted:#8bb2bf; --border:#123542; --button-bg:#0f2a35; --button-fg:#cfe9f3; --button-border:#1f4756; --code-bg:#082028; --accent:#56cfe1; }
      html, body { background: linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%); color: var(--fg); }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; }
      header { margin-bottom: 16px; }
      header .header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 4px; }
      .meta { color: var(--muted); font-size: 0.9em; margin: 8px 0; }
      a.button { display: inline-block; padding: 6px 10px; border: 1px solid var(--button-border); border-radius: 4px; text-decoration: none; color: var(--button-fg); background: var(--button-bg); }
      code { background: var(--code-bg); color: var(--fg); padding: 2px 4px; border-radius: 4px; }
      /* Icon-only theme button */
      .icon-btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); border-radius: 999px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; line-height: 1; }
      .icon-btn:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
      /* Tabs */
      .tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border); margin-top: 12px; }
      .tab { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px; cursor: pointer; }
      .tab[aria-selected="true"] { background: var(--bg); color: var(--fg); border-color: var(--button-border); border-bottom-color: var(--bg); }
      .tab:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
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
      // In-app video player overlay
      (function(){
        function byId(id){ return document.getElementById(id); }
        window.openPlayer = function(url){
          var ov = byId('player-overlay');
          var v = byId('player-video');
          if (!ov || !v) return;
          try { v.pause(); } catch (_) {}
          v.src = url;
          ov.hidden = false;
          try { v.play().catch(function(){}); } catch (_) {}
        };
        window.closePlayer = function(){
          var ov = byId('player-overlay');
          var v = byId('player-video');
          if (!ov || !v) return;
          try { v.pause(); } catch (_) {}
          v.removeAttribute('src');
          ov.hidden = true;
        };
        window.playerFullscreen = function(){
          var v = byId('player-video');
          if (!v) return;
          if (v.requestFullscreen) v.requestFullscreen().catch(function(){});
          else if (v.webkitEnterFullscreen) try { v.webkitEnterFullscreen(); } catch(_){}
        };
        window.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePlayer(); });
      })();
    </script>
    <script>
      function reprocessDay(ymd, el) {
        var btn = el || document.getElementById('reprocess-btn');
        var status = document.getElementById('reprocess-status');
        if (btn) { btn.disabled = true; btn.dataset._label = btn.textContent; btn.textContent = 'Reprocessing…'; }
        if (status) status.textContent = 'Reprocessing…';
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? 'Done.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok) {
              // Open freshly generated video in in-app player
              openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || btn.textContent; }});
      }
    </script>
    <script>
      // Daylight reprocess helpers (missing in day view previously)
      function reprocessDaylight(ymd, el){
        var status = document.getElementById('reprocess-daylight-status');
        if (status) status.textContent = 'Reprocessing daylight ' + ymd + '…';
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Reprocessing…'; }
        fetch('/api/reprocess-daylight/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (status) status.textContent = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (ok && el) {
              var row = el.closest && el.closest('.video-row');
              if (row) {
                var buttons = row.querySelectorAll('button.btn');
                for (var i = 0; i < buttons.length; i++) {
                  if (/^Play$/i.test(buttons[i].textContent || '')) {
                    buttons[i].disabled = false;
                    (function(btn){ btn.onclick = function(){ openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now()); }; })(buttons[i]);
                    break;
                  }
                }
              }
              openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; })
          .finally(function(){ if (el) { el.disabled = false; el.textContent = el.dataset._label || 'Reprocess'; }});
      }
      function reprocessDaylightAll(el){
        var btn = el || document.getElementById('reprocess-daylight-all-btn');
        var status = document.getElementById('reprocess-daylight-all-status');
        if (btn) { btn.disabled = true; btn.dataset._label = btn.textContent; btn.textContent = 'Starting…'; }
        if (status) status.textContent = 'Starting daylight queue…';
        fetch('/api/reprocess-daylight-all', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            if (!ok && status) status.textContent = 'Nothing to do.';
            if (ok) {
              updateDaylightQueueStatus();
              if (!window.__dlTimer) window.__dlTimer = setInterval(updateDaylightQueueStatus, 3000);
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed to start queue.'; })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || 'Generate missing daylight videos'; }});
      }
      function updateDaylightQueueStatus(){
        var status = document.getElementById('reprocess-daylight-all-status');
        fetch('/api/reprocess-daylight-status')
          .then(function(r){ return r.json().catch(function(){ return { running:false, completed:0, total:0, remaining:0 }; }); })
          .then(function(s){
            if (!status) return;
            if (!s || !s.running) {
              status.textContent = 'Idle' + (s && s.completed ? (' • Completed: ' + s.completed + '/' + (s.total||s.completed)) : '');
              if (window.__dlTimer) { clearInterval(window.__dlTimer); window.__dlTimer = null; }
              return;
            }
            var cur = s.current ? (' • Now: ' + s.current) : '';
            status.textContent = 'Running • Completed ' + s.completed + ' of ' + s.total + ' • Remaining ' + s.remaining + cur;
          })
          .catch(function(){ if (status) status.textContent = 'Queue status unavailable'; });
      }
    </script>
    <style>
      /* Overlay for in-app video playback */
      #player-overlay[hidden] { display: none !important; }
      #player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: grid; place-items: center; z-index: 9999; }
      .player-wrap { width: min(96vw, 1200px); }
      .player-wrap video { width: 100%; max-height: 80vh; background: #000; display: block; }
      .player-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
    </style>
    <script>
      (function() {
        var KEY = 'home-active-tab';
        var order = ['tab-live','tab-stored','tab-videos','tab-daylight','tab-lightall','tab-full'];
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
    </header>
    <div class="tabs" role="tablist" aria-label="Views">
      <button id="tab-live" role="tab" aria-controls="panel-live" aria-selected="false" class="tab">Live</button>
      <button id="tab-stored" role="tab" aria-controls="panel-stored" aria-selected="true" class="tab">Stored</button>
      <button id="tab-videos" role="tab" aria-controls="panel-videos" aria-selected="false" class="tab">Videos</button>
      <button id="tab-daylight" role="tab" aria-controls="panel-daylight" aria-selected="false" class="tab">Daylight</button>
      <button id="tab-lightall" role="tab" aria-controls="panel-lightall" aria-selected="false" class="tab">Daylight All</button>
      <button id="tab-full" role="tab" aria-controls="panel-full" aria-selected="false" class="tab">Full-time</button>
    </div>
    <div class="tabpanels">
      <section id="panel-live" class="tabpanel" role="tabpanel" aria-labelledby="tab-live" hidden aria-hidden="true">
        ${latestUrl ? `<img src="${latestUrl}" alt="Latest screenshot" />` : '<p>No screenshots yet. First capture will appear soon…</p>'}
      </section>
      <section id="panel-stored" class="tabpanel" role="tabpanel" aria-labelledby="tab-stored" aria-hidden="false">
        <div class="actions"><a href="/" class="button" aria-label="Back to days list">&larr; Back to days</a></div>
        <div class="hint">Snapshots for <strong>${ymd}</strong></div>
        ${imgs.length ? `<div class="thumbs">${grid}</div>` : '<p>No images for this date.</p>'}
      </section>
      <section id="panel-videos" class="tabpanel" role="tabpanel" aria-labelledby="tab-videos" hidden aria-hidden="true">
        <div class="actions"><button id="reprocess-btn" class="btn" onclick="reprocessDay('${ymd}', this)"${imgs.length ? '' : ' disabled'}>Reprocess ${ymd} video</button><span id="reprocess-status" class="meta"></span></div>
        ${vids.length ? `<div class="videos">${videosHtml}</div>` : '<p>No videos yet. They are generated daily.</p>'}
      </section>
      <section id="panel-daylight" class="tabpanel" role="tabpanel" aria-labelledby="tab-daylight" hidden aria-hidden="true">
        <div class="actions">
          <button class="btn" ${daylightVideoExistsForDate(ymd) ? '' : 'disabled'} onclick="${daylightVideoExistsForDate(ymd) ? `openPlayer('/images/videos/${ymd}-daylight.mp4?v=${Date.now()}')` : ''}">Play</button>
          <button class="btn" ${imgs.length ? '' : 'disabled'} onclick="reprocessDaylight('${ymd}', this)">Reprocess daylight</button>
          <span class="meta" id="reprocess-daylight-status"></span>
        </div>
        <p class="hint">Daylight window: ${DAYLIGHT_START_LOCAL}–${DAYLIGHT_END_LOCAL} (${DAYLIGHT_TZ}).</p>
      </section>
      <section id="panel-lightall" class="tabpanel" role="tabpanel" aria-labelledby="tab-lightall" hidden aria-hidden="true">
        <div class="actions"><button class="btn" id="reprocess-daylight-all-btn" aria-label="Generate missing daylight videos" data-tip="Scan all dates and create any missing daylight-only videos using existing images." onclick="reprocessDaylightAll(this)">Generate missing daylight videos</button><span id="reprocess-daylight-all-status" class="meta"></span></div>
        <p class="hint">This runs a sequential queue to avoid overloading the system.</p>
      </section>
      <section id="panel-full" class="tabpanel" role="tabpanel" aria-labelledby="tab-full" hidden aria-hidden="true">
        ${fullUrl ? `<div class=\"full\"><video id=\"full-video\" src=\"${fullUrl}\" controls preload=\"metadata\" playsinline></video><div class=\"player-actions\"><button class=\"btn\" onclick=\"(function(){var v=document.getElementById('full-video'); if (v && v.requestFullscreen) v.requestFullscreen();})();\">Fullscreen</button><button id=\"reprocess-full-btn\" class=\"btn\" aria-label=\"Reprocess full-time video\" data-tip=\"Regenerate the full-time video by concatenating all daily videos in order. Safe to run multiple times.\" onclick=\"reprocessFull(this)\"${vids.length ? '' : ' disabled'}>Reprocess</button><span id=\"reprocess-full-status\" class=\"meta\"></span></div></div>` : `<div class=\"actions\"><button id=\"reprocess-full-btn\" class=\"btn\" aria-label=\"Reprocess full-time video\" data-tip=\"Regenerate the full-time video by concatenating all daily videos in order.\" onclick=\"reprocessFull(this)\"${vids.length ? '' : ' disabled'}>Reprocess full-time video</button><span id=\"reprocess-full-status\" class=\"meta\"></span></div><p>No full-time video yet. It updates daily around 1:00.</p>`}
      </section>
    </div>
    <div id="player-overlay" hidden>
      <div class="player-wrap">
        <video id="player-video" controls playsinline></video>
        <div class="player-actions">
          <button class="btn" onclick="playerFullscreen()">Fullscreen</button>
          <button class="btn" onclick="closePlayer()">Close</button>
        </div>
      </div>
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
