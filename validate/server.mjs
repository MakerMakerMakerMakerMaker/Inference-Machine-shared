/* Replay an events document through the game's own functions and return the score.
   Drawing is off: the script runs headless, with no page and no jsdom.
   The dollar amount in the file is not the score. Each action is handed to the
   game's own function, and it counts only if that function records the same
   event back. A rent of 999999 that the game turns into 1 does not validate.

   node server.mjs events.json     one file; exit 0 only when it validates
   node server.mjs --score         events JSON on stdin; replay to the score clock; no board write
   node server.mjs                 HTTP on $PORT, local board kept in memory
                                   GET  /leaderboard   the current top 10
                                   POST /leaderboard   events JSON; replay, then keep it if it places
                                   POST /events        a game's start or end, an event-card choice, a mute press or a blog click, kept in memory
                                   POST /              the same check, without writing the board
                                   GET  /health
   The live leaderboard is a separate service that calls this file with --score.

   The page is the Vite build. Replay runs engine.js, the same classic
   script the page injects: $BOARD_JS, public/engine.js, or ui/dist/engine.js.
*/

import vm from 'node:vm';
import { existsSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HARD_BANNED = new Set([
  'ASS',
  'CUM',
  'FAG',
  'FCK',
  'FUC',
  'FUK',
  'FUQ',
  'JIZ',
  'JZZ',
  'KKK',
  'KYS',
  'NIG',
  'PNS',
  'PRN',
  'SEX',
  'SHT',
  'TIT',
  'VAG',
  'YOU',
]);
const MAX_EVENTS = 20000;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_ERRORS = 8;
const here = dirname(fileURLToPath(import.meta.url));

const VERSION_RE = /(?:const|let|var) GAME_VERSION\s*=\s*"([0-9a-f]{12})"/;

function engineSource() {
  const file = [
    process.env.BOARD_JS,
    join(here, 'public', 'engine.js'),
    join(here, '..', 'ui', 'dist', 'engine.js'),
  ].find((p) => p && existsSync(p));
  if (!file) throw new Error('the built game has no engine to replay');
  return readFileSync(file, 'utf8');
}

function gameVersion() {
  try {
    const match = engineSource().match(VERSION_RE);
    return match ? match[1] : '';
  } catch (err) {
    return '';
  }
}

let game = null;
/* A stand-in element. The recheck never reads layout; it only has to let the
   script bind its click handlers without a page. */
function stubEl() {
  const el = {
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {
        return false;
      },
      contains() {
        return false;
      },
    },
    dataset: {},
    children: [],
    childNodes: [],
    hidden: false,
    textContent: '',
    innerHTML: '',
    innerText: '',
    value: '0',
    className: '',
    id: '',
    tagName: 'DIV',
    disabled: false,
    title: '',
    offsetWidth: 0,
    clientWidth: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    scrollTop: 0,
  };
  const self = new Proxy(el, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return undefined;
      return stubEl();
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
  el.appendChild = () => self;
  el.removeChild = () => self;
  el.insertBefore = () => self;
  el.append = () => {};
  el.remove = () => {};
  el.setAttribute = () => {};
  el.getAttribute = () => '';
  el.hasAttribute = () => false;
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.querySelector = () => stubEl();
  el.querySelectorAll = () => [];
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });
  el.getScreenCTM = () => null;
  el.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
  el.getCTM = () => null;
  el.closest = () => self;
  el.focus = () => {};
  el.click = () => {};
  el.getContext = () => new Proxy(() => {}, { get: () => () => {}, apply: () => ({}) });
  return self;
}

function stubDocument() {
  const byId = new Map();
  const el = (id) => {
    const key = String(id);
    let found = byId.get(key);
    if (!found) {
      found = stubEl();
      byId.set(key, found);
    }
    return found;
  };
  return {
    getElementById: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => stubEl(),
    createElementNS: () => stubEl(),
    createTextNode: () => stubEl(),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    body: stubEl(),
    documentElement: stubEl(),
    head: stubEl(),
    activeElement: null,
  };
}

function loadGame() {
  if (game) return game;
  const g = {
    __HEADLESS: true,
    console,
    location: {
      hostname: '127.0.0.1',
      search: '?skipstart=1',
      href: 'http://127.0.0.1/?skipstart=1',
      protocol: 'http:',
    },
    navigator: { userAgent: 'headless' },
    innerWidth: 1600,
    innerHeight: 1000,
    devicePixelRatio: 1,
    document: stubDocument(),
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    MutationObserver: class MutationObserver {
      constructor() {}
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    close() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    getComputedStyle: () => ({
      getPropertyValue() {
        return '';
      },
    }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    performance,
    queueMicrotask,
    structuredClone,
    Intl,
  };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(engineSource(), g, { filename: 'engine.js' });
  if (!g.__board) {
    throw new Error('the built game did not start');
  }
  game = { window: g, timers: new Set() };
  return game;
}

function clearTimers() {
  const { window, timers } = game;
  for (const id of timers) {
    window.clearTimeout(id);
    window.clearInterval(id);
  }
  timers.clear();
}

function shown(v) {
  const sign = v < 0 ? '-' : '';
  v = Math.abs(v);
  const body =
    v >= 1e4 ? Math.round(v).toLocaleString('en-US') : v >= 100 ? v.toFixed(0) : v.toFixed(2);
  return sign + '$' + body;
}

function numClose(a, b) {
  return (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= 1e-6
  );
}

function sameValue(a, b) {
  if (a === b) return true;
  return numClose(a, b);
}

function sameEvent(got, want) {
  const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
  for (const k of keys) if (!sameValue(got[k], want[k])) return false;
  return true;
}

function applyEvent(e) {
  const b = game.window.__board;
  const S = b.S;
  const doc = game.window.document;
  switch (e.type) {
    case 'serve':
      if (e.op === 'add') b.serveAdd(e.model, e.part, e.copies);
      else if (e.op === 'set') b.serveSetCopies(e.id, e.copies);
      else if (e.op === 'rm') b.serveRemove(e.id);
      else throw new Error('unknown serve op');
      return;
    case 'rent':
      b.rentNow(e.part);
      return;
    case 'rd':
      if (e.op === 'add') b.rdAdd(e.model, e.part, e.gpus);
      else if (e.op === 'set') b.rdSetGpus(e.id, e.gpus);
      else if (e.op === 'rm') b.rdRemove(e.id);
      else if (e.op === 'term') b.rdTerminate(e.id);
      else if (e.op === 'install') b.rdInstall(e.id);
      else throw new Error('unknown rd op');
      return;
    case 'month':
      if (e.pick !== 0 && e.pick !== 1) throw new Error('unknown month choice');
      b.pickEvent(e.pick);
      return;
    case 'retry':
      throw new Error('a retry is not a score');
    default:
      throw new Error('unknown event type');
  }
}

/* One replay at a time: the page is a single copy of the game. */
let chain = Promise.resolve();
function validate(doc) {
  const run = chain.then(() => validateSync(doc));
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

const VERIFY = "Couldn't verify your submission. Try again later";
function fail(errors) {
  return { ok: false, errors };
}
function conceal(result) {
  if (result && result.ok) return result;
  console.error('score rejected', JSON.stringify((result && result.errors) || result));
  return { ok: false, errors: [{ message: VERIFY }] };
}

function validateSync(doc, opts = {}) {
  loadGame();
  clearTimers();
  const errors = [];
  const push = (tick, type, message) => {
    if (errors.length < MAX_ERRORS) errors.push({ tick, type, message });
  };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc))
    return fail([{ message: 'body must be an events document' }]);
  if (typeof doc.name === 'string' && HARD_BANNED.has(doc.name.trim().toUpperCase())) {
    return fail([{ message: 'name is not allowed' }]);
  }
  const { window } = game;
  const seed = doc.seed;
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff)
    return fail([{ message: 'seed must be an integer from 1 to 4294967295' }]);
  const tickCap = window.__board.scoreTick;
  if (!Number.isInteger(doc.tick) || doc.tick < 0 || doc.tick > tickCap) {
    push(null, null, 'tick must be an integer from 0 to ' + tickCap);
    return { ok: false, seed, errors };
  }
  if (!Array.isArray(doc.events))
    return fail([{ message: 'events must be an array' }].concat(errors));
  if (doc.events.length > MAX_EVENTS) {
    push(null, null, 'too many events');
    return { ok: false, seed, errors };
  }
  for (let i = 0; i < doc.events.length; i++) {
    const e = doc.events[i];
    if (!e || typeof e !== 'object' || typeof e.type !== 'string' || !Number.isInteger(e.tick)) {
      push(null, null, 'event ' + i + ' needs a type and an integer tick');
      return { ok: false, seed, errors };
    }
    if (i && e.tick < doc.events[i - 1].tick) {
      push(e.tick, e.type, 'events must be in tick order');
      return { ok: false, seed, errors };
    }
    if (e.tick > doc.tick) {
      push(e.tick, e.type, 'event is after the document tick');
      return { ok: false, seed, errors };
    }
  }

  const b = window.__board;
  b.restart(seed);
  b.paused = true;
  const S = b.S;
  const start = window.__board.eventsDocument().start;
  if (doc.start && typeof doc.start === 'object') {
    for (const k of ['seed', 'capital', 'gpus', 'model', 'price']) {
      if (!sameValue(doc.start[k], start[k]))
        push(0, 'start', 'start.' + k + ' is ' + doc.start[k] + ', the game starts at ' + start[k]);
    }
  }

  /* The leaderboard clock is the game's own SCORE_TICK. A longer log is cut
     there: later events are not played, and a shorter log is run on to the
     clock with no further actions. */
  const limit = opts.horizon == null ? doc.tick : opts.horizon;
  let death = null;
  let ei = 0;
  const events = doc.events;
  const playAt = (tick) => {
    while (ei < events.length && events[ei].tick === tick) {
      const e = events[ei++];
      const before = b.events.length;
      try {
        applyEvent(e);
      } catch (err) {
        push(e.tick, e.type, String((err && err.message) || err));
        continue;
      }
      const got = b.events.slice(before);
      if (got.length !== 1 || !sameEvent(got[0], e)) {
        push(e.tick, e.type, 'game recorded ' + JSON.stringify(got) + ' for ' + JSON.stringify(e));
      }
    }
  };
  playAt(0);
  for (let n = 0; n < limit; n++) {
    b.tick(0.05);
    b.checkRdJobs();
    b.checkMonthEvents();
    const tick = Math.round(S.t * 20);
    if (S.dead && !death) death = { tick, money: S.money };
    playAt(tick);
  }
  while (ei < events.length && events[ei].tick > limit) ei++;
  if (ei < events.length) push(events[ei].tick, events[ei].type, 'event was never reached');
  if (!opts.horizon && death && death.tick < doc.tick)
    push(
      death.tick,
      'dead',
      'the run ended at tick ' + death.tick + '; the document says ' + doc.tick,
    );

  const score = death ? death.money : S.money;
  const at = death ? death.tick : limit;
  if (doc.money != null && !numClose(Number(doc.money), score)) {
    process.stderr.write('score mismatch claimed ' + doc.money + ', replay is ' + score + '\n');
    push(at, 'money', 'claimed ' + doc.money + ', replay is ' + score);
  }
  clearTimers();
  return {
    ok: errors.length === 0,
    score,
    shown: shown(score),
    tick: at,
    dead: !!death,
    seed,
    gpus: S.gpus,
    errors,
  };
}

let boardRows = [];
const playEvents = [];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scoreTick() {
  loadGame();
  const t = game.window.__board.scoreTick;
  if (!Number.isInteger(t) || t <= 0) throw new Error('the game has no score clock');
  return t;
}

function boardRow(name, score) {
  return { name, score };
}

function readBoard() {
  return boardRows.map((r) => boardRow(r.name, r.score));
}

function writeBoard(rows) {
  boardRows = rows.map((r) => boardRow(r.name, r.score));
}

function nameError(name) {
  if (typeof name !== 'string' || !/^[A-Za-z]{3}$/.test(name.trim()))
    return 'name must be 3 letters';
  if (HARD_BANNED.has(name.trim().toUpperCase())) return 'name is not allowed';
  return null;
}

/* A score places by strictly beating the last row. One name, one row: a
   higher score replaces that name and moves it up. Anything that does not
   beat the name's own best is dropped. */
function placeScore(rows, name, score) {
  const next = rows.map((r) => boardRow(r.name, r.score));
  const mine = next.filter((r) => r.name === name);
  const held = mine.reduce((best, r) => Math.max(best, r.score), -Infinity);
  if (mine.length && !(score > held)) return { rows: next, updated: false };
  const others = next.filter((r) => r.name !== name).sort((a, b) => b.score - a.score);
  const worst = others[others.length - 1];
  if (others.length >= 10 && !(score > worst.score)) return { rows: next, updated: false };
  others.push(boardRow(name, score));
  others.sort((a, b) => b.score - a.score);
  if (others.length > 10) others.length = 10;
  const kept = others.some((r) => r.name === name && r.score === score);
  return { rows: others, updated: kept };
}

function submitSync(doc) {
  const why = nameError(doc && doc.name);
  if (why) return fail([{ message: why }]);
  const name = doc.name.trim().toUpperCase();
  const horizon = scoreTick();
  const result = validateSync({ ...doc, name }, { horizon });
  if (!result.ok) return conceal(result);
  const board = readBoard();
  const placed = placeScore(board, name, result.score);
  if (placed.updated) writeBoard(placed.rows);
  const place = placed.rows.findIndex((r) => r.name === name && r.score === result.score);
  return {
    ok: true,
    name,
    score: result.score,
    shown: result.shown,
    tick: result.tick,
    dead: result.dead,
    updated: placed.updated,
    place: place < 0 ? null : place + 1,
    leaderboard: placed.rows,
    errors: [],
  };
}

function submit(doc) {
  const run = chain.then(() => submitSync(doc));
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

/* The live leaderboard service keeps the board. This only replays. */
function scoreSync(doc) {
  const why = nameError(doc && doc.name);
  if (why) return fail([{ message: why }]);
  const name = doc.name.trim().toUpperCase();
  const result = validateSync({ ...doc, name }, { horizon: scoreTick() });
  if (!result.ok) return conceal(result);
  return {
    ok: true,
    name,
    score: result.score,
    shown: result.shown,
    tick: result.tick,
    dead: result.dead,
    errors: [],
  };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'access-control-allow-origin': '*',
  });
  res.end(json);
}

function listen() {
  const port = Number(process.env.PORT) || 8080;
  loadGame();
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        send(res, 200, { ok: true, version: gameVersion() });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/leaderboard') {
        send(res, 200, { ok: true, version: gameVersion(), tick: scoreTick(), rows: readBoard() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/events') {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (err) {
          send(res, err.status || 400, { ok: false, errors: [{ message: 'not JSON' }] });
          return;
        }
        const uuidOf = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);
        const record = {
          type: body && body.type,
          run: uuidOf(body && body.run),
          player: uuidOf(body && body.player),
          version: body && typeof body.version === 'string' ? body.version.slice(0, 64) : null,
          time: new Date().toISOString(),
        };
        if (record.type === 'start') {
          if (!record.run) {
            send(res, 400, { ok: false, errors: [{ message: 'a start needs a run' }] });
            return;
          }
        } else if (record.type === 'end') {
          const score = Number(body.score);
          const outcome = body.outcome;
          if (!Number.isFinite(score) || (outcome !== 'year_end' && outcome !== 'bankrupt')) {
            send(res, 400, { ok: false, errors: [{ message: 'an end needs an outcome and a score' }] });
            return;
          }
          const placed = outcome === 'year_end' ? placeScore(readBoard(), '', score) : { updated: false };
          const at = placed.updated ? placed.rows.findIndex((r) => r.name === '' && r.score === score) : -1;
          Object.assign(record, {
            outcome,
            score,
            place: at < 0 ? null : at + 1,
            month: Number.isInteger(body.month) ? body.month : null,
            active_seconds: Number.isFinite(body.active_seconds) ? body.active_seconds : null,
          });
        } else if (record.type === 'mute') {
          if (typeof body.muted !== 'boolean') {
            send(res, 400, { ok: false, errors: [{ message: 'a mute needs muted' }] });
            return;
          }
          Object.assign(record, {
            muted: body.muted,
            month: Number.isInteger(body.month) ? body.month : null,
          });
        } else if (record.type === 'choice') {
          if (!Number.isInteger(body.event) || !Number.isInteger(body.choice)) {
            send(res, 400, { ok: false, errors: [{ message: 'a choice needs an event and a choice' }] });
            return;
          }
          Object.assign(record, {
            event: body.event,
            choice: body.choice,
            label: typeof body.label === 'string' ? body.label.slice(0, 64) : null,
            month: Number.isInteger(body.month) ? body.month : null,
          });
        } else if (record.type === 'blog') {
          if (!['blog', 'about', 'elise'].includes(body.link)) {
            send(res, 400, { ok: false, errors: [{ message: 'a blog click needs a link' }] });
            return;
          }
          Object.assign(record, {
            link: body.link,
            month: Number.isInteger(body.month) ? body.month : null,
          });
        } else {
          send(res, 400, {
            ok: false,
            errors: [{ message: 'type must be start, end, mute, choice or blog' }],
          });
          return;
        }
        playEvents.push(record);
        send(res, 200, { ok: true });
        return;
      }
      if (
        req.method === 'POST' &&
        (url.pathname === '/' || url.pathname === '/validate' || url.pathname === '/leaderboard')
      ) {
        let doc;
        try {
          doc = JSON.parse(await readBody(req));
        } catch (err) {
          send(res, err.status || 400, {
            ok: false,
            errors: [{ message: err.status === 413 ? 'body too large' : 'not JSON' }],
          });
          return;
        }
        const saving = url.pathname === '/leaderboard';
        const result = saving ? await submit(doc) : conceal(await validate(doc));
        send(res, result.ok ? 200 : 400, result);
        return;
      }
      send(res, 405, {
        ok: false,
        errors: [{ message: 'GET /leaderboard, or POST /leaderboard with the events JSON' }],
      });
    } catch (err) {
      send(res, 500, { ok: false, errors: [{ message: String((err && err.message) || err) }] });
    }
  });
  server.listen(port, () => console.log('listening on ' + port));
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const file = process.argv[2];
  if (!file) listen();
  else if (file === '--score') {
    const result = scoreSync(JSON.parse(readFileSync(0, 'utf8')));
    console.log(JSON.stringify(result));
    if (game) game.window.close();
    process.exit(result.ok ? 0 : 1);
  } else {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const result = await validate(doc);
    console.log(JSON.stringify(result, null, 2));
    game.window.close();
    process.exit(result.ok ? 0 : 1);
  }
}

export { loadGame, readBoard, scoreSync, submit, validate };
