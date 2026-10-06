'use strict';

const fs = require('fs');
const { checkImage, assertResult } = require('./check');
const { resolveOptions } = require('./config');
const { snapshotPaths } = require('./store');
const path = require('path');

/**
 * Playwright adapter.
 *
 *   const { visualCheck } = require('@qa-solutions/visual-review/playwright');
 *
 *   test('homepage', async ({ page }) => {
 *     await page.goto('https://example.com');
 *     await visualCheck(page, 'homepage');                       // full page
 *     await visualCheck(page.locator('.card'), 'card-component'); // element
 *   });
 *
 * Options (per call, or via VISUAL_* env vars):
 *   screenshot       Playwright screenshot options (clip, mask, fullPage, animations...)
 *   reviewThreshold  diff ratio above which the snapshot needs human review (default 0.02)
 *   failThreshold    diff ratio above which the check hard-fails (default 0.10)
 *   pixelThreshold   per-pixel color tolerance 0..1 (default 0.1)
 *   failOnDiff       false = record-only: never throw, just log (for the Jenkins review flow)
 *   updateBaselines  true  = overwrite goldens instead of comparing
 *   dir              snapshot storage dir (default ./visual-snapshots)
 *
 * Tip: Playwright's own `mask` option is great for clocks/animations:
 *   await visualCheck(page, 'dashboard', { screenshot: { mask: [page.locator('.clock')] } });
 */
async function visualCheck(pageOrLocator, name, options = {}) {
  if (!pageOrLocator || typeof pageOrLocator.screenshot !== 'function') {
    throw new Error('[visual-review] visualCheck expects a Playwright Page or Locator as the first argument.');
  }
  const buffer = await pageOrLocator.screenshot(options.screenshot || {});
  const result = checkImage({ name, imageBuffer: buffer, options });

  attachToTestReport(result, options);

  if (result.status === 'needs-review' || result.status === 'failed') {
    const pct = (result.diffRatio * 100).toFixed(2);
    console.log(`[visual-review] "${name}" ${result.status} — ${pct}% pixels differ. Review: ${snapshotPaths(reportDir(options), name).reportHtml}`);
  }

  assertResult(result, options);
  return result;
}

function reportDir(options) {
  const dir = resolveOptions(options).dir;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

/** Attach actual + diff images to Playwright's HTML report when running under the test runner. */
function attachToTestReport(result, options) {
  let testInfo;
  try {
    // @playwright/test is an optional peer dependency.
    testInfo = require('@playwright/test').test.info();
  } catch {
    return;
  }
  const p = snapshotPaths(reportDir(options), result.name);
  Promise.resolve()
    .then(() => testInfo.attach(`visual:${result.name} [${result.status}] actual`, {
      body: fs.readFileSync(p.actual),
      contentType: 'image/png',
    }))
    .then(() => {
      if ((result.status === 'needs-review' || result.status === 'failed') && fs.existsSync(p.diff)) {
        return testInfo.attach(`visual:${result.name} [${result.status}] diff`, {
          path: p.diff,
          contentType: 'image/png',
        });
      }
    })
    .catch(() => { /* attachments are best-effort */ });
}

module.exports = { visualCheck };
