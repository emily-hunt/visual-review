'use strict';

const fs = require('fs');
const path = require('path');
const { readResults } = require('./check');

const STATUS_META = {
  'passed': { label: 'Passed', color: '#16a34a', bg: '#dcfce7' },
  'needs-review': { label: 'Needs review', color: '#b45309', bg: '#fef3c7' },
  'failed': { label: 'Failed', color: '#dc2626', bg: '#fee2e2' },
  'new-baseline': { label: 'New baseline', color: '#2563eb', bg: '#dbeafe' },
  'updated': { label: 'Updated', color: '#2563eb', bg: '#dbeafe' },
  'accepted': { label: 'Accepted', color: '#0d9488', bg: '#ccfbf1' },
  'rejected': { label: 'Rejected', color: '#6b7280', bg: '#f3f4f6' },
  'error': { label: 'Error', color: '#dc2626', bg: '#fee2e2' },
};

/**
 * Generate a self-contained review report (report.html) inside the snapshot dir.
 * Static mode: Accept buttons show the CLI command to copy.
 * Serve mode (npx visual-review serve): buttons POST to the server for one-click accept.
 */
function generateReport(dir, { serveMode = false } = {}) {
  dir = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  fs.mkdirSync(dir, { recursive: true }); // serve/report must work before any test has run
  const results = readResults(dir);
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

  const summaryCards = Object.entries(STATUS_META)
    .filter(([status]) => counts[status])
    .map(([status, meta]) => `
      <button class="pill" data-filter="${status}" style="color:${meta.color};background:${meta.bg}">
        ${meta.label}: ${counts[status]}
      </button>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual review — ${results.length} snapshots</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
  header { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 14px 20px; }
  header h1 { margin: 0 0 8px; font-size: 18px; }
  header h1 small { color: #64748b; font-weight: 400; }
  .pills { display: flex; gap: 8px; flex-wrap: wrap; }
  .pill { border: none; border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer; font-weight: 600; }
  .pill.active { outline: 2px solid #0f172a; }
  main { padding: 20px; display: grid; gap: 16px; max-width: 1100px; margin: 0 auto; }
  .empty { text-align: center; color: #64748b; padding: 60px 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  .card-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
  .card-head h2 { margin: 0; font-size: 15px; font-family: ui-monospace, monospace; }
  .badge { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 10px; }
  .meta { margin-left: auto; font-size: 12px; color: #64748b; display: flex; gap: 12px; align-items: center; }
  .tabs { display: flex; gap: 4px; padding: 10px 16px 0; }
  .tab { border: none; background: none; padding: 8px 12px; font-size: 13px; cursor: pointer; color: #64748b; border-bottom: 2px solid transparent; }
  .tab.active { color: #0f172a; border-bottom-color: #0f172a; font-weight: 600; }
  .view { padding: 16px; display: none; }
  .view.active { display: block; }
  .view img { max-width: 100%; display: block; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
  .sidebyside { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sidebyside figure { margin: 0; }
  .sidebyside figcaption { font-size: 12px; color: #64748b; margin-bottom: 6px; }
  .slider-wrap { position: relative; overflow: hidden; border-radius: 8px; border: 1px solid #e2e8f0; user-select: none; }
  .slider-wrap img { display: block; width: 100%; border: none; border-radius: 0; }
  .slider-top { position: absolute; inset: 0; overflow: hidden; }
  .slider-top img { width: 100%; height: 100%; object-fit: cover; object-position: left top; max-width: none; }
  .slider-handle { position: absolute; top: 0; bottom: 0; width: 2px; background: #0f172a; cursor: ew-resize; }
  .slider-handle::after { content: "◂ ▸"; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); background: #0f172a; color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 999px; white-space: nowrap; }
  .slider-labels { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; justify-content: space-between; pointer-events: none; }
  .slider-labels span { font-size: 11px; font-weight: 700; background: rgba(15,23,42,.75); color: #fff; padding: 2px 8px; border-radius: 999px; }
  .actions { display: flex; gap: 8px; padding: 0 16px 16px; align-items: center; flex-wrap: wrap; }
  .btn { border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn.accept { background: #16a34a; color: #fff; }
  .btn.reject { background: #f1f5f9; color: #0f172a; }
  .btn:disabled { opacity: .5; cursor: default; }
  .cmd { display: none; font-family: ui-monospace, monospace; font-size: 12px; background: #0f172a; color: #e2e8f0; padding: 8px 12px; border-radius: 8px; width: 100%; }
  .cmd.show { display: block; }
  .note { font-size: 12px; color: #64748b; }
</style>
</head>
<body>
<header>
  <h1>Visual review <small>${results.length} snapshot${results.length === 1 ? '' : 's'} · ${new Date().toLocaleString()}</small></h1>
  <div class="pills">
    <button class="pill active" data-filter="all" style="color:#0f172a;background:#e2e8f0">All: ${results.length}</button>
    ${summaryCards}
  </div>
</header>
<main id="cards"></main>
<script>
const RESULTS = ${JSON.stringify(results).replace(/</g, '\\u003c')};
const SERVE_MODE = ${serveMode ? 'true' : 'false'};
const STATUS_META = ${JSON.stringify(STATUS_META)};

const main = document.getElementById('cards');
if (!RESULTS.length) {
  main.innerHTML = '<div class="empty">No snapshots recorded yet. Run your tests first.<br><small>Reading from: ${dir}</small></div>';
}

function badge(status) {
  const m = STATUS_META[status] || STATUS_META.error;
  return '<span class="badge" style="color:' + m.color + ';background:' + m.bg + '">' + m.label + '</span>';
}

function imgTag(kind, r) {
  const src = kind + '/' + r.file + '.png';
  return '<img src="' + src + '" alt="' + kind + '">';
}

RESULTS.forEach((r, i) => {
  const pct = (r.diffRatio * 100).toFixed(2);
  const pctFull = (r.diffRatio * 100).toFixed(4);
  const card = document.createElement('section');
  card.className = 'card';
  card.dataset.status = r.status;
  const hasDiff = r.status === 'needs-review' || r.status === 'failed';
  const thresholdNote = r.thresholds
    ? '<span title="Thresholds applied to this check">review &gt; ' + (r.thresholds.review * 100).toFixed(1) + '%, fail &gt; ' + (r.thresholds.fail * 100).toFixed(1) + '%</span>'
    : '';
  const diffView = hasDiff
    ? '<div class="view" data-view="diff">' + imgTag('diff', r) + '<p class="note">Red pixels differ between golden (left) and actual. ' + r.diffPixels.toLocaleString() + ' of ' + r.totalPixels.toLocaleString() + ' pixels (' + pctFull + '%).</p></div>'
    : '<div class="view" data-view="diff"><p class="note">No diff image — snapshots match within threshold.</p></div>';
  card.innerHTML =
    '<div class="card-head"><h2>' + r.name + '</h2>' + badge(r.status) +
    '<span class="meta"><span title="' + pctFull + '% (' + r.diffPixels.toLocaleString() + ' of ' + r.totalPixels.toLocaleString() + ' pixels)">' + pct + '% differ</span>' + thresholdNote + '<span>' + new Date(r.timestamp).toLocaleString() + '</span></span></div>' +
    '<div class="tabs">' +
      '<button class="tab active" data-tab="slider">Slider</button>' +
      '<button class="tab" data-tab="side">Side by side</button>' +
      '<button class="tab" data-tab="diff">Diff</button>' +
    '</div>' +
    '<div class="view active" data-view="slider"><div class="slider-wrap">' +
      imgTag('actual', r) +
      '<div class="slider-top" style="width:50%">' + imgTag('golden', r) + '</div>' +
      '<div class="slider-handle" style="left:50%"></div>' +
      '<div class="slider-labels"><span>Golden</span><span>Actual</span></div>' +
    '</div><p class="note">Drag the handle to wipe between golden (left) and actual (right).</p></div>' +
    '<div class="view" data-view="side"><div class="sidebyside"><figure><figcaption>Golden (baseline)</figcaption>' + imgTag('golden', r) + '</figure>' +
    '<figure><figcaption>Actual (this run)</figcaption>' + imgTag('actual', r) + '</figure></div></div>' +
    diffView +
    '<div class="actions">' +
      (hasDiff ? '<button class="btn accept">Accept new baseline</button><button class="btn reject">Reject (keep golden)</button>' : '<span class="note">Nothing to accept — this snapshot is ' + r.status.replace('-', ' ') + '.</span>') +
      '<code class="cmd"></code>' +
    '</div>';

  // tabs
  card.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    card.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    card.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    card.querySelector('[data-view="' + t.dataset.tab + '"]').classList.add('active');
  }));

  // slider drag
  const wrap = card.querySelector('.slider-wrap');
  if (wrap) {
    const top = wrap.querySelector('.slider-top');
    const handle = wrap.querySelector('.slider-handle');
    const move = (clientX) => {
      const rect = wrap.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, (clientX - rect.left) / rect.width * 100));
      top.style.width = pct + '%';
      handle.style.left = pct + '%';
    };
    let dragging = false;
    wrap.addEventListener('pointerdown', (e) => { dragging = true; move(e.clientX); });
    window.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX); });
    window.addEventListener('pointerup', () => { dragging = false; });
  }

  // accept / reject
  const acceptBtn = card.querySelector('.btn.accept');
  const rejectBtn = card.querySelector('.btn.reject');
  const cmd = card.querySelector('.cmd');
  if (acceptBtn) acceptBtn.addEventListener('click', async () => {
    if (SERVE_MODE) {
      acceptBtn.disabled = true;
      const res = await fetch('/api/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: r.name }) });
      const data = await res.json();
      acceptBtn.textContent = data.ok ? 'Accepted ✓' : 'Failed';
      if (data.ok) { card.dataset.status = 'accepted'; card.querySelector('.badge').outerHTML = badge('accepted'); }
    } else {
      cmd.textContent = 'npx visual-review accept "' + r.name + '"';
      cmd.classList.add('show');
    }
  });
  if (rejectBtn) rejectBtn.addEventListener('click', async () => {
    if (SERVE_MODE) {
      rejectBtn.disabled = true;
      await fetch('/api/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: r.name }) });
      rejectBtn.textContent = 'Rejected — golden kept';
    } else {
      cmd.textContent = 'npx visual-review reject "' + r.name + '"';
      cmd.classList.add('show');
    }
  });

  main.appendChild(card);
});

// status filter pills
document.querySelectorAll('.pill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  const f = p.dataset.filter;
  document.querySelectorAll('.card').forEach(c => {
    c.style.display = (f === 'all' || c.dataset.status === f) ? '' : 'none';
  });
}));
</script>
</body>
</html>`;

  const outPath = path.join(dir, 'report.html');
  fs.writeFileSync(outPath, html);
  return { path: outPath, count: results.length, results };
}

module.exports = { generateReport };
