/* What every check here shares: the built board (ui/dist) on a throwaway local
 * server, a real Chromium driven by Playwright, the page's errors, and a tally.
 *
 * Playwright's own Chromium is used unless CHROME_PATH names another one.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = resolve(fileURLToPath(new URL('../ui/dist', import.meta.url)));

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function serve(root) {
  const s = createServer(async (rq, rs) => {
    try {
      const p = join(root, decodeURIComponent(rq.url.split('?')[0]));
      const body = await readFile(p);
      rs.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
      rs.end(body);
    } catch {
      if (!rs.headersSent) rs.writeHead(404);
      rs.end('not found');
    }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({ s, port: s.address().port })));
}

/* The board at `query`. `errs` collects page errors and console errors; a
   request to another origin failing (the leaderboard server, not running here)
   is not one. */
export async function open({ width = 1440, height = 900 } = {}) {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error(`no build at ${DIST}: run \`npm run build\` in ui/ first`);
    process.exit(2);
  }
  const { s, port } = await serve(DIST);
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = m.location().url || '';
    if (/^Failed to load resource/.test(m.text()) && !from.startsWith(base)) return;
    errs.push('console: ' + m.text().slice(0, 160));
  });
  const goto = async (query = 'skipstart=1', settle = 2000) => {
    await page.goto(`${base}/index.html?${query}`);
    await page.waitForTimeout(settle);
  };
  const close = async () => {
    await browser.close();
    s.close();
  };
  return { page, errs, goto, close };
}

export function tally() {
  let pass = 0,
    fail = 0;
  const ok = (n, c, d = '') => {
    c ? pass++ : fail++;
    console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`);
  };
  const done = () => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  };
  return { ok, done };
}

/* A run with the tutorial gone and nothing on screen, the clock running. */
export const clear = (page) =>
  page.evaluate(async () => {
    const b = window.__board,
      sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 30; i++) {
      if (b.tutorial) b.tutEnd();
      b.closeBoard();
      if (b.S.eventOpen) document.querySelector('#ovEvent.show button')?.click();
      await sleep(120);
      if (!b.paused) return true;
    }
    return !b.paused;
  });
