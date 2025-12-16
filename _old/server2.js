// continutation of servrer1.js

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
      .meta { color: var(--muted); font-size: 0.9em; margin: 6px 0; overflow-wrap: anywhere; }
      .summary { display: grid; grid-template-columns: 1fr; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: rgba(255,255,255,0.45); }
      [data-theme=\"dark\"] .summary { background: rgba(0,0,0,0.2); }
      .summary .line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .summary .line br { flex-basis: 100%; }
      .summary img { width: 320px; max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 6px; }
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
      /* Overlay for in-app video playback (and progress modal) */
      #player-overlay[hidden], #modal-overlay[hidden] { display: none !important; }
      #player-overlay, #modal-overlay { position: fixed; inset: 0; display: grid; place-items: center; z-index: 20000; }
      #player-overlay { background: rgba(0,0,0,0.85); }
      #modal-overlay { background: rgba(0,0,0,0.6); z-index: 21000; }
      .player-wrap { width: min(96vw, 1200px); }
      .player-wrap video { width: 100%; max-height: 80vh; background: #000; display: block; }
      .player-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
      .modal { width: min(92vw, 420px); background: var(--bg); color: var(--fg); border: 1px solid var(--button-border); border-radius: 10px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
      .modal-body { display: flex; align-items: center; gap: 12px; }
      .modal-text { line-height: 1.4; }
      .modal-actions { margin-top: 12px; display: flex; justify-content: flex-end; }
      .spinner { width: 20px; height: 20px; border-radius: 999px; border: 3px solid var(--border); border-top-color: var(--accent); animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
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
      #player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: grid; place-items: center; z-index: 20000; }
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
      // Lightweight progress modal helpers
      (function(){
        function byId(id){ return document.getElementById(id); }
        window.openModal = function(text){
          var ov = byId('modal-overlay');
          var t = byId('modal-text');
          if (t) t.textContent = text || 'Working…';
          if (ov) ov.hidden = false;
        };
        window.setModalText = function(text){
          var t = byId('modal-text');
          if (t) t.textContent = text || '';
        };
        window.closeModal = function(){
          var ov = byId('modal-overlay');
          if (ov) ov.hidden = true;
        };
      })();
    </script>
    <script>
      // Lightweight progress modal helpers
      (function(){
        function byId(id){ return document.getElementById(id); }
        window.openModal = function(text){
          var ov = byId('modal-overlay');
          var t = byId('modal-text');
          if (t) t.textContent = text || 'Working…';
          if (ov) ov.hidden = false;
        };
        window.setModalText = function(text){
          var t = byId('modal-text');
          if (t) t.textContent = text || '';
        };
        window.closeModal = function(){
          var ov = byId('modal-overlay');
          if (ov) ov.hidden = true;
        };
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
      // Lightweight progress modal helpers
      (function(){
        function byId(id){ return document.getElementById(id); }
        window.openModal = function(text){
          var ov = byId('modal-overlay');
          var t = byId('modal-text');
          if (t) t.textContent = text || 'Working…';
          if (ov) ov.hidden = false;
        };
        window.setModalText = function(text){
          var t = byId('modal-text');
          if (t) t.textContent = text || '';
        };
        window.closeModal = function(){
          var ov = byId('modal-overlay');
          if (ov) ov.hidden = true;
        };
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
        try { openModal('Reprocessing ' + ymd + ' (24h)…'); } catch(_){}
        if (el) { el.disabled = true; }
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            setStatus(msg);
            try { setModalText(msg); } catch(_){}
            var row = el && el.closest ? el.closest('.day-row') : null;
            if (ok && row) setRowPlayEnabled(row, '24', ymd);
            if (ok) { try { closeModal(); } catch(_){} openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now()); }
          })
          .catch(function(){ setStatus('Failed.'); try { setModalText('Failed.'); } catch(_){} })
          .finally(function(){ if (el) el.disabled = false; });
      }
      function reprocessDaylight(ymd, el){
        setStatus('Reprocessing daylight ' + ymd + '…');
        try { openModal('Reprocessing daylight ' + ymd + '…'); } catch(_){}
        if (el) { el.disabled = true; }
        fetch('/api/reprocess-daylight/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            setStatus(msg);
            try { setModalText(msg); } catch(_){}
            var row = el && el.closest ? el.closest('.day-row') : null;
            if (ok && row) setRowPlayEnabled(row, 'day', ymd);
            if (ok) { try { closeModal(); } catch(_){} openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now()); }
          })
          .catch(function(){ setStatus('Failed.'); try { setModalText('Failed.'); } catch(_){} })
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
      <div class="line"><strong>Current image</strong><br />${latestUrl ? `<img src="${latestUrl}" alt="Latest" />` : 'none yet'}</div>
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
    <div id="modal-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="modal-text">
      <div class="modal">
        <div class="modal-body">
          <div class="spinner" aria-hidden="true"></div>
          <div class="modal-text" id="modal-text" aria-live="polite">Working…</div>
        </div>
        <div class="modal-actions">
          <button id="modal-close-btn" class="btn" onclick="closeModal()">Close</button>
        </div>
    </div>
    </div>
    <div id="modal-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="modal-text">
      <div class="modal">
        <div class="modal-body">
          <div class="spinner" aria-hidden="true"></div>
          <div class="modal-text" id="modal-text" aria-live="polite">Working…</div>
        </div>
        <div class="modal-actions">
          <button id="modal-close-btn" class="btn" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>
  </body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // Ensure browsers don't cache the HTML (and inline CSS)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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
      .meta { color: var(--muted); font-size: 0.9em; margin: 8px 0; overflow-wrap: anywhere; }
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
        try { openModal('Reprocessing ' + ymd + '…'); } catch(_){}
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Reprocessing…'; }
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (status) status.textContent = msg;
            try { setModalText(msg); } catch(_){}
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
              try { closeModal(); } catch(_){}
              openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; try { setModalText('Failed.'); } catch(_){} })
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
        try { openModal('Reprocessing daylight ' + ymd + '…'); } catch(_){}
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Reprocessing…'; }
        fetch('/api/reprocess-daylight/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (status) status.textContent = msg;
            try { setModalText(msg); } catch(_){}
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
              try { closeModal(); } catch(_){}
              openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; try { setModalText('Failed.'); } catch(_){} })
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
        try { openModal('Reprocessing full-time video…'); } catch(_){}
        fetch('/api/reprocess-full', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? 'Full-time video updated.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (status) status.textContent = msg;
            try { setModalText(msg); } catch(_){}
            if (ok) {
              var v = document.getElementById('full-video');
              if (v) {
                var src = (v.getAttribute('src') || '').split('?')[0];
                v.setAttribute('src', src + '?v=' + Date.now());
                try { v.load(); } catch(_){}
              } else {
                try { location.reload(); } catch(_){}
              }
              try { closeModal(); } catch(_){}
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; try { setModalText('Failed.'); } catch(_){} })
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
        try { openModal('Reprocessing full-time video…'); } catch(_){}
        fetch('/api/reprocess-full', { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? 'Full-time video updated.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (status) status.textContent = msg;
            try { setModalText(msg); } catch(_){}
            if (ok) {
              var v = document.getElementById('full-video');
              if (v) {
                var src = (v.getAttribute('src') || '').split('?')[0];
                v.setAttribute('src', src + '?v=' + Date.now());
                try { v.load(); } catch(_){}
              } else {
                try { location.reload(); } catch(_){}
              }
              try { closeModal(); } catch(_){}
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; try { setModalText('Failed.'); } catch(_){} })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || 'Reprocess'; }});
      }
    </script>
    <style>
      /* Overlay for in-app video playback */
      #player-overlay[hidden] { display: none !important; }
      #player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: grid; place-items: center; z-index: 20000; }
      .player-wrap { width: min(96vw, 1200px); }
      .player-wrap video { width: 100%; max-height: 80vh; background: #000; display: block; }
      .player-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
      /* Lightweight progress modal */
      #modal-overlay[hidden] { display: none !important; }
      #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 21000; }
      .modal { width: min(92vw, 420px); background: var(--bg); color: var(--fg); border: 1px solid var(--button-border); border-radius: 10px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
      .modal-body { display: flex; align-items: center; gap: 12px; }
      .modal-text { line-height: 1.4; }
      .modal-actions { margin-top: 12px; display: flex; justify-content: flex-end; }
      .spinner { width: 20px; height: 20px; border-radius: 999px; border: 3px solid var(--border); border-top-color: var(--accent); animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      /* Prevent status text clipping */
      .meta { overflow-wrap: anywhere; }
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
    <div id="modal-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="modal-text">
      <div class="modal">
        <div class="modal-body">
          <div class="spinner" aria-hidden="true"></div>
          <div class="modal-text" id="modal-text" aria-live="polite">Working…</div>
        </div>
        <div class="modal-actions">
          <button id="modal-close-btn" class="btn" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Ensure browsers don't cache the HTML (and inline CSS)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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
      .actions { margin: 8px 0 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .actions .meta { flex-basis: 100%; }
      .btn { appearance: none; border: 1px solid var(--button-border); background: var(--button-bg); color: var(--button-fg); padding: 6px 10px; border-radius: 4px; cursor: pointer; }
      .btn[disabled] { opacity: 0.6; cursor: progress; }
      /* Overlay for in-app video playback (and progress modal) */
      #player-overlay[hidden], #modal-overlay[hidden] { display: none !important; }
      #player-overlay, #modal-overlay { position: fixed; inset: 0; display: grid; place-items: center; z-index: 20000; }
      #player-overlay { background: rgba(0,0,0,0.85); }
      #modal-overlay { background: rgba(0,0,0,0.6); z-index: 21000; }
      .player-wrap { width: min(96vw, 1200px); }
      .player-wrap video { width: 100%; max-height: 80vh; background: #000; display: block; }
      .player-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
      .modal { width: min(92vw, 420px); background: var(--bg); color: var(--fg); border: 1px solid var(--button-border); border-radius: 10px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
      .modal-body { display: flex; align-items: center; gap: 12px; }
      .modal-text { line-height: 1.4; }
      .modal-actions { margin-top: 12px; display: flex; justify-content: flex-end; }
      .spinner { width: 20px; height: 20px; border-radius: 999px; border: 3px solid var(--border); border-top-color: var(--accent); animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
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
        try { openModal('Reprocessing ' + ymd + '…'); } catch(_){}
        fetch('/api/reprocess/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? 'Done.' : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (status) status.textContent = msg;
            try { setModalText(msg); } catch(_){}
            if (ok) {
              // Open freshly generated video in in-app player
              try { closeModal(); } catch(_){}
              openPlayer('/images/videos/' + ymd + '.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; try { setModalText('Failed.'); } catch(_){} })
          .finally(function(){ if (btn) { btn.disabled = false; btn.textContent = btn.dataset._label || btn.textContent; }});
      }
    </script>
    <script>
      // Daylight reprocess helpers (missing in day view previously)
      function reprocessDaylight(ymd, el){
        var status = document.getElementById('reprocess-daylight-status');
        if (status) status.textContent = 'Reprocessing daylight ' + ymd + '…';
        try { openModal('Reprocessing daylight ' + ymd + '…'); } catch(_){}
        if (el) { el.disabled = true; el.dataset._label = el.textContent; el.textContent = 'Reprocessing…'; }
        fetch('/api/reprocess-daylight/' + encodeURIComponent(ymd), { method: 'POST' })
          .then(function(r){ return r.json().catch(function(){ return { success:false, error:'Bad JSON' }; }); })
          .then(function(data){
            var ok = !!(data && data.success);
            var msg = ok ? ('Done: ' + ymd) : ('Failed' + (data && data.error ? ': ' + data.error : ''));
            if (status) status.textContent = msg;
            try { setModalText(msg); } catch(_){}
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
              try { closeModal(); } catch(_){}
              openPlayer('/images/videos/' + ymd + '-daylight.mp4?v=' + Date.now());
            }
          })
          .catch(function(){ if (status) status.textContent = 'Failed.'; try { setModalText('Failed.'); } catch(_){} })
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
      #player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: grid; place-items: center; z-index: 20000; }
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
  // Ensure browsers don't cache the HTML (and inline CSS)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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
