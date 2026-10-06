'use strict';

/**
 * Cypress support-file side.
 *
 *   // cypress/support/e2e.js
 *   require('@qa-solutions/visual-review/cypress');
 *
 *   // in a spec
 *   cy.visualCheck('booking-form');
 *   cy.get('.card').visualCheck('card-component'); // element screenshot via prevSubject
 */

const { safeName } = require('./store');

function addVisualCheckCommand() {
  // Safe to require from a Node context (e.g. cypress/plugins/index.js by
  // mistake): registration is a no-op there instead of throwing.
  if (typeof Cypress === 'undefined') return;
  Cypress.Commands.add('visualCheck', { prevSubject: 'optional' }, (subject, name, options = {}) => {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('[visual-review] cy.visualCheck(name) requires a snapshot name.');
    }
    const file = `__vr__/${safeName(name)}`;
    const take = subject ? cy.wrap(subject).screenshot(file, options.screenshot) : cy.screenshot(file, options.screenshot);
    return take.then(() => cy.task('vr:check', { name, options }, { timeout: 60000 })).then((result) => {
      if (!result) throw new Error('[visual-review] vr:check task returned nothing — is registerVisualReviewPlugin wired up?');
      if (result.status === 'needs-review' || result.status === 'failed') {
        const pct = (result.diffRatio * 100).toFixed(4);
        const px = `${Number(result.diffPixels || 0).toLocaleString('en-US')}/${Number(result.totalPixels || 0).toLocaleString('en-US')} px`;
        Cypress.log({ name: 'visualCheck', message: `"${name}" ${result.status} - ${pct}% differ (${px})` });
      }
      if (result.__throw) throw new Error(result.__throw);
      return result;
    });
  });
}

if (typeof Cypress !== 'undefined') addVisualCheckCommand();

module.exports = { addVisualCheckCommand };
