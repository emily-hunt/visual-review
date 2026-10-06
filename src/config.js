'use strict';

/**
 * Shared config resolution. Precedence: per-call options > env vars > defaults.
 *
 * Env vars:
 *   VISUAL_REVIEW_DIR          snapshot storage dir (default: ./visual-snapshots)
 *   VISUAL_REVIEW_THRESHOLD    diff ratio above which a snapshot "needs review" (default: 0.02)
 *   VISUAL_FAIL_THRESHOLD      diff ratio above which a snapshot hard-fails (default: 0.10)
 *   VISUAL_PIXEL_THRESHOLD     per-pixel color tolerance 0..1, ignores antialiasing noise (default: 0.1)
 *   VISUAL_FAIL_ON_DIFF        "false" = record-only mode, never throw (for CI review flow)
 *   VISUAL_UPDATE_BASELINES    "true"  = overwrite goldens with actuals instead of comparing
 */

function num(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveOptions(overrides = {}) {
  const env = process.env;
  const failOnDiffRaw = overrides.failOnDiff !== undefined ? overrides.failOnDiff : env.VISUAL_FAIL_ON_DIFF;
  return {
    dir: overrides.dir || env.VISUAL_REVIEW_DIR || 'visual-snapshots',
    reviewThreshold: num(overrides.reviewThreshold !== undefined ? overrides.reviewThreshold : env.VISUAL_REVIEW_THRESHOLD, 0.02),
    failThreshold: num(overrides.failThreshold !== undefined ? overrides.failThreshold : env.VISUAL_FAIL_THRESHOLD, 0.10),
    pixelThreshold: num(overrides.pixelThreshold !== undefined ? overrides.pixelThreshold : env.VISUAL_PIXEL_THRESHOLD, 0.1),
    failOnDiff: !(failOnDiffRaw === false || String(failOnDiffRaw).toLowerCase() === 'false'),
    updateBaselines: (overrides.updateBaselines !== undefined ? overrides.updateBaselines : env.VISUAL_UPDATE_BASELINES) === true ||
      String(overrides.updateBaselines !== undefined ? overrides.updateBaselines : env.VISUAL_UPDATE_BASELINES).toLowerCase() === 'true',
  };
}

module.exports = { resolveOptions };
