#!/usr/bin/env node
'use strict';

const { acceptOne, acceptAll, rejectOne, resolveDir } = require('../src/accept');
const { generateReport } = require('../src/report');
const { serve } = require('../src/serve');

function usage() {
  console.log(`
visual-review — review and accept visual snapshot diffs

  npx visual-review report [--dir <dir>]            regenerate report.html
  npx visual-review serve [--dir <dir>] [--port N]  review UI with one-click accept (default port 4567)
  npx visual-review accept "<name>" [--dir <dir>]   accept one snapshot (actual -> golden)
  npx visual-review accept --all [--dir <dir>]      accept every needs-review / failed snapshot
  npx visual-review reject "<name>" [--dir <dir>]   keep the golden, discard this run's actual
  npx visual-review clean [--dir <dir>]             remove actual/ and diff/ captures (keep goldens)

Snapshot dir defaults to ./visual-snapshots or $VISUAL_REVIEW_DIR.
`.trim());
}

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main() {
  const cmd = process.argv[2];
  const dir = arg('--dir', process.env.VISUAL_REVIEW_DIR || 'visual-snapshots');

  switch (cmd) {
    case 'report': {
      const { path, count } = generateReport(resolveDir(dir));
      console.log(`[visual-review] report written: ${path} (${count} snapshots)`);
      if (count === 0) console.log('[visual-review] no snapshots yet — run your tests first, then re-run report.');
      break;
    }
    case 'serve': {
      serve(dir, parseInt(arg('--port', '4567'), 10));
      break;
    }
    case 'accept': {
      if (process.argv.includes('--all')) {
        const { accepted, skipped } = acceptAll(dir);
        console.log(`[visual-review] accepted ${accepted.length}: ${accepted.join(', ') || '(none)'}`);
        if (skipped.length) console.log(`[visual-review] skipped ${skipped.length}: ${skipped.join(', ')}`);
      } else {
        const name = process.argv[3];
        if (!name) { console.error('usage: visual-review accept "<name>"'); process.exit(1); }
        const res = acceptOne(dir, name);
        console.log(res.ok ? `[visual-review] accepted "${name}"` : `[visual-review] could not accept "${name}": ${res.reason}`);
        if (!res.ok) process.exit(1);
      }
      generateReport(resolveDir(dir));
      break;
    }
    case 'reject': {
      const name = process.argv[3];
      if (!name) { console.error('usage: visual-review reject "<name>"'); process.exit(1); }
      rejectOne(dir, name);
      console.log(`[visual-review] rejected "${name}" (golden kept)`);
      generateReport(resolveDir(dir));
      break;
    }
    case 'clean': {
      const fs = require('fs');
      const path = require('path');
      const d = resolveDir(dir);
      for (const sub of ['actual', 'diff']) {
        const p = path.join(d, sub);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true });
      }
      console.log(`[visual-review] cleaned actual/ and diff/ in ${d} (goldens kept)`);
      break;
    }
    default:
      usage();
      process.exit(cmd ? 1 : 0);
  }
}

main();
