const { test } = require('@playwright/test');
const { visualCheck } = require('@qa-solutions/visual-review/playwright');

// Example: drop this into your Playwright project and run
//   npx playwright test examples/playwright-visual.spec.js
//
// First run creates the goldens (status: new-baseline, doesn't fail).
// Change something small in the page and re-run to see needs-review.
// Then: npx visual-review serve   -> accept in the browser.

test('example.com homepage', async ({ page }) => {
  await page.goto('https://example.com');
  // Mask anything dynamic; disable animations for stability.
  await visualCheck(page, 'example-homepage', {
    screenshot: { animations: 'disabled' },
    reviewThreshold: 0.02,
    failThreshold: 0.10,
    // failOnDiff: false, // uncomment for record-only CI mode
  });
});

test('example.com heading only', async ({ page }) => {
  await page.goto('https://example.com');
  await visualCheck(page.locator('h1'), 'example-heading');
});
