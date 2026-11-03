/* ===== simulation: the economics and physics of the machine =====
   A module of the engine bundle (vite/board.ts); game.ts reads its exports.
   Everything here computes numbers; nothing here draws.
   __board.sim reaches any of it from the console. ===== */
import { acctDay, monthHours, SCORE_HOURS, YEAR_HOURS } from "./clock";
import {
  DEMAND_HEADROOM,
  FLEET_CAP,
  FLEET_ORDER,
  FLEET_UNLOCK,
  GPUS,
  KV_HEADROOM,
  LATEST_NODE_GPUS,
  LATEST_PARTS,
  MARKET_SCALE,
  MINE_ID,
  MINE_USD_HR,
  MODEL_ORDER,
  MODELS,
  NODE_GPUS,
  OR_MARKET_TPS,
  RD_BETA_A,
  RD_CEILING,
  RD_CEILING_AMB,
  RD_GAIN_ALPHA,
  RD_POINT_DAYS,
  RD_POINT_NEED,
  RD_SYNERGY_ALPHA,
  RD_SYNERGY_P,
  RD_TPS,
  SHARE_CAP,
  SHARE_MIN,
  TPS_PER_GPU,
  UNITS_SET,
  type Fleet,
  type FleetPart,
} from "./constants";
import { gpuRevHr } from "./pricing";
import { S, type RdJob, type ServeJob } from "./state";
import { clamp } from "./util";
/* One seed for every draw that moves money: which month event fires and
   which improvement R&D finds and how long it takes. The same seed and the
   same decisions
   replay the same run. The map's animation keeps its own Math.random, so a
   frame of sparks cannot move the score. Each new game draws its own seed and
   the trajectory carries it; SIM_SEED is only the headless default.

   The generator itself is 32-bit integer arithmetic (mulberry32). Math.imul and
   the unsigned shifts are defined exactly by the language, so the stream is the
   same number in every browser. What is not is the browser's Math.log, Math.exp
   and Math.pow: they are allowed to differ by an ulp, and an ulp in an R&D wait
   or a market share changes the money and then which later draws get consumed.
   simLog, simExp and simPow below are built from + - * / only, which IEEE-754
   requires to be correctly rounded, so a replay lands on the same state in
   Chrome, Firefox and Safari. Anything that moves money uses them. */
export const SIM_SEED = 20260923;
let rngState = SIM_SEED >>> 0;
export function resetRng(seed?: number | null) {
  rngState = (seed == null ? SIM_SEED : seed) >>> 0;
  if (!rngState) rngState = 1;
}
export function simRandom() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* 2^n for an integer n, by successive doubling from 1. Every power of two in
   range is an exact double, and doubling is exact, so the table does not depend
   on Math.pow. */
const SIM_P2_HI = new Float64Array(1024),
  SIM_P2_LO = new Float64Array(1075);
SIM_P2_HI[0] = 1;
for (let i = 1; i <= 1023; i++) SIM_P2_HI[i] = SIM_P2_HI[i - 1] * 2;
SIM_P2_LO[0] = 1;
for (let i = 1; i <= 1074; i++) SIM_P2_LO[i] = SIM_P2_LO[i - 1] * 0.5;
function simPow2(n: number) {
  n |= 0;
  if (n > 1023) return Infinity;
  if (n >= 0) return SIM_P2_HI[n];
  if (n < -1074) return 0;
  return SIM_P2_LO[-n];
}
function simIlog2(x: number) {
  if (x >= 1) {
    let lo = 0,
      hi = 1023;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (SIM_P2_HI[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  let lo = 1,
    hi = 1074;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (SIM_P2_LO[mid] <= x) hi = mid;
    else lo = mid + 1;
  }
  return -lo;
}
function simLog(x: number) {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = simIlog2(x),
    m = x / simPow2(e);
  if (m >= Math.SQRT2) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1),
    s2 = s * s;
  let y = 0;
  for (let k = 12; k >= 0; k--) y = 1 / (2 * k + 1) + y * s2;
  return 2 * s * y + e * Math.LN2;
}
/* e^x as 2^k e^r with |r| <= ln2/2; ln2 is split so k ln2 subtracts exactly. */
const SIM_LN2_HI = 0.69314718036912381649,
  SIM_LN2_LO = 1.90821492927058770002e-10;
function simExp(x: number) {
  if (x !== x) return NaN;
  if (x > 709.8) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.round(x / Math.LN2);
  const r = x - k * SIM_LN2_HI - k * SIM_LN2_LO;
  let y = 1;
  for (let n = 20; n >= 1; n--) y = 1 + (y * r) / n;
  return k > 1023 ? y * simPow2(1023) * simPow2(k - 1023) : y * simPow2(k);
}
/* x^p for x >= 0: repeated multiplication for an integer p, else e^(p ln x). */
function simPow(x: number, p: number) {
  if (Number.isInteger(p) && p >= 0) {
    let y = 1;
    for (let i = 0; i < p; i++) y *= x;
    return y;
  }
  return x > 0 ? simExp(p * simLog(x)) : 0;
}
function tableRevPerGpu(model: string, gpu: string, elise = true) {
  const row = RD_TPS[model];
  const cell = row && row[fleetPart(gpu)];
  if (!cell || !(cell > 0)) return null;
  const mul = (elise ? rdBoostMul(model, gpu) : 1) * throughputMul(model, gpu);
  return gpuRevHr(model, cell * mul);
}
/* List revenue an hour of a full deployment. Only pairings with an RD_TPS cell
   can be deployed (modelOnPart), so every serving job has one. */
export function jobListRevHr(job: ServeJob | null | undefined, elise = true) {
  if (!job || isMine(job.model)) return 0;
  const per = tableRevPerGpu(job.model, job.part, elise);
  return per == null ? 0 : per * jobGpus(job);
}
/* Tokens/s this deployment can accept. elise false is the same GPUs with
   the R&D speedups left off, which is what the hardware earned before them. */
export function jobOfferToks(job: ServeJob | null | undefined, elise = true) {
  if (!job || isMine(job.model)) return 0;
  const cap = elise ? jobTps(job) : jobTpsBare(job);
  return cap > 0 ? cap : 0;
}
/* Utilization of one model-on-one-GPU-type deployment.
   Customers arrive for a model, not for a chip. Each GPU type serving that
   model is offered an equal slice of those customers. A type that is already
   full keeps what it can serve, and the rest spills to types that still have
   room, in proportion to the room. More copies of a type that is not full
   only lower that type's utilization: the other deployments keep their slice. */
export function jobFills(elise = true) {
  const fills = new Map<ServeJob, number>();
  if (gpuDown()) return fills;
  const byModel: Record<
    string,
    { job: ServeJob; offer: number; got: number; room: number }[]
  > = {};
  ensureJobs().forEach(j => {
    if (isMine(j.model)) return;
    const offer = jobOfferToks(j, elise);
    if (!(offer > 0)) return;
    let rows = byModel[j.model];
    if (!rows) byModel[j.model] = rows = [];
    rows.push({ job: j, offer, got: 0, room: 0 });
  });
  for (const model in byModel) {
    const rows = byModel[model];
    const n = rows.length;
    let left = demandOnYouToks(model);
    if (!(left > 0)) continue;
    const claim = left / n;
    for (let i = 0; i < n; i++) {
      const take = Math.min(rows[i].offer, claim);
      rows[i].got = take;
      left -= take;
    }
    if (left > 1e-9) {
      let room = 0;
      for (let i = 0; i < n; i++) {
        rows[i].room = Math.max(0, rows[i].offer - rows[i].got);
        room += rows[i].room;
      }
      if (room > 0) {
        const spill = Math.min(left, room);
        for (let i = 0; i < n; i++) {
          if (rows[i].room > 0) rows[i].got += spill * (rows[i].room / room);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      fills.set(r.job, clamp(r.got / r.offer, 0, 1));
    }
  }
  return fills;
}
function inferFill() {
  if (gpuDown()) return 0;
  const fills = jobFills(true);
  let g = 0,
    u = 0;
  ensureJobs().forEach(j => {
    if (isMine(j.model)) return;
    const n = jobGpus(j);
    if (!(n > 0)) return;
    g += n;
    u += n * (fills.get(j) || 0);
  });
  if (!(g > 0)) return 0;
  return clamp(u / g, 0, 1);
}
export function gpuUtil() {
  if (gpuDown()) return 0;
  const use = fleetUse();
  let rented = 0,
    rd = 0;
  for (const k of FLEET_ORDER) {
    rented += use.rented[k] || 0;
    rd += use.rd[k] || 0;
  }
  if (!(rented > 0)) return 0;
  let serve = 0,
    mine = 0;
  ensureJobs().forEach(j => {
    const n = jobGpus(j);
    if (isMine(j.model)) mine += n;
    else serve += n;
  });
  /* Serving jobs count by how full they are. Mining and Elise count as full.
     Idle GPUs count as empty, so spare capacity pulls the fleet average down. */
  return clamp((serve * inferFill() + mine + rd) / rented, 0, 1);
}
export function inferRevHr() {
  const fills = jobFills(true);
  let r = 0;
  ensureJobs().forEach(j => {
    r += jobListRevHr(j) * (fills.get(j) || 0);
  });
  return r;
}
/* Same deployments and the same demand, with Elise's installed speedups left
   off. Spare capacity earns the same either way; a full fleet earns less. */
export function inferRevHrBare() {
  const fills = jobFills(false);
  let r = 0;
  ensureJobs().forEach(j => {
    r += jobListRevHr(j, false) * (fills.get(j) || 0);
  });
  return r;
}
/* ---------------- tuning the balance ----------------
   Since every constant here is an example, any of them can be changed for
   balance. The ones that shape the game most:

     tierUnits: GPUs 33-128 at 10% off, 129-512 at 20%, past 512 at 30%
                                                           the volume discount schedule
     OR_MARKET_TPS × MARKET_SCALE                          the whole market

   The numbers themselves live in constants.ts. */

export function emptyFleet(): Fleet {
  return { h2o: 0, a2d: 0, a3d: 0, b2o: 0 };
}
function isFleetPart(k: unknown): k is FleetPart {
  return (FLEET_ORDER as readonly unknown[]).indexOf(k) >= 0;
}
/* Any GPU key, normalised to one of the four rented types. */
export function fleetPart(k: unknown): FleetPart {
  return isFleetPart(k) ? k : "h2o";
}
function fleetTotal(f: Fleet) {
  return FLEET_ORDER.reduce((a, k) => a + (f[k] || 0), 0);
}
export function syncFleetGpus() {
  S.gpus = fleetTotal(S.fleet);
  return S.gpus;
}
export function ensureFleet() {
  if (!S) return emptyFleet();
  if (!S.fleet) S.fleet = emptyFleet();
  for (const k of FLEET_ORDER) {
    if (!Number.isFinite(S.fleet[k]) || S.fleet[k] < 0) S.fleet[k] = 0;
  }
  syncFleetGpus();
  return S.fleet;
}
export function addToFleet(k: string, n: number) {
  ensureFleet();
  const p = fleetPart(k);
  S.fleet[p] = Math.min(FLEET_CAP, (S.fleet[p] || 0) + n);
  if (S.fleet[p] < 0) S.fleet[p] = 0;
  return syncFleetGpus();
}
export function partUnlocked(k: string) {
  return (S.gpus || 0) >= (FLEET_UNLOCK[fleetPart(k)] || 0);
}
function withFleetDelta<T>(k: string, n: number, fn: () => T): T {
  ensureFleet();
  const p = fleetPart(k);
  S.fleet[p] = (S.fleet[p] || 0) + n;
  if (S.fleet[p] < 0) S.fleet[p] = 0;
  syncFleetGpus();
  try {
    return fn();
  } finally {
    S.fleet[p] = (S.fleet[p] || 0) - n;
    if (S.fleet[p] < 0) S.fleet[p] = 0;
    syncFleetGpus();
  }
}
export function ensureJobs(): ServeJob[] {
  if (!S) return [];
  if (!Array.isArray(S.jobs)) S.jobs = [];
  return S.jobs;
}
export function jobGpus(job: ServeJob | null | undefined) {
  if (!job) return 0;
  return Math.max(0, job.copies | 0) * unitsToHold(job.part, job.model);
}
export function isMine(id?: string) {
  return id === MINE_ID;
}
export function mineUsdHr(gpu: string) {
  return MINE_USD_HR[fleetPart(gpu)] || 0;
}
export function gpuDown() {
  return !!(S && S.outageUntil > S.t);
}
export function mineRevenueHr() {
  if (gpuDown()) return 0;
  return ensureJobs().reduce((a, j) => {
    if (!isMine(j.model)) return a;
    return a + jobGpus(j) * mineUsdHr(j.part);
  }, 0);
}
export function servingOf(k: string) {
  const p = fleetPart(k);
  return ensureJobs().reduce(
    (a, j) => a + (fleetPart(j.part) === p ? jobGpus(j) : 0),
    0
  );
}
export function ensureRdJobs(): RdJob[] {
  if (!S) return [];
  if (!Array.isArray(S.rdJobs)) S.rdJobs = [];
  if (!S.rdBoost || typeof S.rdBoost !== "object") S.rdBoost = {};
  if (!S.rdCount || typeof S.rdCount !== "object") S.rdCount = {};
  return S.rdJobs;
}
export function rdJobGpus(job: RdJob | null | undefined) {
  if (!job) return 0;
  return Math.max(0, job.gpus | 0);
}
function researchOf(k: string) {
  const p = fleetPart(k);
  return ensureRdJobs().reduce(
    (a, j) => a + (fleetPart(j.part) === p ? rdJobGpus(j) : 0),
    0
  );
}
export function rdBoostKey(model: string, gpu: string) {
  return String(model || "") + "\0" + fleetPart(gpu);
}
export function rdBoostMul(model: string, gpu: string) {
  if (!S || !S.rdBoost) return 1;
  const n = S.rdBoost[rdBoostKey(model, gpu)];
  return n > 1 ? n : 1;
}
/* The engine-update event's 5% stacks on top of player research. It stays out of
   rdBoost so an install does not bake it in twice. */
function engineBoostMul(model: string, gpu: string) {
  if (!S || !S.engineBoost) return 1;
  const n = S.engineBoost[rdBoostKey(model, gpu)];
  return n > 1 ? n : 1;
}
function jobSpeedMul() {
  return S && S.serveSpeed > 1 ? S.serveSpeed : 1;
}
export function driverMul() {
  return S && S.driverMul > 1 ? S.driverMul : 1;
}
export function throughputMul(model: string, gpu: string) {
  return engineBoostMul(model, gpu) * jobSpeedMul() * driverMul();
}
/* One search per (model, GPU). A completed improvement's gain has the unimodal
   Beta distribution below and is applied as a multiplier on top of what that
   pair has already installed. Its Dirichlet components are drawn one at a time
   as RD_POINT_NEED[found] research points arrive; their completed sum has the
   same Beta law. The first point averages RD_POINT_DAYS on the year clock for
   one deployment, and each later point in that search averages one day more.
   Every deployment rolls its own wait and the first success counts, so more
   deployments shorten the wait. A deployment is however many GPUs it takes to
   hold the model, so eight cards holding one copy research at the same rate as
   one card holding one copy.

   The mean closes a fraction of the headroom left under a ceiling. B is the
   multiplier already installed and starts at 1, α is RD_GAIN_ALPHA, and M is
   RD_CEILING, or RD_CEILING_AMB on A2D and A3D:

     g(B) = α (M / B − 1)

   Each find is expected to take 20% of what is left, so later finds shrink
   and the pair stops once B reaches M. The gain is an integer
   Beta(RD_BETA_A, b), with b chosen so a/(a+b) sits on g(B). */
export function rdPointsNeeded(found: number) {
  const i = Math.max(0, found | 0);
  return RD_POINT_NEED[Math.min(i, RD_POINT_NEED.length - 1)];
}
/* Expected cumulative share after x of N research points.
   R(x) = 1 when the set is finished, otherwise α (x/N)^p.
   p > 1 makes the last point the jump; α < 1 is the completion kick.
   For N = 20: 10/20 → 0.088, 19/20 → 0.600, 20/20 → 1. */
function rdRewardFrac(points: number, need: number) {
  if (!(need > 0) || !(points > 0)) return 0;
  if (points >= need) return 1;
  return RD_SYNERGY_ALPHA * simPow(points / need, RD_SYNERGY_P);
}
/* Old fixed-roll saves use this to keep their partial-result behavior. */
export function rdRealized(full: number, points: number, need: number) {
  if (!(full > 0)) return 0;
  const frac = rdRewardFrac(points, need);
  if (!(frac > 0)) return 0;
  const pct = Math.round(full * frac * 100);
  return pct > 0 ? pct / 100 : 0;
}
export function rdFound(model: string, gpu: string) {
  if (!S || !S.rdCount) return 0;
  const n = S.rdCount[rdBoostKey(model, gpu)];
  return n > 0 ? n | 0 : 0;
}
export function rdQuantum(model: string, gpu: string) {
  return Math.max(1, unitsToHold(gpu, model) | 0);
}
function rdPointDays(pointsSoFar: number) {
  return RD_POINT_DAYS + Math.max(0, pointsSoFar | 0);
}
/* Whole copies of the model those GPUs can hold. A partial copy does not roll. */
function rdCopies(model: string, gpu: string, gpus: number) {
  const q = rdQuantum(model, gpu);
  if (q < 1) return 0;
  return Math.floor(Math.max(0, gpus | 0) / q);
}
function rdCopyMeanHours(pointsSoFar: number) {
  const speed = S && S.rdSpeed > 0 ? S.rdSpeed : 1;
  return (rdPointDays(pointsSoFar) * 24 * SCORE_HOURS) / YEAR_HOURS / speed;
}
/* Expected wait. One deployment takes rdPointDays; n of them take the first of n draws. */
export function rdMeanHours(
  model: string,
  gpu: string,
  gpus: number,
  pointsSoFar: number
) {
  const n = rdCopies(model, gpu, gpus);
  if (n < 1) return Infinity;
  const one = rdCopyMeanHours(pointsSoFar);
  if (!(one > 0)) return Infinity;
  return one / n;
}
function rdExpWait(mean: number) {
  let u = simRandom();
  if (u <= 0) u = 1 / 4294967296;
  return -mean * simLog(u);
}
/* One exponential per deployment. The point lands when the first of them does. */
export function rdSampleWait(
  model: string,
  gpu: string,
  gpus: number,
  pointsSoFar: number
) {
  const n = rdCopies(model, gpu, gpus);
  const mean = rdCopyMeanHours(pointsSoFar);
  if (!(n > 0) || !(mean > 0) || mean === Infinity) return Infinity;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const w = rdExpWait(mean);
    if (w < best) best = w;
  }
  return best;
}
/* Integer-shape Gamma(n, 1) as a sum of n unit exponentials, then Beta(a, b)
   as the normalized pair. simLog keeps the draw on the seeded stream. */
function simGammaInt(n: number) {
  n |= 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    let u = simRandom();
    if (u <= 0) u = 1 / 4294967296;
    s -= simLog(u);
  }
  return s;
}
function simBetaInt(a: number, b: number) {
  const x = simGammaInt(a),
    y = simGammaInt(b),
    t = x + y;
  if (!(t > 0)) return a / (a + b);
  return x / t;
}
/* Deterministic square root for the general-shape Gamma sampler below.
   A power-of-two estimate followed by ten Newton steps reaches double
   precision without depending on the host's libm. */
function simSqrt(x: number) {
  if (!(x > 0)) return x === 0 ? 0 : NaN;
  if (x === Infinity) return Infinity;
  let y = simPow2(Math.ceil(simIlog2(x) / 2));
  for (let i = 0; i < 10; i++) y = 0.5 * (y + x / y);
  return y;
}
/* Standard normal from Marsaglia's polar method. */
function simNormal() {
  for (;;) {
    const x = 2 * simRandom() - 1,
      y = 2 * simRandom() - 1,
      s = x * x + y * y;
    if (!(s > 0) || s >= 1) continue;
    return x * simSqrt((-2 * simLog(s)) / s);
  }
}
/* Marsaglia-Tsang Gamma(shape, 1), extended to shapes below one. Dirichlet
   components have fractional shapes, unlike the old whole-roll sampler. */
function simGamma(shape: number): number {
  if (!(shape > 0)) return 0;
  if (shape < 1) {
    let u = simRandom();
    if (u <= 0) u = 1 / 4294967296;
    return simGamma(shape + 1) * simPow(u, 1 / shape);
  }
  const d = shape - 1 / 3,
    c = 1 / simSqrt(9 * d);
  for (;;) {
    const z = simNormal(),
      q = 1 + c * z;
    if (!(q > 0)) continue;
    const v = q * q * q,
      u = simRandom(),
      z2 = z * z;
    if (u < 1 - 0.0331 * z2 * z2) return d * v;
    if (simLog(u) < 0.5 * z2 + d * (1 - v + simLog(v))) return d * v;
  }
}
function simBeta(a: number, b: number) {
  const x = simGamma(a),
    y = simGamma(b),
    t = x + y;
  if (!(t > 0)) return a / (a + b);
  return x / t;
}
function rdCeiling(gpu: string) {
  const k = fleetPart(gpu);
  return k === "a2d" || k === "a3d" ? RD_CEILING_AMB : RD_CEILING;
}
/* Expected relative gain of the next find, given the multiplier already installed. */
export function rdMeanGain(model: string, gpu: string) {
  const B = rdBoostMul(model, gpu);
  const M = rdCeiling(gpu);
  if (!(B > 0) || !(M > B)) return 0;
  const g = RD_GAIN_ALPHA * (M / B - 1);
  if (!(g > 0)) return 0;
  return g < 1 ? g : 1;
}
function rdBetaOf(mean: number) {
  const a = RD_BETA_A;
  const b = Math.max(1, Math.round((a * (1 - mean)) / mean));
  return { a, b };
}
export function rdSampleGain(model: string, gpu: string) {
  const mean = rdMeanGain(model, gpu);
  if (!(mean > 0)) return 0;
  const shape = rdBetaOf(mean);
  const draw = simBetaInt(shape.a, shape.b);
  return draw > 0 ? draw : mean;
}
/* A research chain decomposes Beta(a, b) into Dirichlet components. The
   expected cumulative share after each point follows rdRewardFrac(), while
   the last component supplies the completion bonus. Stick-breaking lets us
   draw each component only when its point is earned; their completed sum is
   still exactly Beta(a, b). */
export function rdGainChain(model: string, gpu: string) {
  const mean = rdMeanGain(model, gpu);
  if (!(mean > 0)) return null;
  return { remaining: 1, betaB: rdBetaOf(mean).b };
}
export function rdGainStep(
  gain: number,
  remaining: number,
  betaB: number,
  points: number,
  need: number
) {
  const now = Math.min(Math.max(1, points | 0), Math.max(1, need | 0));
  const total = Math.max(1, need | 0);
  const before = rdRewardFrac(now - 1, total);
  const after = rdRewardFrac(now, total);
  const alpha = RD_BETA_A * Math.max(0, after - before);
  const restAlpha = RD_BETA_A * Math.max(0, 1 - after) + Math.max(1, betaB);
  const left = Math.max(0, Math.min(1, remaining));
  if (!(alpha > 0) || !(left > 0)) return { gain: Math.max(0, gain), remaining: left };
  const piece = left * simBeta(alpha, restAlpha);
  return {
    gain: Math.max(0, gain) + piece,
    remaining: Math.max(0, left - piece),
  };
}
export function fleetUse() {
  ensureFleet();
  const rented = emptyFleet(),
    serving = emptyFleet(),
    rd = emptyFleet(),
    unused = emptyFleet();
  for (const k of FLEET_ORDER) {
    rented[k] = Math.round((S.fleet && S.fleet[k]) || 0);
    serving[k] = servingOf(k);
    const leftover = Math.max(0, rented[k] - serving[k]);
    rd[k] = Math.min(leftover, researchOf(k));
    unused[k] = leftover - rd[k];
  }
  return { rented, serving, rd, unused };
}

function modelGpuTps(model: string, gpu: string, elise = true) {
  const row = TPS_PER_GPU[model];
  if (!row) return 0;
  const rd = elise ? rdBoostMul(model, gpu) : 1;
  return (row[fleetPart(gpu)] || 0) * rd * throughputMul(model, gpu);
}
export function jobTps(job: ServeJob | null | undefined) {
  if (!job || isMine(job.model)) return 0;
  return jobGpus(job) * modelGpuTps(job.model, job.part);
}
function jobTpsBare(job: ServeJob | null | undefined) {
  if (!job || isMine(job.model)) return 0;
  return jobGpus(job) * modelGpuTps(job.model, job.part, false);
}
/* Each GPU is billed at the tier its own place in the fleet falls in. */
function tierUnits(n: number) {
  n = Math.max(0, n || 0);
  const band = (lo: number, hi: number) => Math.max(0, Math.min(n, hi) - lo);
  return (
    band(0, 32) + band(32, 128) * 0.9 + band(128, 512) * 0.8 + band(512, Infinity) * 0.7
  );
}
/* The fleet's average share of list price under that schedule. */
export function fleetDisc(n: number) {
  return n > 0 ? tierUnits(n) / n : 1;
}
function rentPartnerMul(k: string) {
  if (!S) return 1;
  let m = 1;
  if (S.rentOff > 0) m *= S.rentOff;
  const v = GPUS[fleetPart(k)] && GPUS[fleetPart(k)].vendor;
  if (v === "Nbibia" && S.rentNbibia > 0) m *= S.rentNbibia;
  if (v === "AMB" && S.rentAmb > 0) m *= S.rentAmb;
  return m;
}
export function gpuListRent(k: string) {
  const p = GPUS[fleetPart(k)];
  return (p ? p.rental : 0) * rentPartnerMul(k);
}
/* The whole fleet's rent an hour: its average list rent times the discounted
   unit count. */
export function rentalHr() {
  const f = ensureFleet();
  const n = fleetTotal(f);
  if (n <= 0) return 0;
  let s = 0;
  for (const k of FLEET_ORDER) s += (f[k] || 0) * gpuListRent(k);
  return (s / n) * tierUnits(n);
}
/* The rental click grows with the fleet so a large board is not a click per
   card: one GPU while you are small, then a node, then three, then six. */
export function rentBlockAt(g: number) {
  return g >= 512 ? 48 : g >= 128 ? 24 : g >= 32 ? 8 : 1;
}
/* The first rental is two GPUs, so a new player has one to serve on and one
   spare for Elise. A lease cannot be returned inside the year, so an empty
   fleet only ever means nothing has been rented yet. */
export function rentBlock() {
  const g = (S && S.gpus) || 0;
  return g ? rentBlockAt(g) : 2;
}
/* When the block grows past a count the old block left uneven (7 GPUs of a type
   when the block becomes 8, 18 when it becomes 24), the next rental of that type
   tops it up as well, so the type's count lands on a multiple of the new block:
   7 -> 16, 18 -> 48. The extra GPUs are rented and billed like any others. */
export function rentTopUpOf(k: string) {
  const have = (S && S.fleet && S.fleet[fleetPart(k)]) || 0;
  const b = rentBlock();
  if (have <= 0 || b <= 1) return 0;
  return (b - (have % b)) % b;
}
/* The next rental of one type: the usual block plus any top-up, cut short at
   FLEET_CAP. 0 when full. */
export function rentBlockOf(k: string) {
  const have = (S && S.fleet && S.fleet[fleetPart(k)]) || 0;
  return Math.max(0, Math.min(rentBlock() + rentTopUpOf(k), FLEET_CAP - have));
}
export function nextRentOf(k: string) {
  return withFleetDelta(k, rentBlockOf(k), () => rentalHr()) - rentalHr();
}

export function unitsToHold(pk: string, modelKey: string) {
  if (isMine(modelKey)) return 1;
  const m = MODELS[modelKey];
  if (!m) return 1;
  const k = fleetPart(pk);
  const set = UNITS_SET[modelKey] && UNITS_SET[modelKey][k];
  if (set != null) return set;
  return Math.max(1, Math.ceil((m.weightsGB || 0) / (GPUS[k].mem * KV_HEADROOM)));
}
/* A pairing is served and researched only if it has an RD_TPS cell, the same
   rule the Serving and R&D panels apply, and a copy fits its node limit. */
export function modelOnPart(model: string, pk: string) {
  if (isMine(model)) return true;
  const row = RD_TPS[model];
  const cell = row && isFleetPart(pk) ? row[pk] : undefined;
  if (!(cell && cell > 0)) return false;
  const need = unitsToHold(pk, model);
  if (need <= NODE_GPUS) return true;
  return isFleetPart(pk) && LATEST_PARTS.indexOf(pk) >= 0 && need <= LATEST_NODE_GPUS;
}
function modelOnAllParts(model: string) {
  return FLEET_ORDER.every(k => modelOnPart(model, k));
}

/* Demand settles at the fleet's throughput, and never past the whole market.
   No headroom past capacity: a deployment's share is the tokens it can serve. */
export function demandTargetToks(market: number, supply: number) {
  const cap = Math.max(0, supply) * DEMAND_HEADROOM;
  return Math.min(SHARE_CAP * Math.max(0, market) * DEMAND_HEADROOM, cap);
}
function shareAdaptTauHours() {
  const twoWeeks = 2 * 7 * 24 * (SCORE_HOURS / YEAR_HOURS);
  /* When the target sat 20% past capacity, this tau reached capacity in two
     game weeks. Cuts and GPUs taken off a model still ease in on that clock. */
  const fill = simLog(6);
  return Math.max(0.01, twoWeeks / fill);
}
function ensureShares() {
  if (!S || !S.modelShare || typeof S.modelShare !== "object") S.modelShare = {};
  if (!S || !S.servedEma || typeof S.servedEma !== "object") S.servedEma = {};
}
export function isListed(model: string) {
  return ensureJobs().some(
    j => j.model === model && !isMine(j.model) && jobGpus(j) > 0
  );
}
export function supplyTpsOf(model: string) {
  let cap = 0;
  ensureJobs().forEach(j => {
    if (j.model === model && !isMine(j.model)) cap += jobTps(j);
  });
  return cap;
}
export function jumpShareToTarget(id: string) {
  const market = modelMarketToks(id);
  if (!(market > 0)) return;
  ensureShares();
  const target = demandTargetToks(market, supplyTpsOf(id));
  S.servedEma[id] = target;
  S.modelShare[id] = clamp(target / market, SHARE_MIN, SHARE_CAP);
}
/* A deployment earns from the moment it lands: demand for the model jumps to what
   the fleet on it can now serve (capped by the market, as in demandTargetToks),
   instead of growing towards it over two game weeks. It never moves demand down;
   updateModelShares still eases it after that (a cut share, a model's GPUs taken
   away). */
export function catchUpShare(id: string) {
  const market = modelMarketToks(id);
  if (!(market > 0)) return;
  ensureShares();
  const target = demandTargetToks(market, supplyTpsOf(id));
  if ((S.servedEma[id] || 0) >= target) return;
  S.servedEma[id] = target;
  S.modelShare[id] = clamp(target / market, SHARE_MIN, SHARE_CAP);
}
export function cutShare(id: string, frac: number) {
  ensureShares();
  const market = modelMarketToks(id);
  const ema = Math.max(0, (S.servedEma[id] || 0) * frac);
  S.servedEma[id] = ema;
  S.modelShare[id] = market > 0 ? clamp(ema / market, SHARE_MIN, SHARE_CAP) : 0;
}
export function updateModelShares(dt: number) {
  if (!S || gpuDown()) return;
  ensureShares();
  const tau = shareAdaptTauHours();
  const a = 1 - simExp(-Math.max(0, dt) / tau);
  const ids = modelsOut();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const market = modelMarketToks(id);
    const target = demandTargetToks(market, supplyTpsOf(id));
    const prev = S.servedEma[id] || 0;
    const ema = Math.max(0, prev + (target - prev) * a);
    S.servedEma[id] = ema;
    const grown = market > 0 ? ema / market : 0;
    S.modelShare[id] = clamp(grown, SHARE_MIN, SHARE_CAP);
  }
}
export function modelShareOf(model: string) {
  ensureShares();
  if (S.modelShare[model] != null) return S.modelShare[model];
  return SHARE_MIN;
}
export function modelMarketToks(model: string) {
  const base = (OR_MARKET_TPS[model] || OR_MARKET_TPS.gigaparrot) * MARKET_SCALE;
  const mul = S && S.marketMul && S.marketMul[model];
  return base * (mul || 1);
}
/* The whole market for one model grows, which is the Demand column.
   Customers you already have grow with it, but not past what the fleet can
   serve, so the serving card and the stats table still show the same share. */
export function growMarket(id: string, frac: number) {
  if (!S || !(frac > 0)) return;
  if (!S.marketMul || typeof S.marketMul !== "object") S.marketMul = {};
  S.marketMul[id] = (S.marketMul[id] || 1) * frac;
  ensureShares();
  const market = modelMarketToks(id);
  const raised = (S.servedEma[id] || 0) * frac;
  const cap = demandTargetToks(market, supplyTpsOf(id));
  S.servedEma[id] = Math.min(cap, raised);
  S.modelShare[id] =
    market > 0 ? clamp(S.servedEma[id] / market, SHARE_MIN, SHARE_CAP) : 0;
}
function demandOnYouToks(model: string) {
  const sh = modelShareOf(model);
  if (sh <= 0) return 0;
  return modelMarketToks(model) * sh;
}
export function fmtMTps(toks: unknown) {
  const m = (Number(toks) || 0) / 1e6;
  if (m <= 0) return "0";
  if (m >= 100) return m.toFixed(1);
  if (m >= 1) return m.toFixed(2);
  if (m >= 0.01) return m.toFixed(3);
  return m.toFixed(4);
}

/* ---------------- improvements ----------------
   Improvements taken from public vLLM and FlashInfer PRs, not from actual Elise runs.
   Refer to our blogpost for actual improvements Elise discovered.
   One title per line in catalog/improvements.csv. An R&D find shows one. */
const IMPROVEMENTS: string[] = __IMPROVEMENTS_JSON__;
export function pickImprovement() {
  return IMPROVEMENTS.length
    ? IMPROVEMENTS[Math.floor(simRandom() * IMPROVEMENTS.length)]
    : "";
}
/* GigaParrot is out from hour zero. Each later model in MODEL_ORDER comes out
   on the 15th of the next month: the second on Jan 15, the third on Feb 15. */
function modelReleaseT(id: string) {
  const i = MODEL_ORDER.indexOf(id);
  if (i <= 0) return 0;
  return (i - 1) * monthHours() + 14 * acctDay();
}
export function modelReleased(id: string) {
  return modelReleaseT(id) <= ((S && S.t) || 0);
}
/* Every model, released or not. All-GPU models first, then models that only
   fit the two latest parts. */
export function modelsAll() {
  const ids = Object.keys(MODELS);
  const rank = (id: string) => {
    const i = MODEL_ORDER.indexOf(id);
    return i >= 0 ? i : 99;
  };
  const all = ids.filter(modelOnAllParts).sort((a, b) => rank(a) - rank(b));
  const rest = ids.filter(id => !modelOnAllParts(id)).sort((a, b) => rank(a) - rank(b));
  return all.concat(rest);
}
/* The models a player can serve or research right now. */
export function modelsOut() {
  return modelsAll().filter(modelReleased);
}
export function capacityTps() {
  return ensureJobs().reduce((a, j) => a + jobTps(j), 0);
}
