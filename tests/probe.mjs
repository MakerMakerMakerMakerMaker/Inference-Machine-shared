/* A real browser, driven, asserting the things that have actually broken.
 *
 *   npm run build                (in ui/; this tests ui/dist)
 *   node tests/probe.mjs
 *
 * Every check here is a bug that shipped. The freeze, the $NaN
 * and the unusable phone layout each cost a play-test and an evening, and each
 * would have been one line of output here.
 *
 * Why Playwright and not `chrome --headless --dump-dom --virtual-time-budget`:
 * that flag advances timers but does NOT run requestAnimationFrame, and this
 * game's whole simulation lives in a rAF loop. Probes built on it measure a
 * dead frame loop while reporting confident results. The boot check asserts
 * the loop is real before anything else runs, so that can never happen again.
 */

import { clear, open, tally } from './harness.mjs';

const { ok, done } = tally();
const { page, errs, goto, close } = await open();

// ---- boot: is this a real browser with a real frame loop? -----------------
console.log('\nboot');
await goto('skipstart=1', 2500);
const f1 = await page.evaluate(() => window.__frames || 0);
await page.waitForTimeout(1500);
const f2 = await page.evaluate(() => window.__frames || 0);
ok('the frame loop runs', f2 - f1 > 30, `${f2 - f1} frames in 1.5s`);
ok('no page errors on boot', errs.length === 0, errs.join(' | '));

// ---- the clock cannot get stuck -----------------------------------------
console.log('\nthe clock');
ok('cleared to a running clock', await clear(page));
const orphan = await page.evaluate(async () => {
  const b = window.__board,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  b.paused = true; // stopped with nothing holding it
  await sleep(800);
  const t0 = b.S.t;
  await sleep(400);
  return { paused: b.paused, moved: b.S.t - t0, healed: window.__healed || 0 };
});
ok(
  'an orphaned pause self-heals',
  !orphan.paused && orphan.moved > 0,
  `healed ${orphan.healed}x, clock +${orphan.moved.toFixed(2)}`,
);

const manual = await page.evaluate(async () => {
  const b = window.__board,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pb = document.getElementById('pauseBtn');
  if (b.paused) {
    pb.click();
    await sleep(300);
  }
  pb.click();
  await sleep(900);
  const held = b.paused;
  const t0 = b.S.t;
  await sleep(400);
  const still = b.S.t - t0;
  pb.click();
  await sleep(400);
  return { held, still, resumed: !b.paused };
});
ok(
  "the player's own PAUSE is not overridden",
  manual.held && manual.still < 0.01,
  `clock +${manual.still.toFixed(2)}`,
);
ok('and RESUME starts it again', manual.resumed);

const pop = await page.evaluate(async () => {
  const b = window.__board,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  b.openBoard();
  await sleep(400);
  const shown = document.getElementById('ovBoard').classList.contains('show');
  const paused = b.paused;
  b.closeBoard();
  await sleep(500);
  return { shown, paused, resumed: !b.paused };
});
ok('a pop-up stops the clock', pop.shown && pop.paused);
ok('and closing it starts the clock', pop.resumed);

const tile = await page.evaluate(async () => {
  const b = window.__board,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t = document.querySelector('#hud .stat');
  t.click();
  await sleep(500);
  const paused = b.paused;
  t.click();
  return { paused };
});
ok('reading a HUD tile does NOT stop the clock', !tile.paused);

// ---- money never becomes NaN --------------------------------------------
console.log('\nthe money');
await goto();
await clear(page);
const nan = await page.evaluate(async () => {
  const b = window.__board,
    S = b.S,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Serving refuses a model that does not fit, so put one there by hand: the
     state a bad save or a future bug would leave. */
  b.rentNow('h2o');
  S.jobs.push({ id: 'big', model: 'kimchi', part: 'h2o', copies: 1 });
  await sleep(900);
  for (let i = 0; i < 40; i++) b.tick(0.25);
  const bad = Object.keys(S).filter((k) => typeof S[k] === 'number' && !isFinite(S[k]));
  return { bad, money: S.money, units: b.sim.unitsToHold('h2o', 'kimchi'), gpus: S.gpus };
});
ok(
  'a model too big for the fleet leaves no NaN',
  nan.bad.length === 0,
  `needs ${nan.units} cards, has ${nan.gpus}; bad fields: ${nan.bad.join(',') || 'none'}`,
);
ok('and capital stays a real number', Number.isFinite(nan.money), `$${Math.round(nan.money)}`);

// ---- the phone layout ----------------------------------------------------
console.log('\nsmall screens');
for (const w of [375, 768, 900, 901, 1280]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const board = await page.evaluate(
    () => (document.getElementById('stage') || {}).offsetHeight || 0,
  );
  ok(`${w}px shows the board`, board > 0, board > 0 ? '' : 'no board');
}
await page.setViewportSize({ width: 1440, height: 900 });

// ---- a soak: play it and see whether it survives --------------------------
console.log('\nsoak (a tireless player, 25s at x60)');
errs.length = 0;
await goto('skipstart=1&t=60', 1500);
const soak = await page.evaluate(async () => {
  const b = window.__board,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => !!(el && !el.hidden && el.getBoundingClientRect().width > 0);
  const offscreen = new Set(),
    held = {};
  let stuckTicks = 0,
    worstStuck = 0,
    nanSeen = null;
  for (let i = 0; i < 165; i++) {
    /* Past the tutorial, through every event card, and the buttons a player
       would press: rent a small fleet (a lease is paid by the hour, so money in the
       bank is no limit) and serve everything rented. */
    const skip = document.getElementById('tutSkip');
    if (vis(skip)) skip.click();
    const card = document.querySelector('#ovEvent.show button');
    if (vis(card)) card.click();
    const rent = document.getElementById('buy');
    if (vis(rent) && !rent.disabled && b.S.gpus < 8) rent.click();
    const per = b.sim.unitsToHold('h2o', 'gigaparrot');
    const free = b.sim.fleetUse().unused.h2o || 0;
    if (free >= per) b.serveAdd('gigaparrot', 'h2o', Math.floor(free / per));

    document.querySelectorAll('.ov.show, #tut:not([hidden])').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight)
        offscreen.add(e.id);
    });
    if (b.paused) held[b.whyPaused] = (held[b.whyPaused] || 0) + 1;
    const bogus = b.paused && !b.whyPaused; // stopped with no reason at all
    stuckTicks = bogus ? stuckTicks + 1 : 0;
    worstStuck = Math.max(worstStuck, stuckTicks);
    if (!nanSeen) {
      const bad = Object.keys(b.S).filter((k) => typeof b.S[k] === 'number' && !isFinite(b.S[k]));
      if (bad.length) nanSeen = bad;
    }
    await sleep(150);
  }
  return {
    sim: +b.S.t.toFixed(0),
    money: Math.round(b.S.money),
    gpus: b.S.gpus,
    events: b.events.filter((e) => e.type === 'month').length,
    worstStuck,
    nanSeen,
    offscreen: [...offscreen],
    drawFailed: b.drawFailed,
    healed: window.__healed || 0,
    held: Object.entries(held)
      .map(([why, n]) => `${why} x${n}`)
      .join(', '),
  };
});
ok(
  'never stopped without a reason',
  soak.worstStuck === 0,
  `worst run of unexplained pause: ${soak.worstStuck} ticks`,
);
ok('no NaN appeared during play', !soak.nanSeen, soak.nanSeen ? soak.nanSeen.join(',') : '');
ok('no draw threw', soak.drawFailed.length === 0, soak.drawFailed.join(','));
ok('no pop-up opened off screen', soak.offscreen.length === 0, soak.offscreen.join(','));
ok(
  'the sim advanced',
  soak.sim > 100,
  `${soak.sim}h of sim time, ${soak.gpus} GPUs, ${soak.events} event choices, $${soak.money}, ` +
    `watchdog fired ${soak.healed}x; held by: ${soak.held || 'nothing'}`,
);
ok('no page errors during play', errs.length === 0, errs.slice(0, 3).join(' | '));

await close();
done();
