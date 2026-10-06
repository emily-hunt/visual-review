'use strict';

/**
 * Self-test: builds synthetic PNGs and runs the full check -> review -> accept flow.
 * Run: npm test
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, '__vr');
process.env.VISUAL_REVIEW_DIR = DIR;

const { checkImage, assertResult, readResults } = require('../src/check');
const { generateReport } = require('../src/report');
const { acceptOne, acceptAll } = require('../src/accept');
const { visualCheck } = require('../src/playwright');

let failures = 0;
function assert(cond, label) {
  if (cond) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** 400x200 white canvas with a black "widget" rect + gray "text" lines. */
function makeBase() {
  const W = 400, H = 200;
  const png = new PNG({ width: W, height: H });
  const px = (x, y, r, g, b) => {
    const i = (y * W + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, 255, 255, 255);
  const rect = (x0, y0, w, h, r, g, b) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, r, g, b);
  };
  rect(50, 50, 100, 60, 20, 20, 20);          // the "widget"
  for (let l = 0; l < 4; l++) rect(180, 55 + l * 14, 160 - l * 20, 6, 120, 120, 120); // "text" lines
  return PNG.sync.write(png);
}

function shifted(base, dx, dy, growH) {
  const png = PNG.sync.read(base);
  const W = png.width, H = png.height;
  const out = new PNG({ width: W, height: H });
  out.data.set(png.data);
  // move the black widget rect by (dx,dy) and grow it — simulates a 1pt font bump
  const isBlack = (i) => out.data[i] < 40 && out.data[i + 1] < 40 && out.data[i + 2] < 40;
  const coords = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (isBlack(i)) coords.push([x, y]);
  }
  for (const [x, y] of coords) {
    const i = (y * W + x) * 4;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
  }
  for (const [x, y] of coords) {
    const nx = x + dx, ny = y + dy + (y >= 50 && growH ? 1 : 0);
    if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
      const i = (ny * W + nx) * 4;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = 20;
    }
  }
  return PNG.sync.write(out);
}

function withBlock(base, x0, y0, w, h, r, g, b) {
  const png = PNG.sync.read(base);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * png.width + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b;
  }
  return PNG.sync.write(png);
}

function resized(base, w, h) {
  const png = PNG.sync.read(base);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(png.width - 1, Math.floor(x * png.width / w));
    const sy = Math.min(png.height - 1, Math.floor(y * png.height / h));
    const si = (sy * png.width + sx) * 4, di = (y * w + x) * 4;
    out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1];
    out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = 255;
  }
  return PNG.sync.write(out);
}

async function main() {
  if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });

  const base = makeBase();
  console.log('core checkImage flow');

  let r = checkImage({ name: 'tiny-change', imageBuffer: base });
  assert(r.status === 'new-baseline', 'first run creates the golden (new-baseline)');

  r = checkImage({ name: 'tiny-change', imageBuffer: base });
  assert(r.status === 'passed', 'identical rerun passes');

  // ~1px shift of the widget ≈ a 1pt font-size bump: must PASS within default 2% threshold
  const tiny = shifted(base, 1, 0, true);
  r = checkImage({ name: 'tiny-change', imageBuffer: tiny });
  assert(r.status === 'passed', `1px-shift diff passes within threshold (got ${(r.diffRatio * 100).toFixed(2)}%)`);

  // ~5% of pixels changed: needs human review, not a failure
  const medium = withBlock(base, 20, 130, 100, 40, 200, 30, 30);
  checkImage({ name: 'medium-change', imageBuffer: base }); // seed golden
  r = checkImage({ name: 'medium-change', imageBuffer: medium });
  assert(r.status === 'needs-review', `5%-area change -> needs-review (got ${(r.diffRatio * 100).toFixed(2)}%)`);
  assert(fs.existsSync(path.join(DIR, 'diff', 'medium-change.png')), 'diff image written for needs-review');

  // ~30% changed: hard fail
  const huge = withBlock(base, 0, 0, 200, 120, 200, 30, 30);
  checkImage({ name: 'huge-change', imageBuffer: base }); // seed golden
  r = checkImage({ name: 'huge-change', imageBuffer: huge });
  assert(r.status === 'failed', `30%-area change -> failed (got ${(r.diffRatio * 100).toFixed(2)}%)`);

  // dimension mismatch -> failed
  r = checkImage({ name: 'tiny-change', imageBuffer: resized(base, 300, 200) });
  assert(r.status === 'failed' && r.dimensionsMatch === false, 'dimension mismatch fails');

  console.log('strict vs record-only modes');
  const needsReview = checkImage({ name: 'medium-change', imageBuffer: medium });
  let threw = false;
  try { assertResult(needsReview, { failOnDiff: true }); } catch { threw = true; }
  assert(threw, 'strict mode throws on needs-review');
  threw = false;
  try { assertResult(needsReview, { failOnDiff: false }); } catch { threw = true; }
  assert(!threw, 'record-only mode (failOnDiff:false) never throws');

  console.log('updateBaselines mode');
  r = checkImage({ name: 'tiny-change', imageBuffer: huge, options: { updateBaselines: true } });
  assert(r.status === 'updated', 'updateBaselines overwrites the golden');
  r = checkImage({ name: 'tiny-change', imageBuffer: huge });
  assert(r.status === 'passed', 'after update, the same image passes');

  console.log('accept flow');
  checkImage({ name: 'medium-change', imageBuffer: medium }); // ensure it is needs-review again
  const acc = acceptOne(DIR, 'medium-change');
  assert(acc.ok, 'acceptOne promotes actual -> golden');
  assert(!fs.existsSync(path.join(DIR, 'diff', 'medium-change.png')), 'diff cleared after accept');
  r = checkImage({ name: 'medium-change', imageBuffer: medium });
  assert(r.status === 'passed', 'accepted baseline passes on rerun');
  const all = acceptAll(DIR);
  assert(all.accepted.includes('huge-change'), 'accept --all picks up failed snapshots too');

  console.log('Playwright adapter (fake page object)');
  const fakePage = { screenshot: async () => base };
  const pr = await visualCheck(fakePage, 'pw-homepage', { failOnDiff: false });
  assert(pr.status === 'new-baseline' || pr.status === 'passed', 'visualCheck works with any Page/Locator-like');
  const pr2 = await visualCheck(fakePage, 'pw-homepage', { failOnDiff: false });
  assert(pr2.status === 'passed', 'visualCheck rerun passes');

  console.log('report generation');
  const rep = generateReport(DIR);
  assert(fs.existsSync(rep.path), 'report.html written');
  const html = fs.readFileSync(rep.path, 'utf8');
  assert(html.includes('tiny-change') && html.includes('Slider'), 'report contains snapshot cards and slider UI');
  assert(readResults(DIR).length >= 4, 'results.json accumulates entries');

  console.log(failures === 0 ? '\nALL SELF-TESTS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
