/* The leaderboard trusts a score only if the validator, replaying the run's
 * events through the built engine, lands on the same money. So any change to
 * the game's numbers silently invalidates every saved run. This pins them:
 *
 *   npm run build      (in ui/; the replay runs ui/dist/engine.js)
 *   node tests/replay.mjs
 *
 * When a change is meant to move the numbers, update the expected values here
 * and say so in the commit: the leaderboard needs resetting with it.
 */

import { readFileSync } from 'node:fs';
import { loadGame, validate } from '../validate/server.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));

let pass = 0,
  fail = 0;
const ok = (n, c, d = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`);
};

console.log('\nsaved runs replay to the same score');
for (const [name, score] of [
  ['seed7-rd-install.json', 7479.557481936542],
  ['seed4242-full-year.json', 1387.7003341150876],
]) {
  const r = await validate(fixture(name));
  ok(name, r.ok && r.score === score, r.ok ? `${r.score}` : JSON.stringify(r.errors).slice(0, 200));
}

console.log('\nR&D gains are revealed by earned points');
const RD_CHAIN = `(() => {
  restart(99); S.money = 1e9;
  rentNow('h2o'); rentNow('h2o');
  S.rdCount[window.__board.sim.rdBoostKey('gigaparrot', 'h2o')] = 1;
  rdAdd('gigaparrot', 'h2o', 1);
  const first = S.rdJobs[0];
  const hiddenAtLaunch = first && first.points === 0 && first.roll === null;
  rdRemove(first.id);
  rdAdd('gigaparrot', 'h2o', 1);
  const second = S.rdJobs[0];
  const hiddenAfterRecreate = second && second.points === 0 && second.roll === null;
  for (let i = 0; i < 1000 && second.points === 0; i++) {
    tick(0.05); checkRdJobs();
  }
  return [hiddenAtLaunch, hiddenAfterRecreate,
    second.points > 0 && !!second.roll && !!second.roll.chain && second.roll.gain >= 0];
})()`;
const chain = loadGame().window.__board.eval(RD_CHAIN);
ok('launch stores no gain roll', chain[0]);
ok('zero-point recreation stores no gain roll', chain[1]);
ok('the first earned point starts a gain chain', chain[2]);

/* A fixed seed and a fixed fleet, run long, with and without R&D: covers the
   throughput, demand, rent and R&D code the two runs above barely touch. */
console.log('\nthe engine is deterministic');
const FINGERPRINT = `(() => {
  const { capacityTps } = window.__board.sim;
  const r = x => Math.round(x * 100) / 100;
  restart(42); S.money = 1e9;
  for (let i = 0; i < 8; i++) rentNow('h2o');
  for (let i = 0; i < 3; i++) rentNow('h2o');
  serveAdd('gigaparrot', 'h2o', 2); serveAdd('quack', 'h2o', 2); serveAdd('gigaparrot', 'h2o', 1);
  for (let i = 0; i < 30000 && !S.dead; i++) { tick(0.05); checkRdJobs(); checkMonthEvents(); }
  const last = S.samples[S.samples.length - 1];
  const fleet = [r(S.t), r(S.money), r(S.revHr), r(S.costHr), r(S.util), r(capacityTps()),
    [1, 2, 3, 4, 5].map(c => r(last[c])).join('/'), S.samples.length].join(' ');
  const rd = seed => {
    restart(seed); S.money = 1e9;
    for (let i = 0; i < 8; i++) rentNow('h2o');
    serveAdd('gigaparrot', 'h2o', 2); rdAdd('gigaparrot', 'h2o', 4);
    const ms = ['quack', 'deepsniff', 'gigaparrot']; let k = 0;
    for (let i = 0; i < 30000 && !S.dead; i++) {
      tick(0.05); checkRdJobs(); checkMonthEvents();
      const j = S.rdJobs.find(x => x.pending); if (j) rdInstall(j.id);
      if (!S.rdJobs.length) rdAdd(ms[k++ % 3], 'h2o', 4);
    }
    return r(S.money) + ' ' + Math.round(capacityTps() * 1000) / 1000;
  };
  return [fleet, ...[42, 7, 1234].map(rd)];
})()`;
const want = [
  '1456 999922000.3 18.07 71.64 0.25 4658.1 999924997.61/25/71.64/18.07/-65002.38 1401',
  '999958645.58 7112.491',
  '999957141.3 6847.07',
  '999958596.04 7080.542',
];
const got = loadGame().window.__board.eval(FINGERPRINT);
ok('a fixed fleet, run long', got[0] === want[0], got[0]);
for (const [i, seed] of [42, 7, 1234].entries())
  ok(`R&D on, seed ${seed}`, got[i + 1] === want[i + 1], got[i + 1]);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
