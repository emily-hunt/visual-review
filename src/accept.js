'use strict';

const fs = require('fs');
const path = require('path');
const { snapshotPaths } = require('./store');
const { readResults, recordResult } = require('./check');

function resolveDir(dir) {
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir || 'visual-snapshots');
}

/** Accept one snapshot: promote actual -> golden, clear the diff, mark accepted. */
function acceptOne(dir, name) {
  dir = resolveDir(dir);
  const p = snapshotPaths(dir, name);
  if (!fs.existsSync(p.actual)) {
    return { ok: false, name, reason: 'no actual screenshot found' };
  }
  fs.copyFileSync(p.actual, p.golden);
  if (fs.existsSync(p.diff)) fs.unlinkSync(p.diff);
  const results = readResults(dir);
  const existing = results.find((r) => r.name === name);
  recordResult(dir, {
    ...(existing || { name, file: p.file, diffPixels: 0, totalPixels: 0, diffRatio: 0, dimensionsMatch: true }),
    status: 'accepted',
    timestamp: new Date().toISOString(),
  });
  return { ok: true, name };
}

/** Accept every snapshot currently in `statuses` (default: needs-review + failed). */
function acceptAll(dir, statuses = ['needs-review', 'failed']) {
  dir = resolveDir(dir);
  const accepted = [];
  const skipped = [];
  for (const r of readResults(dir)) {
    if (statuses.includes(r.status)) {
      const res = acceptOne(dir, r.name);
      (res.ok ? accepted : skipped).push(r.name);
    }
  }
  return { accepted, skipped };
}

/** Reject = keep the golden, drop the actual/diff so the next run re-captures. */
function rejectOne(dir, name) {
  dir = resolveDir(dir);
  const p = snapshotPaths(dir, name);
  for (const f of [p.actual, p.diff]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const results = readResults(dir);
  const existing = results.find((r) => r.name === name);
  if (existing) recordResult(dir, { ...existing, status: 'rejected', timestamp: new Date().toISOString() });
  return { ok: true, name };
}

module.exports = { acceptOne, acceptAll, rejectOne, resolveDir };
