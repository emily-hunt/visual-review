'use strict';

const fs = require('fs');
const path = require('path');

/** Turn a snapshot name into a filesystem-safe filename (shared by every adapter). */
function safeName(name) {
  return String(name).trim().replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'snapshot';
}

function snapshotPaths(dir, name) {
  const file = safeName(name) + '.png';
  return {
    name,
    file: safeName(name),
    golden: path.join(dir, 'golden', file),
    actual: path.join(dir, 'actual', file),
    diff: path.join(dir, 'diff', file),
    resultsJson: path.join(dir, 'results.json'),
    reportHtml: path.join(dir, 'report.html'),
  };
}

function ensureDirs(dir) {
  for (const sub of ['golden', 'actual', 'diff']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
}

module.exports = { safeName, snapshotPaths, ensureDirs };
