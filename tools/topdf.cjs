// HTML → A4 PDF with the locally installed Chrome (no Playwright needed).
// Usage: node tools/topdf.js in.html out.pdf
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const [inp, out] = process.argv.slice(2);
if (!inp || !out) {
  console.error('Usage: node tools/topdf.js in.html out.pdf');
  process.exit(1);
}
const chrome = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!chrome) {
  console.error('Chrome not found. Set CHROME=/path/to/chrome or print from the browser (Cmd+P).');
  process.exit(1);
}
execFileSync(
  chrome,
  ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${path.resolve(out)}`, 'file://' + path.resolve(inp)],
  { stdio: 'ignore' },
);
console.log('wrote', out);
