'use strict';

const fs = require('fs');
const path = require('path');
const { checkImage, assertResult, readResults } = require('./check');
const { safeName, snapshotPaths } = require('./store');

/**
 * Cypress Node-side plugin. Wire it up in cypress.config.js:
 *
 *   const { registerVisualReviewPlugin } = require('@qa-solutions/visual-review/cypress-plugin');
 *   module.exports = defineConfig({
 *     e2e: {
 *       setupNodeEvents(on, config) {
 *         registerVisualReviewPlugin(on, config);
 *       },
 *     },
 *   });
 *
 * The browser side takes the screenshot with cy.screenshot('__vr__/<name>');
 * this task finds that file, runs the comparison, and returns the result.
 * Throwing crosses the task boundary badly in Cypress, so strict-mode
 * failures are returned as { __throw: message } and re-thrown in the spec.
 */
function registerVisualReviewPlugin(on, config) {
  let currentSpecName = 'unknown-spec';
  // Anchor the snapshot dir on the project root, not process.cwd(): the
  // plugin Node process's cwd isn't guaranteed to be the project root,
  // which would strand results.json where `serve` never looks.
  const projectRoot = (config && config.projectRoot) || process.cwd();

  function resolveSnapDir(options = {}) {
    const raw = options.dir || process.env.VISUAL_REVIEW_DIR || 'visual-snapshots';
    return path.isAbsolute(raw) ? raw : path.join(projectRoot, raw);
  }

  // Recursive fallback: find __vr__/<file> under the screenshots folder.
  // Protects against spec-folder naming differences across Cypress versions.
  function findScreenshot(fileName) {
    const root = (config && config.screenshotsFolder) || path.join(projectRoot, 'cypress', 'screenshots');
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (!e.isDirectory()) continue;
        if (e.name === '__vr__') {
          const candidate = path.join(full, fileName);
          if (fs.existsSync(candidate)) return candidate;
        }
        stack.push(full);
      }
    }
    return null;
  }

  on('before:spec', (spec) => {
    currentSpecName = path.basename(spec.name, path.extname(spec.name));
  });

  // One clear terminal line per flagged snapshot, so a green-but-flagged CI
  // run explains itself in the log without opening the HTML report.
  function logVerdict(result, snapOptions) {
    if (result.status !== 'needs-review' && result.status !== 'failed') return;
    const pct = (result.diffRatio * 100).toFixed(2);
    const px = `${Number(result.diffPixels || 0).toLocaleString('en-US')}/${Number(result.totalPixels || 0).toLocaleString('en-US')}`;
    const emoji = result.status === 'failed' ? '🔴' : '🟡';
    const label = result.status === 'failed' ? 'FAILED' : 'needs review';
    const diff = snapshotPaths(snapOptions.dir, result.name).diff;
    console.log(`[visual-review] ${emoji} "${result.name}" ${label} — ${pct}% differ (${px} px)`);
    console.log(`[visual-review] ${emoji} ↳ diff: ${diff}`);
  }

  // Run-end summary: the full list of snapshots that need human eyes.
  on('after:run', () => {
    const results = readResults(resolveSnapDir({}));
    const flagged = results.filter((r) => r.status === 'needs-review' || r.status === 'failed');
    if (!flagged.length) return;
    const failed = flagged.filter((r) => r.status === 'failed').length;
    const emoji = failed ? '🔴' : '🟡';
    const noun = flagged.length === 1 ? 'snapshot' : 'snapshots';
    const verb = flagged.length === 1 ? 'needs' : 'need';
    console.log(`[visual-review] ${emoji} ${flagged.length} ${noun} ${verb} review${failed ? ` (${failed} failed)` : ''} — run \`npx visual-review serve\` to compare and accept/reject.`);
  });

  on('task', {
    'vr:check'({ name, options = {} }) {
      const screenshotsFolder = (config && config.screenshotsFolder) || path.join(projectRoot, 'cypress', 'screenshots');
      const fileName = `${safeName(name)}.png`;
      let shotPath = path.join(screenshotsFolder, currentSpecName, '__vr__', fileName);
      if (!fs.existsSync(shotPath)) {
        shotPath = findScreenshot(fileName); // fallback before giving up
      }
      if (!shotPath || !fs.existsSync(shotPath)) {
        return { name, status: 'error', diffRatio: 0, __throw: `[visual-review] screenshot not found: ${fileName} (looked under ${screenshotsFolder})` };
      }
      const snapOptions = { ...options, dir: resolveSnapDir(options) };
      const result = checkImage({ name, imageBuffer: fs.readFileSync(shotPath), options: snapOptions });
      logVerdict(result, snapOptions);
      try {
        assertResult(result, snapOptions);
      } catch (err) {
        result.__throw = err.message;
      }
      return result;
    },
  });
}

module.exports = { registerVisualReviewPlugin };
