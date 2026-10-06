'use strict';

const fs = require('fs');
const { resolveOptions } = require('./config');
const { snapshotPaths, ensureDirs } = require('./store');
const { compareBuffers } = require('./compare');

/**
 * Core check: compare a PNG buffer against the stored golden for `name`.
 *
 * Flow:
 *   - no golden yet        -> save actual as golden, status 'new-baseline'
 *   - updateBaselines mode -> overwrite golden, status 'updated'
 *   - diff ratio <= reviewThreshold -> 'passed'
 *   - diff ratio <= failThreshold   -> 'needs-review' (record, don't throw)
 *   - otherwise / dimension mismatch -> 'failed'
 *
 * Never throws for missing goldens or diffs; throwing is the adapters' job
 * (see assertResult) so each framework can decide strict vs record-only.
 */
function checkImage({ name, imageBuffer, options = {} }) {
  const opts = resolveOptions(options);
  const dir = pathResolve(opts.dir);
  ensureDirs(dir);
  const p = snapshotPaths(dir, name);

  fs.writeFileSync(p.actual, imageBuffer);

  let result;
  const hadGolden = fs.existsSync(p.golden);
  if (!hadGolden || opts.updateBaselines) {
    fs.copyFileSync(p.actual, p.golden);
    result = {
      ...baseResult(name, p, hadGolden ? 'updated' : 'new-baseline'),
      thresholds: { review: opts.reviewThreshold, fail: opts.failThreshold },
    };
  } else {
    const goldenBuffer = fs.readFileSync(p.golden);
    const cmp = compareBuffers(goldenBuffer, imageBuffer, { pixelThreshold: opts.pixelThreshold });
    const ratio = cmp.dimensionsMatch ? cmp.diffPixels / cmp.totalPixels : 1;

    let status;
    if (!cmp.dimensionsMatch) status = 'failed';
    else if (ratio <= opts.reviewThreshold) status = 'passed';
    else if (ratio <= opts.failThreshold) status = 'needs-review';
    else status = 'failed';

    if (cmp.diffPngBuffer && (status === 'needs-review' || status === 'failed')) {
      fs.writeFileSync(p.diff, cmp.diffPngBuffer);
    } else if (fs.existsSync(p.diff)) {
      fs.unlinkSync(p.diff); // stale diff from a previous run
    }

    result = {
      ...baseResult(name, p, status),
      diffPixels: cmp.diffPixels,
      totalPixels: cmp.totalPixels,
      diffRatio: ratio,
      dimensionsMatch: cmp.dimensionsMatch,
      goldenSize: cmp.goldenSize || null,
      actualSize: cmp.actualSize || null,
      thresholds: { review: opts.reviewThreshold, fail: opts.failThreshold },
    };
  }

  recordResult(dir, result);
  return result;
}

function baseResult(name, p, status) {
  return {
    name,
    file: p.file,
    status,
    diffPixels: 0,
    totalPixels: 0,
    diffRatio: 0,
    dimensionsMatch: true,
    timestamp: new Date().toISOString(),
  };
}

/** Append (or replace-by-name) the result in results.json. */
function recordResult(dir, result) {
  const resultsPath = snapshotPaths(dir, result.name).resultsJson;
  let results = [];
  try {
    results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    if (!Array.isArray(results)) results = [];
  } catch { /* first run */ }
  const idx = results.findIndex((r) => r.name === result.name);
  if (idx >= 0) results[idx] = result;
  else results.push(result);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
}

function readResults(dir) {
  try {
    const results = JSON.parse(fs.readFileSync(snapshotPaths(pathResolve(dir), '__x').resultsJson, 'utf8'));
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

/**
 * Decide whether a result should throw. Adapters call this after checkImage.
 * In record-only mode (failOnDiff: false) nothing ever throws — Jenkins marks
 * the stage UNSTABLE and humans review the HTML report instead.
 */
function assertResult(result, options = {}) {
  const opts = resolveOptions(options);
  if (result.status === 'passed' || result.status === 'new-baseline' || result.status === 'updated') return;
  if (!opts.failOnDiff) return;
  const pct = (result.diffRatio * 100).toFixed(2);
  const emoji = result.status === 'failed' ? '🔴' : '🟡';
  const sizeNote =
    result.dimensionsMatch === false && result.goldenSize && result.actualSize
      ? ` Dimensions differ (golden ${result.goldenSize.width}x${result.goldenSize.height}, actual ${result.actualSize.width}x${result.actualSize.height}).`
      : '';
  throw new Error(
    `[visual-review] ${emoji} "${result.name}" ${result.status}: ${pct}% of pixels differ ` +
    `(review above ${(opts.reviewThreshold * 100).toFixed(1)}%, fail above ${(opts.failThreshold * 100).toFixed(1)}%).${sizeNote} ` +
    `See diff: ${snapshotPaths(pathResolve(opts.dir), result.name).diff}`
  );
}

function pathResolve(dir) {
  const path = require('path');
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

module.exports = { checkImage, assertResult, readResults, recordResult };
