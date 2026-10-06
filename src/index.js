'use strict';

/**
 * Package root.
 *
 * config/store are pure and safe to load anywhere, so they're exported
 * eagerly. The Node-only modules (check, accept, report, serve, playwright)
 * are loaded lazily: requiring the root from a browser bundle (e.g. a Cypress
 * support file by mistake) no longer drags in pngjs and dies with a cryptic
 * `util.inherits is not a function`. The require succeeds; only calling a
 * Node-only function from the browser would fail, with the real error.
 */
module.exports = {
  ...require('./config'),
  ...require('./store'),
};

const lazy = (path, names) => {
  const descriptors = {};
  for (const name of names) {
    descriptors[name] = {
      enumerable: true,
      get() {
        return require(path)[name];
      },
    };
  }
  return descriptors;
};

Object.defineProperties(
  module.exports,
  Object.assign(
    {},
    lazy('./check', ['checkImage', 'assertResult', 'readResults', 'recordResult']),
    lazy('./accept', ['acceptOne', 'acceptAll', 'rejectOne', 'resolveDir']),
    lazy('./report', ['generateReport']),
    lazy('./serve', ['serve']),
    lazy('./playwright', ['visualCheck'])
  )
);
