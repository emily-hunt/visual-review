'use strict';

const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

/**
 * Compare two PNG buffers.
 * Returns { dimensionsMatch, diffPixels, totalPixels, diffPngBuffer }.
 * pixelmatch's default includeAA:false ignores antialiased edges, which is
 * exactly what makes "font went up 1pt" diffs survivable.
 */
function compareBuffers(goldenBuffer, actualBuffer, { pixelThreshold = 0.1 } = {}) {
  const golden = PNG.sync.read(goldenBuffer);
  const actual = PNG.sync.read(actualBuffer);

  if (golden.width !== actual.width || golden.height !== actual.height) {
    return {
      dimensionsMatch: false,
      diffPixels: -1,
      totalPixels: golden.width * golden.height,
      diffPngBuffer: null,
      goldenSize: { width: golden.width, height: golden.height },
      actualSize: { width: actual.width, height: actual.height },
    };
  }

  const { width, height } = golden;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(golden.data, actual.data, diff.data, width, height, {
    threshold: pixelThreshold,
  });

  return {
    dimensionsMatch: true,
    diffPixels,
    totalPixels: width * height,
    diffPngBuffer: PNG.sync.write(diff),
  };
}

module.exports = { compareBuffers };
