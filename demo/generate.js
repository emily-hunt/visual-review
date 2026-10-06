'use strict';
// Builds demo/visual-snapshots with snapshots in every state so the report UI
// can be explored without a real test run. Run: node demo/generate.js
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, 'visual-snapshots');
process.env.VISUAL_REVIEW_DIR = DIR;
const { checkImage } = require('../src/check');
const { generateReport } = require('../src/report');

function canvas(w, h, bg = [255, 255, 255]) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    png.data[i] = bg[0]; png.data[i + 1] = bg[1]; png.data[i + 2] = bg[2]; png.data[i + 3] = 255;
  }
  return png;
}
function rect(png, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * png.width + x) * 4;
    png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2];
  }
}
function textLines(png, x0, y0, n, color) {
  for (let l = 0; l < n; l++) rect(png, x0, y0 + l * 16, 220 - l * 24, 7, color);
}

function bookingForm() {
  const p = canvas(600, 400);
  rect(p, 0, 0, 600, 56, [15, 40, 90]);            // header bar
  textLines(p, 40, 90, 2, [255, 255, 255]);        // header text
  rect(p, 40, 160, 520, 44, [240, 242, 245]);      // input
  rect(p, 40, 220, 520, 44, [240, 242, 245]);      // input
  rect(p, 40, 300, 200, 48, [22, 120, 70]);        // submit button
  textLines(p, 40, 372, 1, [150, 150, 150]);
  return p;
}

const fs = require('fs');
if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });

// 1. booking-form: golden, then a 1px-taller button (intentional-ish) -> passes within threshold
let golden = bookingForm();
checkImage({ name: 'booking-form', imageBuffer: PNG.sync.write(golden) });
let changed = bookingForm();
rect(changed, 40, 300, 200, 49, [22, 120, 70]);    // button 1px taller
checkImage({ name: 'booking-form', imageBuffer: PNG.sync.write(changed) });

// 2. itinerary-card: a real layout change -> needs-review
golden = canvas(600, 300);
rect(golden, 24, 24, 552, 120, [245, 247, 250]);
textLines(golden, 48, 48, 3, [60, 60, 60]);
rect(golden, 24, 168, 552, 80, [235, 240, 245]);
checkImage({ name: 'itinerary-card', imageBuffer: PNG.sync.write(golden) });
changed = canvas(600, 300);
rect(changed, 24, 24, 552, 150, [245, 247, 250]);   // card grew: new field added
textLines(changed, 48, 48, 4, [60, 60, 60]);
rect(changed, 24, 122, 552, 26, [37, 99, 235]);     // new blue status banner
rect(changed, 24, 198, 552, 80, [235, 240, 245]);
checkImage({ name: 'itinerary-card', imageBuffer: PNG.sync.write(changed) });

// 3. dashboard: big unexpected change -> failed
golden = canvas(600, 400);
rect(golden, 0, 0, 600, 56, [15, 40, 90]);
for (let c = 0; c < 3; c++) rect(golden, 24 + c * 188, 80, 170, 120, [240, 242, 245]);
checkImage({ name: 'dashboard', imageBuffer: PNG.sync.write(golden) });
changed = canvas(600, 400);
rect(changed, 0, 0, 600, 56, [150, 30, 30]);       // header turned red?!
for (let c = 0; c < 3; c++) rect(changed, 24 + c * 188, 80, 170, 120, [240, 242, 245]);
checkImage({ name: 'dashboard', imageBuffer: PNG.sync.write(changed) });

const rep = generateReport(DIR);
console.log(`demo report: ${rep.path}`);
console.log('open it in a browser, or run: npx visual-review serve --dir demo/visual-snapshots');
