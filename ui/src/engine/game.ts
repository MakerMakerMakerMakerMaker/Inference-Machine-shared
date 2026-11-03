import {
  MODELS,
  MODEL_ORDER,
  TPS_PER_GPU,
  GPUS,
  FLEET_ORDER,
  FLEET_UNLOCK,
  FLEET_CAP,
  MINE_ID,
  MINE_NAME,
  SHARE_MIN,
  SHARE_CAP,
  START_STATE,
} from "./constants";
import { clamp } from "./util";
import {
  YEAR_HOURS,
  SCORE_HOURS,
  MONTH_NAMES,
  monthHours,
  acctDay,
  perDay,
} from "./clock";
import { listPricePerM } from "./pricing";
import { S, setState } from "./state";
import { cleanName, nameOk } from "./names";
import {
  SIM_SEED,
  resetRng,
  simRandom,
  jobListRevHr,
  jobOfferToks,
  jobFills,
  gpuUtil,
  inferRevHr,
  inferRevHrBare,
  emptyFleet,
  fleetPart,
  syncFleetGpus,
  ensureFleet,
  addToFleet,
  partUnlocked,
  ensureJobs,
  jobGpus,
  isMine,
  mineUsdHr,
  gpuDown,
  mineRevenueHr,
  servingOf,
  ensureRdJobs,
  rdJobGpus,
  rdBoostKey,
  rdBoostMul,
  throughputMul,
  rdPointsNeeded,
  rdRealized,
  rdFound,
  rdQuantum,
  rdMeanHours,
  rdSampleWait,
  rdMeanGain,
  rdGainChain,
  rdGainStep,
  fleetUse,
  jobTps,
  fleetDisc,
  gpuListRent,
  rentalHr,
  rentBlockAt,
  rentBlock,
  rentBlockOf,
  nextRentOf,
  unitsToHold,
  modelOnPart,
  demandTargetToks,
  isListed,
  supplyTpsOf,
  catchUpShare,
  cutShare,
  growMarket,
  updateModelShares,
  modelShareOf,
  modelMarketToks,
  fmtMTps,
  modelReleased,
  modelsAll,
  pickImprovement,
  modelsOut,
} from "./simulation";
import { fmt$, fmtN } from "./format";
import type {
  ChartSample,
  ChoiceEvent,
  GameState,
  ModelPick,
  NoticeEvent,
  RdJob,
  ServeJob,
} from "./state";
import type { FleetPart } from "./constants";
import type {
  BoardView,
  ChartPoint,
  ChartView,
  ControlsView,
  EventView,
  GainFlash,
  GameOverView,
  GpuBuyRow,
  GpuView,
  HudTile,
  HudView,
  LbRow,
  RdView,
  ScoreView,
  ServeView,
  StartView,
  TutorialView,
  UnfoldView,
} from "../game/types";
import { SHARE_URL } from "../game/share";
import type { PanelId } from "../components/layout";
import * as clockModule from "./clock";
import * as constantsModule from "./constants";
import * as pricingModule from "./pricing";
import * as simulationModule from "./simulation";

/* The recheck sets this and calls the same functions. Drawing is skipped;
   the money, the queue and the catalog still move. */
const HEADLESS = !!window.__HEADLESS;
/* Replaced at build time with a hash of the bundle. The leaderboard is per
   build, so a new version starts clean. */
const GAME_VERSION = "__GAME_VERSION__";
/* The year, score hours, monthHours() and acctDay() are in clock.ts. */
const CHART_WEEKS = 50;
const SCORE_TICK = SCORE_HOURS * 20;
function toCalHours(h: number) {
  return Math.max(0, Number(h) || 0) * (YEAR_HOURS / SCORE_HOURS);
}
const CHART_T1 = CHART_WEEKS * 168 * (SCORE_HOURS / YEAR_HOURS);
/* ---------------- state ---------------- */
/* Decisions that, with the run's seed, determine the run. One entry per change the
   player actually made, stamped with the 0.05-hour tick it happened on.
   Automatic consequences (demand, model releases, R&D finds) are not
   listed: the seeded simulation produces them again from this list. */
type RunEvent = { tick: number; type: string; [field: string]: unknown };
let EVENTS: RunEvent[] = [];
/* The run's seed and its opening numbers. */
type RunStart = {
  seed: number;
  capital: number;
  gpus: number;
  model: string;
  price: number;
};
let RUN: RunStart | null = null;
/* Every new game draws its own world. ?seed= pins one for that page load, and
   the headless replay passes the trajectory's seed to restart(). */
function drawSeed() {
  const q = new URLSearchParams(location.search).get("seed");
  if (q != null && q !== "" && Number.isFinite(+q)) {
    const n = +q >>> 0;
    return n || 1;
  }
  if (HEADLESS) return SIM_SEED;
  try {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    if (n) return n;
  } catch {
    /* no crypto: fall back to Math.random */
  }
  return Math.floor(Math.random() * 4294967295) >>> 0 || 1;
}
function activeSeed() {
  return RUN ? RUN.seed : drawSeed();
}
function nowTick() {
  return Math.round(S.t * 20);
}
function record(type: string, fields?: Record<string, unknown>) {
  EVENTS.push({ tick: nowTick(), type, ...fields });
}
/* A run as the leaderboard replays it. */
type RunDocument = {
  seed: number;
  start: RunStart | null;
  tick: number;
  money: number | null;
  events: RunEvent[];
  name?: string;
};
function eventsDocument(): RunDocument {
  return {
    seed: activeSeed(),
    start: RUN,
    tick: S ? nowTick() : 0,
    money: S ? S.money : null,
    events: EVENTS,
  };
}
function eventsJson() {
  return JSON.stringify(eventsDocument(), null, 2);
}
function fresh(): GameState {
  const P = START_STATE;
  return {
    t: 0,
    money: P.capital,
    moneyBare: P.capital,
    capitalShown: P.capital,
    capitalHour: 0,
    gpus: P.gpus,
    fleet: (() => {
      const f = emptyFleet();
      if (P.gpus > 0) f.h2o = P.gpus;
      return f;
    })(),
    prof5: 0,
    revHr: 0,
    costHr: 0,
    revS: 0,
    costS: 0,
    util: 0,
    samples: [],
    dead: false,
    timeUp: false,
    infinite: false,
    monthMark: 0,
    outageUntil: 0,
    serveSpeed: 1,
    rentOff: 1,
    rentNbibia: 1,
    rentAmb: 1,
    engineBoost: {},
    seenEvents: {},
    seenNoops: {},
    driverMul: 1,
    rdSpeed: 1,
    breakFee: 0,
    revCut: 0,
    eventQ: [],
    eventOpen: null,
    heldNews: [],
    /* The first model is out and playable from hour zero, so it is neither
       announced nor highlighted. */
    modelsSeen: { [MODEL_ORDER[0]]: 1 },
    modelsLit: { [MODEL_ORDER[0]]: 1 },
    jobs: [],
    nextJob: 1,
    servePick: null,
    rdJobs: [],
    nextRdJob: 1,
    rdPick: null,
    rdBoost: {},
    rdCount: {},
    modelShare: {},
    servedEma: {},
    marketMul: {},
  };
}

const OUTAGE_TIP =
  "Cloud outage\nYour GPUs are offline. Serving and research are paused.";
function outageHours() {
  return 24 * (SCORE_HOURS / YEAR_HOURS);
}
export function checkMonthEvents() {
  if (!S || S.dead) return;
  const len = monthHours();
  if (!(len > 0)) return;
  let n = Math.floor(S.t / len);
  const prev = S.monthMark | 0;
  if (n <= prev) return;
  if (n > prev + 24) n = prev + 24;
  for (let m = prev + 1; m <= n; m++) {
    if (edgeDay(m * len)) continue;
    fireMonthEvent(null, m);
  }
  S.monthMark = n;
}
const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function monthSlot(monthIndex: number) {
  return (((monthIndex | 0) % 12) + 12) % 12;
}
function eventMonthName(monthIndex: number) {
  return MONTH_NAMES[monthSlot(monthIndex)];
}
function fullMonthName(short: string) {
  const i = MONTH_NAMES.indexOf(short);
  return i >= 0 ? MONTH_FULL[i] : short || "";
}
const EVENT_ART = __EVENT_ART_JSON__;
const NOOP_ART = ["founder", "lab", "card", "car", "moon"];
const INFO_MARK =
  '<svg class="nInfo" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5.4" y="5.15" width="1.2" height="3.2" fill="currentColor"/><rect x="5.4" y="3.2" width="1.2" height="1.2" fill="currentColor"/></svg>';
const NOOP_NEWS = [
  "<b>A wild entrepreneur has been spotted in the Bay Area.</b> Witnesses say they want to start their own inference business.",
  '<b>British scientists discovered that spending just twenty minutes with GPUs in the morning causes...</b> <span class="nPaywall" data-tip="Article is behind a paywall."><a class="nMore" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-disabled="true">[read more]</a></span>.',
  "<b>Can millennials afford GPUs?</b> New 35-year credit plans for the future generations.",
  "<b>Car thief stole a Besla to sell its RAM for profit.</b> AI data centers are buying up so much memory that the chips in a car are now worth stealing.",
  "<b>ARTEMIS 4 mission now scouts new locations for data centres on the moon.</b>",
];
function nothingNews(month: string) {
  const left: number[] = [];
  for (let i = 0; i < NOOP_NEWS.length; i++) if (!S.seenNoops[i]) left.push(i);
  /* Each headline shows at most once a game; once they've all been seen, an empty
     month passes quietly. The draw is taken either way, so the random sequence,
     and every saved run's replay, stays the same. */
  const draw = simRandom();
  if (!left.length) return;
  const i = left[(draw * left.length) | 0];
  S.seenNoops[i] = 1;
  const html = NOOP_NEWS[i];
  const logHtml = '<span class="nDash">–</span> ' + html;
  if (HEADLESS) {
    news(logHtml, "", month);
    return;
  }
  S.eventQ.push({
    kind: "noop",
    month,
    html,
    logHtml,
    logged: false,
    art: NOOP_ART[i],
  });
  presentEvent();
}
function queueDecember(idx: number, month: string) {
  if (monthSlot(idx) !== 11) return;
  if (S.decMark === idx) return;
  S.decMark = idx;
  const logHtml =
    "<b>Time is running out.</b> You have one month left. Last chance to do something great.";
  if (HEADLESS) {
    news(logHtml, "", month);
    return;
  }
  S.eventQ.push({
    kind: "script",
    month,
    title: "Time is running out.",
    art: "sand",
    html: "You have one month left. Last chance to do something great.",
    logHtml,
    logged: false,
  });
  presentEvent();
}
function dayIndex(t: number) {
  const day = acctDay();
  if (!(day > 0)) return 0;
  return Math.floor(Math.max(0, t || 0) / day);
}
function edgeDay(t: number) {
  const last = Math.round(YEAR_HOURS / 24) - 1;
  const d = dayIndex(t);
  return d <= 0 || d >= last;
}
function currentMonthName() {
  const len = monthHours();
  const i = Math.min(11, Math.max(0, Math.floor(((S && S.t) || 0) / len)));
  return MONTH_NAMES[i];
}
function queueOrNews(html: string, cls?: string) {
  if (edgeDay(S.t)) {
    S.heldNews.push({ html, cls: cls || "" });
    return;
  }
  news(html, cls, currentMonthName());
}
function flushHeldNews() {
  if (!S || edgeDay(S.t) || !S.heldNews.length) return;
  const items = S.heldNews;
  S.heldNews = [];
  const month = currentMonthName();
  for (const it of items) news(it.html, it.cls, month);
}
export let eventHold = false;
const MONTH_EVENTS = 10;
const MONTH_EMPTIES = 5;
function markNews(mark: string, sentence: string, month: string) {
  const icon =
    mark === "up"
      ? '<span class="nUp">▲</span> '
      : mark === "dn"
        ? '<span class="nDn">▼</span> '
        : '<span class="nDash">–</span> ';
  news(icon + sentence, mark === "up" ? "imp" : mark === "dn" ? "die" : "", month);
}
function scaleRent(key: "rentOff" | "rentNbibia" | "rentAmb", mul: number) {
  S[key] = (S[key] > 0 ? S[key] : 1) * mul;
}
function bumpEngine(optimized: boolean) {
  S.engineBoost = S.engineBoost || {};
  let n = 0;
  for (const model in TPS_PER_GPU) {
    for (const gpu of FLEET_ORDER) {
      if (!modelOnPart(model, gpu)) continue;
      if (rdFound(model, gpu) > 0 !== optimized) continue;
      const key = rdBoostKey(model, gpu);
      S.engineBoost[key] = (S.engineBoost[key] > 1 ? S.engineBoost[key] : 1) * 1.05;
      n++;
    }
  }
  return n;
}
function addOutage(days: number) {
  S.outageUntil = Math.max(S.t, S.outageUntil || 0) + days * outageHours();
}
function abandonCluster() {
  const fee = Math.max(0, rentalHr()) * 0.1;
  S.breakFee = (S.breakFee > 0 ? S.breakFee : 0) + fee;
  S.fleet = emptyFleet();
  syncFleetGpus();
  S.jobs = [];
  S.rdJobs = [];
  clampJobs();
  animateFleetCount(0);
  return fee;
}
function speedAll(mul: number) {
  S.serveSpeed = (S.serveSpeed > 1 ? S.serveSpeed : 1) * mul;
}
function mineAllGpus() {
  ensureFleet();
  ensureJobs();
  ensureRdJobs();
  S.jobs = [];
  S.rdJobs = [];
  S.nextJob = S.nextJob || 1;
  let gpus = 0;
  for (const k of FLEET_ORDER) {
    const n = Math.round((S.fleet && S.fleet[k]) || 0);
    if (n < 1) continue;
    S.jobs.push({ id: "s" + S.nextJob++, model: MINE_ID, part: k, copies: n });
    gpus += n;
  }
  priceServingJobs();
  pushReact();
  return gpus;
}
type EventSpec = {
  title: string;
  art: string;
  ask: string;
  choices: {
    label: string;
    hint: string;
    apply(): { mark: string; sentence: string };
  }[];
};
const EVENT_CHOICES: Record<number, EventSpec> = {
  0: {
    title: "You plan to announce your results in a blog post.",
    art: "blog",
    ask: "Who is your blog's main audience?",
    choices: [
      {
        label: "Users",
        hint: "Demand for every model rises by 5%.",
        apply() {
          for (const id in MODELS) growMarket(id, 1.05);
          return {
            mark: "up",
            sentence:
              "<b>Users like your progress.</b> Demand for every model increased by 5%.",
          };
        },
      },
      {
        label: "Investors",
        hint: "You raise $100k.",
        apply() {
          S.money += 100000;
          if (Number.isFinite(S.moneyBare)) S.moneyBare += 100000;
          return {
            mark: "up",
            sentence:
              "<b>Investors like your progress and decide to invest.</b> Capital increased by $100k.",
          };
        },
      },
    ],
  },
  1: {
    title: "A global cloud provider outage.",
    art: "storm",
    ask: "Do you want to migrate your cluster elsewhere?",
    choices: [
      {
        label: "No",
        hint: "GPUs go offline for 7 days. Serving and research pause.",
        apply() {
          addOutage(7);
          return {
            mark: "dn",
            sentence:
              "<b>You stayed with your cloud provider.</b> All GPUs went offline for 7 days.",
          };
        },
      },
      {
        label: "Yes",
        hint: "You hand the cluster back and rent again from scratch. You owe the old provider 10% of that rent every day, and the bill stays even with no GPUs.",
        apply() {
          const fee = abandonCluster();
          return {
            mark: "dn",
            sentence: `<b>You migrated the cluster.</b> GPU count decreased to 0. The old provider's bill is ${fmt$(perDay(fee))}/day, and it stays even with no GPUs.`,
          };
        },
      },
    ],
  },
  2: {
    title: "A new inference engine version comes out.",
    art: "gear",
    ask: "Update?",
    choices: [
      {
        label: "Yes",
        hint: "Model and GPU pairs you have not optimized yet get 5% faster.",
        apply() {
          const n = bumpEngine(false);
          return n
            ? {
                mark: "up",
                sentence:
                  "<b>You updated to the new inference engine.</b> Throughput of unoptimized model and GPU pairs increased by 5%.",
              }
            : {
                mark: "",
                sentence:
                  "<b>You updated to the new inference engine.</b> Throughput did not change. Every pair was already optimized.",
              };
        },
      },
      {
        label: "No",
        hint: "Elise finds new improvements on her own. Model and GPU pairs you have already optimized get 5% faster.",
        apply() {
          const n = bumpEngine(true);
          return n
            ? {
                mark: "up",
                sentence:
                  "<b>You kept the current engine.</b> Throughput of optimized model and GPU pairs increased by 5%.",
              }
            : {
                mark: "",
                sentence:
                  "<b>You kept the current engine.</b> Throughput did not change. No pair was optimized yet.",
              };
        },
      },
    ],
  },
  3: {
    title: "Competitors launch proprietary chips.",
    art: "chip",
    ask: "Develop your own chip?",
    choices: [
      {
        label: "No",
        hint: "Market share of every model drops by 10%.",
        apply() {
          for (const id in MODELS) cutShare(id, 0.9);
          return {
            mark: "dn",
            sentence:
              "<b>You did not develop your own chip.</b> Market share of every model decreased by 10%.",
          };
        },
      },
      {
        label: "Yes",
        hint: "You spend $10k. You failed, but this project helped you find a new software optimization. All throughput increased by 5%.",
        apply() {
          S.money -= 10000;
          if (Number.isFinite(S.moneyBare)) S.moneyBare -= 10000;
          speedAll(1.05);
          return {
            mark: "",
            sentence:
              "<b>You spent $10k trying to build a chip.</b> No chip was built. Capital decreased by $10k. All throughput increased by 5%.",
          };
        },
      },
    ],
  },
  4: {
    title: "You hire an inference engineer.",
    art: "hire",
    ask: "What should they optimize?",
    choices: [
      {
        label: "Inference",
        hint: "Every job gets 2% faster.",
        apply() {
          speedAll(1.02);
          return {
            mark: "up",
            sentence:
              "<b>Your inference engineer optimized inference.</b> All model throughput increased by 2%.",
          };
        },
      },
      {
        label: "Elise",
        hint: "Research with Elise is 10% faster, so it costs less.",
        apply() {
          S.rdSpeed = (S.rdSpeed > 0 ? S.rdSpeed : 1) * 1.1;
          return {
            mark: "up",
            sentence:
              "<b>Your inference engineer optimized Elise.</b> Elise research speed increased by 10%.",
          };
        },
      },
    ],
  },
  5: {
    title: "You have an opportunity to partner with a large cloud provider.",
    art: "cloud",
    ask: "",
    choices: [
      {
        label: "Partner",
        hint: "Every GPU gets 20% cheaper, and the provider takes 10% of your revenue.",
        apply() {
          scaleRent("rentOff", 0.8);
          S.revCut = 0.1;
          return {
            mark: "",
            sentence:
              "<b>You partnered with a cloud provider.</b> GPU rent decreased by 20%. The provider now takes a 10% revenue cut.",
          };
        },
      },
      {
        label: "Don't partner",
        hint: "Nothing happens.",
        apply() {
          return {
            mark: "",
            sentence:
              "<b>You did not partner with the large cloud provider.</b> Nothing changed.",
          };
        },
      },
    ],
  },
  6: {
    title: "Nbibia wants to partner with you.",
    art: "nb",
    ask: "",
    choices: [
      {
        label: "Accept",
        hint: "Nbibia GPUs get 30% cheaper. AMB GPUs get 30% more expensive.",
        apply() {
          scaleRent("rentNbibia", 0.7);
          scaleRent("rentAmb", 1.3);
          return {
            mark: "",
            sentence:
              "<b>You partnered with Nbibia.</b> Nbibia GPU rent decreased by 30%. AMB GPU rent increased by 30%.",
          };
        },
      },
      {
        label: "Reject",
        hint: "Nothing happens.",
        apply() {
          return {
            mark: "",
            sentence: "<b>You turned Nbibia down.</b> Nothing changed.",
          };
        },
      },
    ],
  },
  7: {
    title: "AMB wants to partner with you.",
    art: "amb",
    ask: "",
    choices: [
      {
        label: "Accept",
        hint: "AMB GPUs get 30% cheaper. Nbibia GPUs get 30% more expensive.",
        apply() {
          scaleRent("rentAmb", 0.7);
          scaleRent("rentNbibia", 1.3);
          return {
            mark: "",
            sentence:
              "<b>You partnered with AMB.</b> AMB GPU rent decreased by 30%. Nbibia GPU rent increased by 30%.",
          };
        },
      },
      {
        label: "Reject",
        hint: "Nothing happens.",
        apply() {
          return {
            mark: "",
            sentence: "<b>You turned AMB down.</b> Nothing changed.",
          };
        },
      },
    ],
  },
  9: {
    title: "You get access to a preview of the latest drivers.",
    art: "gears",
    ask: "Do you want to try them?",
    choices: [
      {
        label: "Yes",
        hint: "Throughput is 5% higher for all models, and your GPUs go offline for 3 days.",
        apply() {
          S.driverMul = (S.driverMul > 0 ? S.driverMul : 1) * 1.05;
          addOutage(3);
          return {
            mark: "",
            sentence:
              "<b>You installed the preview drivers.</b> All model throughput increased by 5%. All GPUs went offline for 3 days.",
          };
        },
      },
      {
        label: "No",
        hint: "Nothing happens.",
        apply() {
          return {
            mark: "",
            sentence: "<b>You skipped the preview drivers.</b> Nothing changed.",
          };
        },
      },
    ],
  },
  8: {
    title: "Try mining bitcoins on your GPUs",
    art: "coin",
    ask: "Deploy a bitcoin miner?",
    choices: [
      {
        label: "Yes",
        hint: "All serving and R&D jobs are cancelled. Bitcoin mining is scheduled on every GPU.",
        apply() {
          const gpus = mineAllGpus();
          return {
            mark: "",
            sentence: gpus
              ? "<b>You started mining bitcoins.</b> All serving jobs were cancelled. All R&D jobs were cancelled. Bitcoin mining was scheduled on every GPU."
              : "<b>You started mining bitcoins.</b> All serving jobs were cancelled. All R&D jobs were cancelled. There were no GPUs to mine on.",
          };
        },
      },
      {
        label: "No",
        hint: "Nothing happens.",
        apply() {
          return {
            mark: "",
            sentence: "<b>You skipped bitcoin mining.</b> Nothing changed.",
          };
        },
      },
    ],
  },
};
/* What the event card shows, or null while none is open. Headless replay arms
   events without a card. */
function eventView(): EventView | null {
  const open = !HEADLESS && S && S.eventOpen;
  if (!open) return null;
  if (open.kind !== "choice") {
    return {
      month: fullMonthName(open.month),
      art: (open.art && EVENT_ART[open.art]) || "",
      title: open.title || "",
      ask: "",
      choices: null,
      result: open.html || "",
    };
  }
  const spec = EVENT_CHOICES[open.roll];
  if (!spec) return null;
  const chosen = open.picked != null;
  return {
    month: fullMonthName(open.month),
    art: (spec.art && EVENT_ART[spec.art]) || "",
    title: spec.title,
    ask: chosen ? "" : spec.ask || "",
    choices: chosen ? null : spec.choices.map(c => c.label),
    result: chosen ? open.sentence || "" : null,
  };
}
function showEventModal(open: NoticeEvent | ChoiceEvent | null) {
  if (!open || !eventView()) return;
  if ((open.kind === "noop" || open.kind === "script") && !open.logged) {
    news(open.logHtml || open.html, "", open.month);
    open.logged = true;
  }
  eventHold = true;
  PAUSED = true;
  pushReact();
}
function presentEvent() {
  if (!S) return;
  if (!S.eventOpen) {
    if (!S.eventQ.length) {
      eventHold = false;
      return;
    }
    const next = S.eventQ.shift()!;
    S.eventOpen = next.kind
      ? next
      : {
          kind: "choice",
          roll: next.roll,
          month: next.month,
          picked: null,
          sentence: "",
        };
  }
  /* Headless replay arms the same event and applies the recorded choice
     afterwards. It does not open the modal or stop the clock. */
  if (HEADLESS) return;
  showEventModal(S.eventOpen);
}
function pickEvent(which: number) {
  const open = S && S.eventOpen;
  if (!open || open.kind !== "choice") return;
  const spec = EVENT_CHOICES[open.roll];
  if (open.picked != null || !spec || !spec.choices[which]) return;
  const r = spec.choices[which].apply();
  open.picked = which;
  open.sentence = r.sentence;
  open.mark = r.mark;
  markNews(r.mark, r.sentence, open.month);
  if (!HEADLESS) showEventModal(open);
  pushReact();
  record("month", { roll: open.roll, pick: which });
  logPlay("choice", {
    event: open.roll,
    choice: which,
    label: spec.choices[which].label,
    month: monthIndex(S.t) + 1,
  });
  /* The result modal stays up until the player closes it, on this same tick.
     Replay has no modal, so close it before the next tick arms another event. */
  if (HEADLESS) {
    S.eventOpen = null;
    presentEvent();
  }
}
function closeEvent() {
  const open = S && S.eventOpen;
  if (!open) return;
  if (open.kind === "choice" && open.picked == null) return;
  S.eventOpen = null;
  pushReact();
  presentEvent();
}
function fireMonthEvent(roll?: number | null, monthIndex?: number) {
  if (roll == null) roll = Math.floor(simRandom() * (MONTH_EVENTS + MONTH_EMPTIES));
  const len = monthHours();
  const idx =
    monthIndex == null ? Math.max(1, Math.ceil((S.t || 0) / len) || 1) : monthIndex;
  const month = eventMonthName(idx);
  queueDecember(idx, month);
  if (monthSlot(idx) === 11) return;
  if (!(roll >= 0 && roll < MONTH_EVENTS)) {
    nothingNews(month);
    return;
  }
  if (S.seenEvents[roll]) {
    nothingNews(month);
    return;
  }
  S.seenEvents[roll] = 1;
  const spec = EVENT_CHOICES[roll];
  if (!spec) return;
  /* The player's pick is part of the run. Headless used to apply the first
     choice here, so a replay could finish far from the capital on screen. */
  S.eventQ.push({ roll, month });
  presentEvent();
}
/* Released, and at least one GPU the player already has can run it. Until then
   the stats row still says "Upcoming model", so the highlight waits for the name. */
function modelPlayable(id: string) {
  if (!modelReleased(id)) return false;
  return FLEET_ORDER.some(k => partUnlocked(k) && modelOnPart(id, k));
}
function checkModelReleases() {
  if (!S || S.dead) return;
  const seen = S.modelsSeen;
  const lit = S.modelsLit;
  const fresh: string[] = [];
  MODEL_ORDER.forEach((id, i) => {
    if (!seen[id] && modelReleased(id)) {
      seen[id] = 1;
      news(
        `${INFO_MARK} <b>New model: ${MODELS[id].name}.</b> It is on the Serving menu now. Check the Stats panel to see which GPUs it runs on and what it earns.`,
        "",
        eventMonthName(i - 1)
      );
    }
    if (!lit[id] && modelPlayable(id)) {
      lit[id] = 1;
      fresh.push(id);
    }
  });
  if (fresh.length) pulseModelAura(fresh);
}
export function tick(dt: number) {
  // dt in sim seconds; one sim second is one accounting hour
  if (S.timeUp) return;
  ensureFleet();
  S.t += dt;
  checkMonthEvents();
  checkModelReleases();
  flushHeldNews();
  updateModelShares(dt);
  S.util = gpuUtil();
  S.revHr = inferRevHr() + mineRevenueHr();
  const rental = rentalHr();
  const penalty = S.breakFee > 0 ? S.breakFee : 0;
  const share = S.revCut > 0 ? S.revHr * S.revCut : 0;
  S.costHr = rental + penalty + share;
  if (!Number.isFinite(S.moneyBare)) S.moneyBare = S.money;
  const bareRev = inferRevHrBare() + mineRevenueHr();
  const bareShare = S.revCut > 0 ? bareRev * S.revCut : 0;
  const bareCost = rental + penalty + bareShare;
  S.money += (S.revHr - S.costHr) * dt;
  S.moneyBare += (bareRev - bareCost) * dt;
  // The capital tile steps once per accounting hour (one sim second at 1×).
  {
    const hour = Math.floor(S.t);
    if (S.capitalHour !== hour) {
      S.capitalShown = S.money;
      S.capitalHour = hour;
    }
  }
  {
    const ks = Math.min(1, dt / 5);
    S.revS = (S.revS || 0) + (S.revHr - (S.revS || 0)) * ks;
    S.costS = (S.costS || 0) + (S.costHr - (S.costS || 0)) * ks;
  }
  S.prof5 =
    (S.prof5 || 0) + (S.revHr - S.costHr - (S.prof5 || 0)) * Math.min(1, dt / 5);
  // deaths
  if (S.money < 0 && !S.dead) {
    const start = START_STATE.capital;
    const end = fmtDie$(S.money);
    die(
      "Out of money.",
      `Congratulations, you turned ${fmtCapital(start)} into ${end}.`,
      end
    );
  }
  recordChartSample();
  if (!S.infinite && !S.dead && !S.timeUp && nowTick() >= SCORE_TICK) {
    S.timeUp = true;
    showScore();
  }
}

/* The tutorial. Every step is read off the board rather than off clicks: a step
   ends when the thing it asks for exists (a GPU, a deployment, a research job),
   so Elise doing it, a reload or a click elsewhere cannot leave it stuck. It
   runs at the start of every new game, and every card can skip it. */
type TutStep = {
  /* The phone tab the step runs on; the finale runs on any. */
  tab?: string;
  panel: PanelId;
  target: () => string;
  hole?: () => string[];
  below?: boolean;
  ready?: () => boolean;
  text: () => string;
  /* The step to move to now, or null to stay. */
  check?: () => string | null;
  next?: string;
  nextLabel?: string;
};
let TUT: {
    step: string;
    /* On a phone, the step each tab is on. */
    at: Record<string, string>;
    tab: string | null;
    fresh: boolean;
    closing?: boolean;
  } | null = null,
  tutShown = false;
const tutQ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tutServeDraft = () => tutQ("#servingPanel .serveJob.draft");
const tutRdDraft = () => tutQ("#rdPanel .serveJob.draft");
const tutServing = () => ensureJobs().length > 0;
const tutRdAny = () => ensureRdJobs().length > 0;
const tutRdFound = () => ensureRdJobs().some(j => j.pending);
const tutInstalled = () => Object.values(S.rdCount || {}).some(n => n > 0);
/* A step names its target and its spotlight by selector. The board draws them:
   the spotlight is one box around every hole that has a box, else the target. */
function tutVisible(sel: string) {
  const el = sel && tutQ(sel);
  return !!(el && el.isConnected && !el.hidden && el.getBoundingClientRect().width);
}
/* On a phone every panel sits on its own tab (mobile.css), so the tutorial is
   one short run of steps per tab (a step's tab), each played the first time
   the player is on that tab. TUT.at holds the step each tab is on; a tab is
   done when its run leads to a step on another tab. On a desktop the steps
   run in one line, through TUT.step. */
const tutMob = () => document.documentElement.classList.contains("mob");
const tutTab = () => document.documentElement.dataset.tab || "";
function tutCur() {
  if (!TUT) return null;
  if (TUT.closing) return "finale";
  return tutMob() ? TUT.at[tutTab()] || null : TUT.step;
}
/* The Progress panel on a laptop; on a phone that panel is taken out of flow
   and capital, time left and place sit in the fixed header. */
function tutProgressOpen() {
  const panel = document.getElementById("timePanel");
  const r = panel && panel.getBoundingClientRect();
  return !!(r && r.width > 8 && r.height > 8);
}
function tutProgressTarget() {
  if (tutProgressOpen()) return "#timePanel";
  return ["#hud .stat.money", "#tClock"].find(s => tutQ(s)) || "#timePanel";
}
function tutProgressHole() {
  if (tutProgressOpen()) return ["#timePanel"];
  return ["#hud .stat.money", "#tClock", "#tGrind"];
}
/* The step on screen now: none while its tab is closed or it cannot be done yet. */
function tutLive() {
  const cur = tutCur();
  const st = cur && TUT_STEPS[cur];
  return st && (!st.ready || st.ready()) ? st : null;
}
function tutCanResearch() {
  const unused = fleetUse().unused;
  return FLEET_ORDER.some(
    k =>
      partUnlocked(k) &&
      modelsOut().some(m => modelOnPart(m, k) && unused[k] >= rdQuantum(m, k))
  );
}
const TUT_STEPS: Record<string, TutStep> = {
  rent: {
    tab: "fleet",
    panel: "fleet",
    target: () => "#buy",
    /* The numbers only make sense with their column labels. */
    hole: () => ["#fleetTable thead", "tr:has(#buy)"],
    below: true,
    text: () =>
      "<b>Rent your first GPUs to start.</b> You start with two: one to serve a model, and a spare for R&amp;D. GPUs come with a 1-year commitment, so once you rent them, you cannot return them.",
    check: () => (S.gpus > 0 ? "serve" : null),
  },
  serve: {
    tab: "serve",
    panel: "serving",
    target: () => "#serveNew",
    hole: () => ["#servingPanel"],
    ready: () => S.gpus > 0,
    text: () =>
      "<b>This is the Serving panel.</b> A rented GPU earns nothing until a model runs on it. Click <b>+ Serve</b> to deploy an LLM on your GPU.",
    check: () => (tutServing() ? "stats" : tutServeDraft() ? "deploy" : null),
  },
  deploy: {
    tab: "serve",
    panel: "serving",
    target: () => "#servingPanel .serveJob.draft",
    text: () =>
      `<b>Choose a model and which GPU to deploy it on.</b> More models and GPU types will unlock as you progress. Click and hold <b>Deploy</b>.`,
    check: () => (tutServing() ? "stats" : tutServeDraft() ? null : "serve"),
  },
  stats: {
    tab: "stats",
    panel: "stats",
    target: () => "#statsPanel",
    next: "research",
    text: () =>
      "The <b>Stats panel</b> helps you decide what to host and where. Regularly check back to get ideas for an optimal business strategy.",
  },
  research: {
    tab: "rd",
    panel: "rd",
    target: () => "#rdNew",
    hole: () => ["#rdPanel"],
    /* Elise needs an idle GPU; until there is one (every GPU serving, or none
       rented yet) the step waits without a card and without holding the clock. */
    ready: tutCanResearch,
    text: () =>
      "<b>Make your inference faster with Elise, your recursive self-improvement AI.</b> Elise does research, so she can speed up your inference engine. A faster engine serves more tokens on the same hardware, earning more money for every GPU you have. Click <b>+ Optimize with Elise RSI</b>.",
    check: () => (tutRdAny() ? "rdRun" : tutRdDraft() ? "rdStart" : null),
  },
  rdStart: {
    tab: "rd",
    panel: "rd",
    target: () => "#rdPanel .serveJob.draft",
    text: () =>
      "<b>Choose what to optimize.</b> A speedup applies to one model on one GPU type, so pick the one you are serving. More deployments finish the research sooner. Click <b>Launch Elise RSI</b> to start.",
    check: () => (tutRdAny() ? "rdRun" : tutRdDraft() ? null : "research"),
  },
  rdRun: {
    tab: "rd",
    panel: "rd",
    target: () => (tutRdFound() ? "#rdJobs .rdHold" : "#rdJobs .rdClock"),
    /* The job stays lit so the result and the tutorial stay readable. The
       rest of the panel, including + Optimize, dims. The line points at the
       hold button once a result is in, and at the clock while Elise runs. */
    hole: () => ["#rdJobs .rdJob"],
    text: () =>
      tutRdFound()
        ? "<b>Research complete!</b> Press and hold the button to deploy the new version of your engine. That model runs faster on that GPU from now on."
        : "<b>Wait for Elise RSI to complete.</b>",
    check: () => (tutRdAny() ? null : tutInstalled() ? "end" : "research"),
  },
  /* Shown once every other step is done. Next closes the tutorial. */
  finale: {
    panel: "time",
    target: tutProgressTarget,
    hole: tutProgressHole,
    below: true,
    next: "end",
    nextLabel: "Got it",
    text: () =>
      "<b>You're ready to go!</b> Maximize the capital by the year end to get on the leaderboard.",
  },
};
function tutStart() {
  if (!S || S.dead || S.gpus > 0 || TUT) return;
  tutRestart();
}
/* Bumped per run, so each run unfolds its panels again. */
let tutRun = 0;
function tutRestart() {
  if (!S || S.dead) return;
  tutRun++;
  TUT = {
    step: "rent",
    at: { fleet: "rent", serve: "serve", stats: "stats", rd: "research" },
    tab: null,
    fresh: true,
  };
}
document.addEventListener("click", e => {
  const t = e.target as Element;
  if (!t.closest || !t.closest(".tutAgain")) return;
  e.preventDefault();
  tutRestart();
});
function tutGo(step: string) {
  if (!TUT) return;
  if (tutMob()) {
    const tab = tutTab();
    if (step !== "end" && TUT_STEPS[step].tab === tab) TUT.at[tab] = step;
    else delete TUT.at[tab];
    if (!Object.keys(TUT.at).length) return tutFinish();
  } else if (step === "end") {
    return tutFinish();
  } else {
    TUT.step = step;
  }
  TUT.fresh = true;
  if (tutShown) {
    PAUSED = manualPause || !!pauseHold();
  }
}
/* The closing card, once, when the last step would otherwise end the run.
   A second arrival (Got it) really ends it. Skip still ends immediately. */
function tutFinish() {
  if (!TUT || TUT.closing) return tutEnd();
  TUT.closing = true;
  if (tutMob()) TUT.at[tutTab()] = "finale";
  else TUT.step = "finale";
  TUT.fresh = true;
  if (tutShown) {
    PAUSED = manualPause || !!pauseHold();
  }
}
function tutEnd() {
  TUT = null;
  tutHide();
}
/* What the board draws: the card (null while hidden) and the panel to unfold. */
let tutCard: TutorialView | null = null,
  tutUnfold: UnfoldView | null = null,
  tutSeq = 0;
function tutHide() {
  tutCard = null;
  if (tutShown) {
    tutShown = false;
    tutOpt = false;
    PAUSED = manualPause || !!pauseHold();
    pushReact();
  }
  return false;
}
/* A search with no result yet. Installing a finished one does not need the clock. */
function tutOptimizing() {
  return ensureRdJobs().some(j => !j.pending);
}
let tutOpt = false;
function tutPauses() {
  /* A step that can be done now holds the clock, including while the card is
     briefly hidden between targets. A running Elise search is the exception:
     that job only finishes while time is moving. */
  return !!(tutLive() && !tutOptimizing());
}
function tutNext() {
  const cur = tutCur();
  const nx = cur && TUT_STEPS[cur].next;
  if (nx) tutGo(nx);
}
/* On a phone, the tab the tutorial waits on while this tab has nothing to
   show: the first other tab, in the order the steps run, whose step can be
   done now. Its footer button pulses until the player goes there. */
const TUT_TAB_ORDER = ["fleet", "serve", "stats", "rd"];
let tutCall: string | null = null;
function tutCallTab(): string | null {
  if (!TUT || !S || S.dead || TUT.closing || !tutMob() || tutLive()) return null;
  const here = tutTab();
  for (const tab of TUT_TAB_ORDER) {
    if (tab === here) continue;
    const st = TUT.at[tab] ? TUT_STEPS[TUT.at[tab]] : null;
    if (st && (!st.ready || st.ready())) return tab;
  }
  return null;
}
/* Runs every frame; true while the card is on screen. */
export function tutRender() {
  const shown = tutDraw();
  const call = tutCallTab();
  if (call !== tutCall) {
    tutCall = call;
    pushReact();
  }
  return shown;
}
function tutDraw() {
  if (!TUT || !S) return tutHide();
  if (tutMob() && TUT.tab !== tutTab()) {
    TUT.tab = tutTab();
    TUT.fresh = true;
  }
  for (let i = 0; i < 6 && TUT; i++) {
    const cur = tutCur();
    const nx = cur && TUT_STEPS[cur].check ? TUT_STEPS[cur].check() : null;
    if (!nx) break;
    tutGo(nx);
  }
  const st = tutLive();
  if (!st || !TUT || S.dead || topOverlay()) return tutHide();
  const cur = tutCur();
  /* Once per step, before the target is looked for: it may sit in that panel. */
  const unfold = `${tutRun}:${cur}`;
  if (st.panel && (!tutUnfold || tutUnfold.key !== unfold)) {
    tutUnfold = { key: unfold, panel: st.panel };
    pushReact();
  }
  const target = st.target ? st.target() : null;
  if (target && !tutVisible(target)) return tutHide();
  if (TUT.fresh) {
    TUT.fresh = false;
    tutSeq++;
  }
  const nx = st.next || null;
  /* On a phone a step that hands over to another tab closes this tab's run. */
  const closes = tutMob() && !!nx && !!TUT_STEPS[nx] && TUT_STEPS[nx].tab !== st.tab;
  const card: TutorialView = {
    text: st.text(),
    next: nx ? (closes ? "Got it" : st.nextLabel || "Next") : null,
    skip: nx !== "end",
    target,
    hole: st.hole ? st.hole() : null,
    below: !!st.below,
    seq: tutSeq,
  };
  const changed = JSON.stringify(card) !== JSON.stringify(tutCard);
  if (changed) tutCard = card;
  const opt = tutOptimizing();
  const appeared = !tutShown;
  if (appeared) tutShown = true;
  /* Re-apply only when the card appears or a search starts or stops.
     A pause toggle in between is the player's, and this must not undo it. */
  if (appeared || opt !== tutOpt) {
    tutOpt = opt;
    PAUSED = manualPause || !!pauseHold();
  }
  if (changed) pushReact();
  return true;
}
let fleetShown = 0,
  fleetTint = 0,
  gpuAuraGen = 0,
  modelAuraGen = 0,
  rentSizeGen = 0,
  rdGainGen = 0;
/* What is lit right now; each pulse clears its own after a while. */
let gpuAura: Record<string, boolean> = {},
  modelAura: Record<string, boolean> = {},
  rentSizeFlash = false,
  rdGain: GainFlash | null = null,
  fleetTintNow: GpuView["tint"] = "";
function animateFleetCount(to: number) {
  const from = fleetShown;
  fleetShown = to;
  fleetTintNow = to > from ? "up" : to < from ? "dn" : "";
  if (from !== to) {
    const gen = ++fleetTint;
    const tint = fleetTintNow;
    setTimeout(() => {
      if (gen !== fleetTint || fleetTintNow !== tint) return;
      fleetTintNow = "";
      pushReact();
    }, 700);
  }
  pushReact();
}
function gpuBuyRow(k: FleetPart): GpuBuyRow {
  const bk = rentBlockOf(k),
    /* the block on the button; anything over it is the top-up to a multiple */
    base = Math.min(rentBlock(), bk),
    full = bk <= 0,
    p = GPUS[k],
    unlocked = partUnlocked(k);
  const cost = `${fmt$(perDay(unlocked ? nextRentOf(k) : (p.rental || 0) * bk))}/day`;
  return {
    id: k,
    name: p.name,
    disabled: !unlocked || !!S.dead || full,
    full,
    max: FLEET_CAP,
    first: k === "h2o",
    block: base,
    extra: bk - base,
    total: (S.fleet?.[k] || 0) + bk,
    cost,
    aura: !!(gpuAura && gpuAura[k]),
    sizeFlash: !!rentSizeFlash,
  };
}
function gpuSpecTip(k: string) {
  const p = GPUS[k];
  if (!p) return "";
  const tb = p.hbm / 1e12;
  const bw =
    Math.abs(tb - Math.round(tb)) < 0.05 ? String(Math.round(tb)) : tb.toFixed(1);
  return [
    p.name,
    p.mem + " GB memory",
    bw + " TB/s bandwidth",
    fmtN(Math.round(p.peak / 1e12)) + " TFLOP/s dense FP16",
    fmtN(p.tdp) + " W",
  ]
    .concat(
      gpuDown() ? ["Offline: your GPUs are down. Serving and research are paused."] : []
    )
    .join("\n");
}
function gpuView(): GpuView {
  ensureFleet();
  const n = Math.round(S.gpus || 0);
  return {
    countLabel: `${fmtN(n)} GPU${n === 1 ? "" : "s"}`,
    penalty:
      S.breakFee > 0
        ? `Old provider ${fmt$(perDay(S.breakFee))}/day. This bill stays even with no GPUs.`
        : "",
    tint: fleetTintNow || "",
    costDay: perDay(S.costHr || 0),
    rentBlock: rentBlock(),
    types: (() => {
      const use = fleetUse();
      const disc = fleetDisc(S.gpus || 0);
      return FLEET_ORDER.map(k => {
        const count = use.rented[k] || 0;
        return {
          id: k,
          name: GPUS[k].name,
          count,
          serving: use.serving[k] || 0,
          rd: use.rd[k] || 0,
          unused: use.unused[k] || 0,
          cost: perDay(count * gpuListRent(k) * disc),
          unlocked: partUnlocked(k),
          unlock: partUnlocked(k) ? "" : `Unlocks at ${FLEET_UNLOCK[k]} GPUs`,
          aura: !!(gpuAura && gpuAura[k]),
          tip: gpuSpecTip(k),
        };
      });
    })(),
    buys: FLEET_ORDER.map(gpuBuyRow),
  };
}
function sampleNow(): ChartSample {
  return [
    S.t,
    S.money,
    (S.util || 0) * 100,
    S.costHr || 0,
    S.revHr || 0,
    Number.isFinite(S.moneyBare) ? S.moneyBare : S.money,
  ];
}
function recordChartSample() {
  if (!S.samples) S.samples = [];
  if (!S.samples.length) {
    const row = sampleNow();
    row[0] = 0;
    S.samples.push(row);
  }
  const hour = Math.min(Math.floor(S.t), Math.floor(CHART_T1));
  let last = S.samples[S.samples.length - 1][0];
  while (last < hour) {
    last += 1;
    const row = sampleNow();
    row[0] = last;
    S.samples.push(row);
  }
}
function chartPoint(p: ChartSample): ChartPoint {
  return {
    t: p[0],
    capital: p[1],
    capitalBare: Number.isFinite(p[5]) ? p[5] : p[1],
    util: p[2] || 0,
    profit: perDay((p[4] || 0) - (p[3] || 0)),
  };
}
function chartView(): ChartView {
  const s = S.samples || [],
    last = s.length ? s[s.length - 1] : null;
  return {
    points: s.map(chartPoint),
    t0: 0,
    t1: CHART_T1,
    capital: last ? fmtCapital(last[1]) : "$0",
    capitalBare: last ? fmtCapital(Number.isFinite(last[5]) ? last[5] : last[1]) : "$0",
    util: last ? Math.round(last[2] || 0) + "%" : "0%",
    profit: last ? fmt$(perDay((last[4] || 0) - (last[3] || 0))) : "$0",
  };
}
function rdView(): RdView {
  if (S && S.rdJobs) {
    for (const j of S.rdJobs.slice()) {
      if (j.pending && !(rdShownPct(j.pending.gain) > 0)) rdDiscard(j);
    }
  }
  const serving: Record<string, boolean> = {};
  ensureJobs().forEach(j => {
    serving[(j.model || "") + "\0" + fleetPart(j.part)] = true;
  });
  const models = modelsAll().map(id => ({
    id,
    name: MODELS[id] ? MODELS[id].name : id,
    released: modelReleased(id),
    aura: !!(modelAura && modelAura[id]),
  }));
  const use = fleetUse();
  const disc = fleetDisc(S.gpus || 0);
  const gpus = FLEET_ORDER.map(id => {
    const rent = gpuListRent(id) * disc;
    return {
      id,
      name: GPUS[id] ? GPUS[id].name : id,
      unlocked: partUnlocked(id),
      unlock: partUnlocked(id) ? "" : `Unlocks at ${FLEET_UNLOCK[id]} GPUs`,
      aura: !!(gpuAura && gpuAura[id]),
      unused: use.unused[id] || 0,
      rent,
    };
  });
  const boosts: RdView["boosts"] = {};
  models.forEach(m => {
    boosts[m.id] = {};
    gpus.forEach(g => {
      boosts[m.id][g.id] = rdBoostMul(m.id, g.id) * throughputMul(m.id, g.id);
    });
  });
  const serves: RdView["serving"] = {};
  const avail: RdView["avail"] = {};
  const hold: RdView["hold"] = {};
  models.forEach(m => {
    serves[m.id] = {};
    avail[m.id] = {};
    hold[m.id] = {};
    FLEET_ORDER.forEach(k => {
      serves[m.id][k] = !!serving[m.id + "\0" + k];
      avail[m.id][k] = modelOnPart(m.id, k);
      hold[m.id][k] = rdQuantum(m.id, k);
    });
  });
  return {
    models,
    gpus,
    serving: serves,
    boosts,
    avail,
    hold,
    demand: models.map(m => {
      const market = modelMarketToks(m.id);
      const share = modelShareOf(m.id);
      const yours = market * share;
      return {
        id: m.id,
        name: m.name,
        market: fmtMTps(market),
        share: (share * 100).toFixed(2) + "%",
        yours: fmtMTps(yours),
        marketToks: market,
        listed: isListed(m.id),
      };
    }),
    pick: rdPreset(),
    gain: rdGain,
    jobs: rdPruneMarks(ensureRdJobs()).map(j => {
      const k = fleetPart(j.part);
      const q = rdQuantum(j.model, k);
      const gpus = rdJobGpus(j);
      const room = (use.unused[k] || 0) + gpus;
      const pend = j.pending || null;
      const gain = pend && pend.gain > 0 ? pend.gain : 0;
      const need = (pend && pend.need) || rdPointsNeeded(rdFound(j.model, k));
      const points = pend ? pend.points | 0 : j.points | 0;
      const soFar = pend
        ? gain
        : j.roll && j.roll.chain
          ? j.roll.gain
          : rdRealized((j.roll && j.roll.gain) || 0, points, need);
      return {
        id: j.id,
        model: j.model,
        modelName: MODELS[j.model] ? MODELS[j.model].name : j.model,
        part: k,
        partName: GPUS[k].name,
        gpus,
        maxGpus: Math.floor(room / q) * q,
        quantum: q,
        phase: pend ? "found" : "search",
        spentLabel: rdClockLabel(Math.max(0, j.spent || 0)),
        dayFill: rdDayFill(Math.max(0, j.spent || 0)),
        leftLabel: pend ? "" : rdLeftLabel(rdLeftHours(j, need)),
        leftFill: pend ? 0 : rdDayFill(rdLeftHours(j, need)),
        title: pend ? pend.title : "",
        faster: gain > 0 ? Math.max(1, Math.round(gain * 100)) : 0,
        gainMul: 1 + gain,
        points,
        need,
        soFar: Math.round(soFar * 100),
        down: gpuDown() ? OUTAGE_TIP : "",
      };
    }),
  };
}
function startView(): StartView {
  return { show: !!startOpen };
}
function controlsView(): ControlsView {
  return {
    paused: !!PAUSED,
    /* The pause button (or space). A news card, the tutorial, or game over stops
       the clock without this, and those do not cut the music. */
    playerPaused: manualPause,
    toggles: pauseToggles,
    canSkip: !S.dead && !S.timeUp && (S.infinite || nowTick() < SCORE_TICK),
    music: {
      run: musicRun,
      ready: !startOpen && !TUT && !S.dead,
      over: !!S.dead || (!!S.timeUp && !S.infinite),
      year: Math.min(1, Math.max(0, (S.t || 0) / SCORE_HOURS)),
    },
  };
}
/* Game-over balance: thousands separators, cents only when the amount isn't whole. */
function fmtDie$(v: number) {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(Number(v) || 0);
  const whole = Math.abs(a - Math.round(a)) < 0.005;
  return (
    sign +
    "$" +
    a.toLocaleString(undefined, {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  );
}
function fmtCapital(v: number) {
  const n = v < 0 ? Math.ceil(v) : Math.floor(v);
  return (
    (n < 0 ? "-" : "") +
    "$" +
    Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}
function hudView(): HudView {
  const pr5 = S.prof5 || 0;
  const left = Math.max(0, SCORE_TICK - nowTick());
  const tiles: HudTile[] = [
    {
      id: "hMoney",
      label: "capital",
      value: fmtCapital(S.capitalShown != null ? S.capitalShown : S.money),
      valueClass:
        (S.capitalShown != null ? S.capitalShown : S.money) < 200 ? "neg" : "",
      trend: pr5 > 0.005 ? "up" : pr5 < -0.005 ? "down" : "",
      money: true,
      anim: "coin",
      hidden: false,
    },
    {
      id: "hPlace",
      wrap: "tGrind",
      label: "place",
      value: placeLine(standing(raceRows, S.money)),
      hidden: !!S.infinite,
      anim: "trophy",
    },
    {
      id: "hClock",
      wrap: "tClock",
      label: "time left",
      value: S.infinite ? "∞" : spanLabel(left / 20),
      hidden: !!S.infinite,
      anim: "clock",
    },
  ];
  return { tiles: tiles.filter(t => !t.hidden), frozen: !!PAUSED };
}
export function pushReact() {
  if (!window.__reactPush || !S) return;
  syncOverlayPause();
  window.__reactPush({
    tick: S.t,
    gpu: gpuView(),
    chart: chartView(),
    start: startView(),
    controls: controlsView(),
    hud: hudView(),
    rd: rdView(),
    serve: serveView(),
    event: eventView(),
    gameOver,
    score,
    board,
    tutorial: tutCard,
    unfold: tutUnfold,
    tutCall,
  });
}
let newsSeq = 1;
function news(html: string, cls?: string, month?: string) {
  if (HEADLESS) return;
  const item = { id: newsSeq++, html, cls: cls || "", month: month || "" };
  if (window.__pushNews) window.__pushNews(item);
}
function clearLog() {
  if (window.__clearNews) window.__clearNews();
}
function monthIndex(simH: number) {
  const cal = toCalHours(simH);
  return Math.max(0, Math.min(11, Math.floor((cal / YEAR_HOURS) * 12)));
}
/* Capital from the first hour through the moment it crossed zero. */
function capitalSeries() {
  const pts: [number, number][] = [];
  (S.samples || []).forEach(p => {
    if (p && Number.isFinite(p[1])) pts.push([p[0], p[1]]);
  });
  if (!pts.length || pts[0][0] > 0) pts.unshift([0, START_STATE.capital]);
  const endT = Math.max(S.t || 0, pts[pts.length - 1][0]);
  if (endT > pts[pts.length - 1][0] + 1e-4) pts.push([endT, S.money]);
  else pts[pts.length - 1][1] = S.money;
  return pts;
}
/* One line of business advice on the game-over screen, drawn fresh each time. */
const DIE_ADVICE = [
  "Your market share lags your capacity. It takes time for clients to notice your offering. Start serving early to get a head start.",
  "Pay attention to the Stats panel. It contains all information required to decide which models to serve.",
  "It's easier to optimize software for AMB GPUs. Give it a try.",
  "When running Elise, get results faster by giving it more resources. If you can afford it, it might be worth getting a faster engine before serving the model.",
  "If you need time to think, click a Pause button.",
];
/* The game-over screen, frozen at the moment the run is lost; null while alive. */
let gameOver: GameOverView | null = null;
function die(title: string, why: string, num: string) {
  S.dead = true;
  PAUSED = true;
  if (HEADLESS) return;
  recordEnd("bankrupt");
  gameOver = {
    title,
    why,
    num,
    advice: DIE_ADVICE[(Math.random() * DIE_ADVICE.length) | 0],
    capital: capitalSeries(),
    monthHours: monthHours(),
  };
  pushReact();
}
function restart(seed?: number) {
  seed =
    seed !== undefined && Number.isInteger(seed) && seed > 0
      ? seed >>> 0 || 1
      : drawSeed();
  if (TUT) tutEnd();
  musicRun++;
  eventHold = false;
  gameOver = null;
  rdLastT = 0;
  fleetTint++;
  gpuAuraGen++;
  modelAuraGen++;
  rentSizeGen++;
  rdGainGen++;
  gpuAura = {};
  modelAura = {};
  rentSizeFlash = false;
  rdGain = null;
  fleetTintNow = "";
  setState(fresh());
  fleetShown = S.gpus;
  resetRng(seed);
  EVENTS = [];
  RUN = {
    seed,
    capital: S.money,
    gpus: S.gpus,
    model: START_STATE.model,
    price: START_STATE.price,
  };
  manualPause = false;
  PAUSED = true;
  score = null;
  board = null;
  clearLog();
  news(
    INFO_MARK +
      ' Welcome to MakerMaker inference machine. You\'ll find world events here. Under "serving", deploy models to serve customers. Under "R&D", use idle GPUs to improve your inference engine. Your goal is to maximize your profit by the year end. <a class="tutAgain" role="button">View the tutorial again?</a>',
    "",
    "Jan"
  );
  {
    const rent = rentalHr();
    S.costHr = rent;
    S.costS = S.costHr;
    S.revHr = 0;
    S.revS = 0;
    S.prof5 = -S.costHr;
  } // the tiles open on the real bill, not on a five-second ramp from zero
  try {
    pushReact();
  } catch {
    /* a broken view must not stop the run from starting */
  }
}
let startOpen = true;
/* Bumped by each restart, so the music starts each run from the drums again. */
let musicRun = 0;
function showStart() {
  startOpen = true;
  restart();
  PAUSED = true;
  pushReact();
}
function play() {
  startOpen = false;
  restart();
  recordStart();
  PAUSED = false;
  pushReact();
  tutStart();
}
/* Same steps the live clock runs, about one calendar day per frame, so a skip
   can still stop on a month event instead of blowing past it. */
let FAST = false;
const SKIP_HOURS: Record<string, () => number> = {
  day: () => acctDay(),
  week: () => 7 * acctDay(),
  month: () => monthHours(),
};
function skipTime(span: string) {
  const hoursOf = SKIP_HOURS[span];
  if (!hoursOf || FAST) return;
  if (S.dead || S.timeUp) return;
  if (!S.infinite && nowTick() >= SCORE_TICK) {
    showScore();
    return;
  }
  /* Infinite mode has no year end to stop at. */
  const endAt = S.infinite ? Infinity : SCORE_TICK;
  const spanTicks = Math.max(1, Math.round(hoursOf() * 20));
  const endTick = Math.min(endAt, nowTick() + spanTicks);
  FAST = true;
  const step = () => {
    const target = Math.min(endTick, nowTick() + 80);
    while (!S.dead && !S.timeUp && nowTick() < target && !eventHold) {
      tick(0.05);
      checkRdJobs();
      checkMonthEvents();
      if (eventHold) break;
    }
    try {
      paintRace();
      pushReact();
    } catch {
      /* a broken view must not stop the fast-forward */
    }
    if (!S.dead && !S.timeUp && nowTick() < endTick && !eventHold) {
      requestAnimationFrame(step);
      return;
    }
    FAST = false;
    try {
      pushReact();
    } catch {
      /* the next frame paints again */
    }
  };
  requestAnimationFrame(step);
}

function contestBlurb() {
  return `The score is your capital after 1 year. Can you build a successful inference business?`;
}
/* The board shows its top 10 as they are, pending rows included. One name,
   one row: the higher score is the one that shows. Getting on it is the
   server's rule: beat the 10th verified row. So a run below a pending row can
   still place, and is then shown past the 10th. */
/* A row as the server sends it. */
type LbEntry = { name: string; score: number; pending?: boolean };
type StandRow = LbEntry & { you: boolean };
type Standing = { board: StandRow[]; place: number; onBoard: boolean };
function standing(rows: LbEntry[], mine: number): Standing {
  const seen = new Set<string>();
  const all = rows
    .filter(r => r && /^[A-Z]{3}$/.test(r.name) && Number.isFinite(Number(r.score)))
    .map(r => ({
      name: r.name,
      score: Number(r.score),
      you: false,
      pending: !!r.pending,
    }))
    .sort((a, b) => b.score - a.score)
    .filter(r => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });
  const bar = all.filter(r => !r.pending);
  const onBoard = bar.length < 10 || mine > bar[9].score;
  let board: StandRow[], place: number;
  if (onBoard) {
    place = all.findIndex(r => mine > r.score);
    if (place < 0) place = all.length;
    board = all.slice(0, Math.max(10, place));
    board.splice(place, 0, { name: "YOU", score: mine, you: true });
    if (board.length > 10) board.length = Math.max(10, place + 1);
  } else {
    board = all.slice(0, 10);
    place = board.length;
  }
  return { board, place, onBoard };
}
/* One leaderboard row as the score screen and the board draw it. */
function lbRow(r: LbEntry, rank: string, you?: boolean): LbRow {
  return {
    rank,
    name: r.name,
    score: fmt$(r.score),
    you: !!you,
    pending: !!r.pending,
  };
}
/* A null between rows is the gap before a run that placed past the 10th. */
function standingRows(st: Standing) {
  const rows: (LbRow | null)[] = st.board.map((r, i) =>
    lbRow(r, String(i + 1).padStart(2, "0"), r.you)
  );
  if (!st.onBoard) rows.push(null, lbRow({ name: "YOU", score: S.money }, "11+", true));
  return rows;
}
function scoreCapitalLine() {
  const start = START_STATE.capital;
  const n = S.gpus || 0;
  return `You rented ${n} GPU${n === 1 ? "" : "s"} and turned ${gap$(start)} into`;
}
/* The year-end screen; null while it is closed. */
let score: ScoreView | null = null;
let scoreSeq = 0;
function setScore(patch: Partial<ScoreView>) {
  if (!score) return;
  score = { ...score, ...patch };
  pushReact();
}
function paintScore(rows: LbEntry[]) {
  const st = standing(rows, S.money);
  setScore({
    title: "Top " + (st.place + 1) + "!",
    line: scoreCapitalLine(),
    loading: false,
    note: "",
    rows: standingRows(st),
    naming: st.onBoard,
    saving: false,
    error: "",
    share: shareCaption(st.onBoard ? st.place + 1 : null),
  });
}
let raceRows: LbEntry[] = [],
  raceAt = 0,
  raceOk = false;
function gap$(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) {
    const m = a / 1e6;
    return "$" + (m >= 10 ? Math.round(m) : Math.round(m * 10) / 10) + "M";
  }
  if (a >= 1000) return "$" + Math.round(a / 1000) + "k";
  return fmt$(a);
}
function placeLine(st: Standing) {
  const above = st.place > 0 ? st.board[st.place - 1] : null;
  if (!above || above.you) return "Top " + (st.place + 1) + ". Keep going";
  return gap$(Math.max(0, above.score - S.money)) + " to advance to Top " + st.place;
}
function spanLabel(hours: number) {
  hours = Math.max(0, Math.floor(toCalHours(hours)));
  const weeks = Math.floor(hours / 168),
    days = Math.floor((hours % 168) / 24);
  const bit = (n: number, one: string, many: string) =>
    n + " " + (n === 1 ? one : many);
  return bit(weeks, "week", "weeks") + ", " + bit(days, "day", "days");
}
/* Same year as the clock above. Days stay as words. The hour within the day
   is 0–4 segment-fills on a four-part circle in the R&D panel. */
function rdCal(hours: number) {
  return Math.max(0, toCalHours(hours));
}
function rdClockLabel(hours: number) {
  const days = Math.floor(rdCal(hours) / 24);
  if (days === 1) return "1 day";
  return `${days} days`;
}
function rdDayFill(hours: number) {
  return (rdCal(hours) % 24) / 6;
}
/* Time left on a run, as an estimate. Each research point lands after a random,
   memoryless wait (the seeded draws in checkRdJobs), so there is no true finish
   time to show. Instead: the expected wait for every point still to find, the
   same sum rdForecast shows before launch, less the time already spent on the
   current point, so it counts down smoothly and resets as each point lands.
   View only: it reads S and never draws, so replays are unchanged. */
const rdPointFrom = new Map<string, { points: number; spent: number }>();
function rdPruneMarks(jobs: RdJob[]) {
  for (const id of rdPointFrom.keys()) {
    if (!jobs.some(j => j.id === id)) rdPointFrom.delete(id);
  }
  return jobs;
}
function rdLeftHours(j: RdJob, need: number) {
  const spent = Math.max(0, j.spent || 0);
  const points = j.points | 0;
  let mark = rdPointFrom.get(j.id);
  if (!mark || mark.points !== points || mark.spent > spent) {
    mark = { points, spent };
    rdPointFrom.set(j.id, mark);
  }
  const part = fleetPart(j.part);
  const n = rdJobGpus(j);
  let hours = 0;
  for (let k = points; k < need; k++) hours += rdMeanHours(j.model, part, n, k);
  if (hours === Infinity) return Infinity;
  hours -= spent - mark.spent;
  if (j.id === RD_FIRST_ID) hours = Math.min(hours, RD_FIRST_MAX_H - spent);
  return Math.max(0, hours);
}
function rdLeftLabel(hours: number) {
  if (hours === Infinity) return "–";
  const days = Math.floor(rdCal(hours) / 24);
  if (days < 1) return "< 1 day";
  return days === 1 ? "~1 day" : `~${days} days`;
}
export function paintRace() {
  if (S.infinite) return;
  if (typeof fetch !== "function") return;
  const now = performance.now();
  if (now - raceAt < (raceOk ? 20000 : 3000)) return;
  raceAt = now;
  fetch(lbUrl(scoreApi()))
    .then(
      (r): Promise<ApiBody> => r.json(),
      () => null
    )
    .then(body => {
      noteGameVersion(body);
      if (!body || !body.ok || !Array.isArray(body.rows)) return;
      raceRows = body.rows;
      raceOk = true;
    });
}
/* The leaderboard popup; null while it is closed. */
/* What the leaderboard server answers; every field is optional. */
type ApiBody = {
  ok?: boolean;
  version?: string;
  rows?: LbEntry[];
  leaderboard?: LbEntry[];
  place?: number;
  score?: number;
  status?: string;
  errors?: { message?: string }[];
  url?: string;
  object?: string;
  headers?: Record<string, string>;
} | null;
let board: BoardView | null = null;
let boardSeq = 0;
function paintBoard(rows: LbEntry[]) {
  if (!board) return;
  board = { ...board, note: "", rows: standingRows(standing(rows, S.money)) };
  pushReact();
}
function openBoard() {
  const view = ++boardSeq;
  board = { id: view, blurb: contestBlurb(), rows: [], note: "" };
  pushReact();
  if (typeof fetch !== "function") {
    paintBoard([]);
    return;
  }
  fetch(lbUrl(scoreApi()))
    .then(
      (r): Promise<ApiBody> => r.json(),
      () => null
    )
    .then(body => {
      noteGameVersion(body);
      if (!board || board.id !== view) return;
      if (!body || !body.ok || !Array.isArray(body.rows)) {
        board = { ...board, rows: [], note: "The board could not be loaded." };
        pushReact();
        return;
      }
      paintBoard(body.rows);
    });
}
function closeBoard() {
  if (!board) return;
  board = null;
  pushReact();
}
function runId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/* Anonymous and per browser: it tells players and their repeat games apart, nothing more. */
function playerId() {
  try {
    let id = localStorage.getItem("im_player");
    if (!id) {
      id = runId();
      localStorage.setItem("im_player", id);
    }
    return id;
  } catch {
    return null;
  }
}
/* Play analytics, one Firestore "events" row per call; not the run's EVENTS log. */
function logPlay(type: string, fields?: Record<string, unknown>) {
  if (HEADLESS || typeof fetch !== "function") return;
  fetch(scoreApi() + "/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type,
      run: (S && S.run) || null,
      player: playerId(),
      version: GAME_VERSION,
      ...fields,
    }),
  }).catch(() => {});
}
/* The mute buttons are React, outside the engine; each press tells us with this event.
   A press on the start screen comes before the run has an id. */
if (!HEADLESS)
  addEventListener("mkmk:mute", e =>
    logPlay("mute", {
      muted: !!(e as CustomEvent<{ muted?: boolean } | null>).detail?.muted,
      month: S && S.run ? monthIndex(S.t) + 1 : null,
    })
  );
/* The same for the three links to the blog (blogLink.ts): which one was pressed. */
if (!HEADLESS)
  addEventListener("mkmk:blog", e =>
    logPlay("blog", {
      link: (e as CustomEvent<{ link?: string } | null>).detail?.link,
      month: S && S.run ? monthIndex(S.t) + 1 : null,
    })
  );
/* The run id, drawn at Start, ties the analytics start and end rows together. */
function recordStart() {
  S.run = runId();
  logPlay("start");
}
/* Once per run, at the year end or at bankruptcy, whether or not the player puts
   a name on the board. */
function recordEnd(outcome: string) {
  if (S.endSent) return;
  S.endSent = true;
  logPlay("end", {
    outcome,
    score: S.money,
    month: monthIndex(S.t) + 1,
    active_seconds: Math.round(S.activeSec || 0),
  });
}
/* Seconds of real play: the tab is visible, a run is under way, the player has not paused it themselves, and they
   touched something in the last two minutes. An open event card counts. */
const IDLE_MS = 120000;
if (!HEADLESS) {
  let lastInput = performance.now(),
    activeAt = performance.now();
  for (const type of ["pointerdown", "pointermove", "keydown", "wheel"])
    addEventListener(type, () => (lastInput = performance.now()), { passive: true });
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(now - activeAt, 5000);
    activeAt = now;
    if (!S || startOpen || manualPause || S.dead || S.timeUp || S.endSent) return;
    if (document.visibilityState !== "visible" || now - lastInput > IDLE_MS) return;
    S.activeSec = (S.activeSec || 0) + dt / 1000;
  }, 1000);
}
function showScore() {
  PAUSED = true;
  if (HEADLESS) {
    S.timeUp = true;
    return;
  }
  recordEnd("year_end");
  board = null;
  const view = ++scoreSeq;
  score = {
    id: view,
    title: "",
    line: scoreCapitalLine(),
    money: fmt$(S.money),
    loading: true,
    note: "",
    rows: [],
    naming: false,
    saving: false,
    error: "",
    share: shareCaption(),
  };
  pushReact();
  if (typeof fetch !== "function") {
    paintScore([]);
    return;
  }
  fetch(lbUrl(scoreApi()))
    .then(
      (r): Promise<ApiBody> => r.json(),
      () => null
    )
    .then(body => {
      noteGameVersion(body);
      if (!score || score.id !== view) return;
      if (!body || !body.ok || !Array.isArray(body.rows)) {
        setScore({ loading: false, note: "The board could not be loaded." });
        return;
      }
      paintScore(body.rows);
    });
}
function closeScore() {
  score = null;
  pushReact();
}
function infiniteMode() {
  S.infinite = true;
  S.timeUp = false;
  closeScore();
}
function cachedGameVersion() {
  try {
    const v = localStorage.getItem("mkmkGameVersion");
    if (v) return v;
    localStorage.setItem("mkmkGameVersion", GAME_VERSION);
  } catch {
    /* storage blocked: use the loaded version */
  }
  return GAME_VERSION;
}
function noteGameVersion(body: ApiBody) {
  if (HEADLESS || !body || typeof body.version !== "string" || !body.version) return;
  const cached = cachedGameVersion();
  if (body.version === cached && body.version === GAME_VERSION) return;
  try {
    localStorage.setItem("mkmkGameVersion", body.version);
  } catch {
    /* storage blocked: the once-per-session guard below still holds */
  }
  if (body.version === GAME_VERSION) return;
  const once = "mkmkReload:" + body.version;
  try {
    if (sessionStorage.getItem(once)) return;
    sessionStorage.setItem(once, "1");
  } catch {
    /* storage blocked: reload anyway */
  }
  const u = new URL(location.href);
  u.searchParams.set("v", body.version);
  location.replace(u.toString());
}
function scoreApi() {
  /* ?api= is for development; on the live site a link could point the board elsewhere. */
  if (
    location.hostname === "inference-game.makermaker.ai" ||
    /\.run\.app$/.test(location.hostname)
  )
    return "";
  const q = new URLSearchParams(location.search).get("api");
  if (q != null && q !== "") return q.replace(/\/$/, "");
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    return "http://127.0.0.1:8080";
  return "https://inference-game.makermaker.ai";
}
if (!HEADLESS && typeof fetch === "function")
  fetch(scoreApi() + "/health")
    .then(
      (r): Promise<ApiBody> => r.json(),
      () => null
    )
    .then(noteGameVersion);
function lbUrl(api: string) {
  return api + "/leaderboard";
}
function localApi(api: string) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api);
}
const VERIFY = "Couldn't verify your submission. Try again later";
function saveFailed(msg?: string) {
  setScore({ saving: false, error: msg || "The board did not take the run." });
}
function saveDone(name: string, body: NonNullable<ApiBody>) {
  const patch: Partial<ScoreView> = { naming: false, saving: false };
  if (Array.isArray(body.leaderboard)) {
    patch.note = "";
    if (body.place) {
      patch.title = "Top " + body.place + "!";
      patch.share = shareCaption(body.place);
    }
    patch.rows = body.leaderboard
      .slice(0, Math.max(10, body.place || 0))
      .map((r, i) =>
        lbRow(
          r,
          String(i + 1).padStart(2, "0"),
          r.name === name && r.score === body.score
        )
      );
  }
  if (body && body.status === "queued")
    patch.note = "Your score is on the leaderboard, congratulations!";
  setScore(patch);
}
type Saved = { ok: boolean; body: ApiBody };
function readSave(r: Response): Promise<Saved> {
  return r.json().then(
    (body: ApiBody) => ({ ok: r.ok, body }),
    () => ({ ok: false, body: null })
  );
}
const unsaved = (): Saved => ({ ok: false, body: null });
function saveHighscore(typed: string) {
  if (!score || !score.naming || score.saving) return;
  const name = cleanName(String(typed || ""));
  if (!nameOk(name)) return;
  const doc = eventsDocument();
  doc.name = name;
  setScore({ saving: true, error: "" });
  const api = scoreApi();
  const raw = JSON.stringify(doc);
  if (!localApi(api)) {
    if (raw.length > 1048576) {
      saveFailed("This run is over 1 MB.");
      return;
    }
    fetch(api + "/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then(readSave, unsaved)
      .then(ticket => {
        const { url, object, headers } = ticket.body || {};
        if (!ticket.ok || !url || !object) {
          saveFailed(ticket.body?.errors?.[0]?.message);
          return;
        }
        return fetch(url, {
          method: "PUT",
          headers,
          body: raw,
        }).then(
          put => {
            if (!put.ok) {
              saveFailed("The trajectory upload was rejected.");
              return;
            }
            return fetch(lbUrl(api), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, object }),
            }).then(readSave, unsaved);
          },
          () => saveFailed("The trajectory upload was rejected.")
        );
      })
      .then(res => {
        if (!res) return;
        if (!res.ok || !res.body || !res.body.ok) {
          saveFailed(VERIFY);
          return;
        }
        saveDone(name, res.body);
      })
      .catch(() => saveFailed());
    return;
  }
  fetch(lbUrl(api), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  })
    .then(readSave, unsaved)
    .then(({ ok, body }) => {
      if (!ok || !body || !body.ok) {
        saveFailed(VERIFY);
        return;
      }
      saveDone(name, body);
    })
    .catch(() => saveFailed());
}
/* The closing line of a share post: the player's place on the leaderboard when
   there is one to state, otherwise just the challenge. */
function shareRankLine(rank: number | null) {
  return rank != null && rank > 0
    ? `I'm currently #${rank} on the leaderboard, think you can do better?`
    : "Can you do better?";
}
/* The year-end post, in the past tense: the run is over. */
function shareCaption(rank: number | null = null) {
  return `I ran an inference machine in @makermaker_ai's new mini-game, ${SHARE_URL}.\n\nI optimized the inference stack, business model, and got an initial ${fmt$(START_STATE.capital)} to ${fmt$(S.money)}. ${shareRankLine(rank)}`;
}
/* The post behind the X button in the header, while the run is still going: present
   tense, today's capital, and the place the "place" tile shows. Once the run is
   over (bankrupt, or the year is up outside infinite mode) it is the year-end post. */
function shareNowText() {
  if (!S) return shareCaption();
  const st = raceOk ? standing(raceRows, S.money) : null;
  const rank = st && st.onBoard ? st.place + 1 : null;
  if (S.dead || (S.timeUp && !S.infinite)) return shareCaption(rank);
  return `I'm running an inference machine in @makermaker_ai's new mini-game, ${SHARE_URL}.\n\nI'm optimizing the inference stack and business model, and I've taken an initial ${fmt$(START_STATE.capital)} to ${fmt$(S.money)}, and climbing! ${shareRankLine(rank)}`;
}
/* One rule decides whether the clock runs, and it runs in both directions:
   the clock stops while something is genuinely in front of the player - a
   pop-up or the game-over screen - and starts again
   by itself the moment the last of them closes.

   Each overlay's close handler is not trusted to resume: deriving the state
   from what is on screen means it cannot get stuck. */
let manualPause = false;
function pauseHold(): string | null {
  if (FAST) return "the clock is fast-forwarding";
  if (S.dead) return "dead";
  if (tutPauses()) return "the tutorial is waiting for you";
  if (topOverlay()) return "the clock is stopped while this is open";
  return null;
}
/* The watchdog. Several places set PAUSED=true and trust something else to put
   it back: an overlay closing, the tutorial moving on, a fast-forward ending.
   Any one of them that does not happen would leave the clock stopped with
   nothing on screen to click.

   So the loop reconciles the clock against reality every frame instead of
   trusting it: if it is stopped and nothing is actually holding it, it starts
   again. The player's own PAUSE is the one hold that is not derived from the
   screen, so it is tracked explicitly and this never overrides it. This cannot
   freeze; the worst it can do is start a clock a frame early. */
/* One report per distinct broken draw, not one per frame. */
export const drawFailed = new Set<string>();
export function healPause() {
  if (PAUSED && !manualPause && !pauseHold()) {
    window.__healed = (window.__healed || 0) + 1;
    PAUSED = false;
  }
}
function syncPaused() {
  PAUSED = !!pauseHold();
}
/* Popups React opens on its own, with no engine state behind them (the R&D
   reveal): each holds the clock by its overlay id while it is open. */
const uiHolds = new Set<string>();
function holdClock(id: string, on: boolean) {
  const had = uiHolds.has(id);
  if (on) uiHolds.add(id);
  else uiHolds.delete(id);
  if (had === on) return;
  PAUSED = manualPause || !!pauseHold();
  pushReact();
}
/* The popup in front, by the id React gives it; null when none is open. */
function topOverlay(): string | null {
  if (uiHolds.size) return [...uiHolds][uiHolds.size - 1];
  if (score) return "ovScore";
  if (board) return "ovBoard";
  if (eventView()) return "ovEvent";
  if (gameOver) return "ovDie";
  if (startOpen) return "ovStart";
  return null;
}
/* Re-derive the clock hold whenever a popup opens or closes, and only then, so a
   pause of the player's own survives everything else. */
let overlaysOpen = "";
function syncOverlayPause() {
  const open = [score, board, eventView(), gameOver, startOpen].map(Boolean).join();
  if (open === overlaysOpen) return;
  overlaysOpen = open;
  syncPaused();
}
/* The numbers this deploy just moved stay yellow long enough to notice. */
const RD_GAIN_MS = 5000;
function pulseRdGain(model: string, part: string) {
  const gen = ++rdGainGen;
  rdGain = { model, part, gen };
  setTimeout(() => {
    if (gen !== rdGainGen) return;
    rdGain = null;
    pushReact();
  }, RD_GAIN_MS);
}
function pulseModelAura(ids: string[]) {
  if (!ids.length) return;
  const gen = ++modelAuraGen;
  modelAura = Object.fromEntries(ids.map(id => [id, true]));
  pushReact();
  setTimeout(() => {
    if (gen !== modelAuraGen) return;
    modelAura = {};
    pushReact();
  }, 3800);
}
function pulseGpuAura(keys: string[]) {
  if (!keys.length) return;
  const gen = ++gpuAuraGen;
  gpuAura = Object.fromEntries(keys.map(k => [k, true]));
  setTimeout(() => {
    if (gen !== gpuAuraGen) return;
    gpuAura = {};
    pushReact();
  }, 3800);
}
function pulseRentSize() {
  const gen = ++rentSizeGen;
  rentSizeFlash = true;
  setTimeout(() => {
    if (gen !== rentSizeGen) return;
    rentSizeFlash = false;
    pushReact();
  }, 3800);
}
function announceFleetNews(prev: number) {
  const now = S.gpus || 0;
  if (now <= prev) return;
  const unlocked: string[] = [];
  for (const k of FLEET_ORDER) {
    const need = FLEET_UNLOCK[k] || 0;
    if (need > 0 && prev < need && now >= need) {
      queueOrNews(
        `${INFO_MARK} New cloud providers are interested in working with you. <span class="nNum">${GPUS[k].name}</span> GPUs are now available.`,
        "imp"
      );
      unlocked.push(k);
    }
  }
  pulseGpuAura(unlocked);
  const after = rentBlockAt(now);
  if (after > rentBlockAt(prev)) {
    queueOrNews(
      `${INFO_MARK} With the size of your GPU fleet, the GPUs you rent from now on get a better price. You also have to rent GPUs in multiples of <span class="nNum">${after}</span>.`,
      "imp"
    );
    pulseRentSize();
  }
}
function rentNow(part: string) {
  if (S.dead) return;
  const k = fleetPart(part);
  if (!partUnlocked(k)) return;
  const n = rentBlockOf(k);
  if (n <= 0) return;
  const prevGpus = S.gpus || 0;
  addToFleet(k, n);
  announceFleetNews(prevGpus);
  animateFleetCount(S.gpus);
  record("rent", { n, part: k });
}
function priceServingJobs() {
  for (const j of ensureJobs()) {
    if (isMine(j.model) || !MODELS[j.model]) continue;
    j.price = listPricePerM(j.model);
  }
}
function serveAdd(model: string, partIn: string, copies: number) {
  if (S.dead) return false;
  ensureJobs();
  const part = fleetPart(partIn);
  copies = Math.max(1, copies | 0);
  const okModel = isMine(model) || (MODELS[model] && modelsOut().indexOf(model) >= 0);
  if (!okModel) return false;
  if (!partUnlocked(part) || !modelOnPart(model, part)) return false;
  const per = unitsToHold(part, model);
  const unused = fleetUse().unused[part] || 0;
  if (copies * per > unused) return false;
  const exist = S.jobs.find(j => j.model === model && fleetPart(j.part) === part);
  if (exist) exist.copies += copies;
  else {
    S.nextJob = S.nextJob || 1;
    S.jobs.push({ id: "s" + S.nextJob++, model, part, copies });
  }
  priceServingJobs();
  if (!isMine(model)) catchUpShare(model); // earns from the moment it lands
  record("serve", { op: "add", model, part, copies });
  rememberServe(model, part);
  pushReact();
  return true;
}
function serveSetCopies(id: string, copies: number) {
  if (S.dead) return false;
  const j = ensureJobs().find(x => x.id === id);
  if (!j) return false;
  copies = copies | 0;
  if (copies <= 0) return serveRemove(id);
  const per = unitsToHold(j.part, j.model);
  const room = (fleetUse().unused[fleetPart(j.part)] || 0) + jobGpus(j);
  const max = Math.floor(room / per);
  j.copies = Math.min(copies, max);
  if (j.copies < 1) return serveRemove(id);
  priceServingJobs();
  if (!isMine(j.model)) catchUpShare(j.model); // added copies earn at once too
  record("serve", { op: "set", id, copies: j.copies });
  pushReact();
  return true;
}
function serveRemove(id: string) {
  if (S.dead) return false;
  const jobs = ensureJobs();
  const j = jobs.find(x => x.id === id);
  if (!j) return false;
  S.jobs = jobs.filter(x => x.id !== id);
  priceServingJobs();
  record("serve", { op: "rm", id });
  pushReact();
  return true;
}
function rdSnap(gpus: number, quantum: number) {
  return Math.floor(Math.max(0, gpus | 0) / quantum) * quantum;
}
function rememberServe(model: string, part: string) {
  if (isMine(model) || !MODELS[model]) return;
  S.servePick = { model, part: fleetPart(part) };
}
function rememberRd(model: string, part: string) {
  if (!MODELS[model]) return;
  S.rdPick = { model, part: fleetPart(part) };
}
/* The new Elise form opens on the last model and GPU researched. The first
   research run opens on the last model deployed, and the GPU it was deployed on. */
function rdPreset(): ModelPick | null {
  const pair = (model: string | null | undefined, part: string | null | undefined) =>
    model && MODELS[model] && !isMine(model) ? { model, part: fleetPart(part) } : null;
  const picked = pair(S.rdPick && S.rdPick.model, S.rdPick && S.rdPick.part);
  if (picked) return picked;
  const research = ensureRdJobs();
  if (research.length) {
    const j = research[research.length - 1];
    return pair(j.model, j.part);
  }
  const served = pair(
    S.servePick && S.servePick.model,
    S.servePick && S.servePick.part
  );
  if (served) return served;
  const jobs = ensureJobs().filter(j => !isMine(j.model) && MODELS[j.model]);
  if (!jobs.length) return null;
  const j = jobs[jobs.length - 1];
  return pair(j.model, j.part);
}
function rdAdd(model: string, partIn: string, gpus: number) {
  if (S.dead) return false;
  ensureRdJobs();
  const part = fleetPart(partIn);
  if (!MODELS[model] || modelsOut().indexOf(model) < 0) return false;
  if (!partUnlocked(part) || !modelOnPart(model, part)) return false;
  const q = rdQuantum(model, part);
  let g = rdSnap(gpus, q);
  const unused = fleetUse().unused[part] || 0;
  const exist = S.rdJobs.find(j => j.model === model && fleetPart(j.part) === part);
  if (exist) {
    if (exist.pending) return false;
    const add = Math.min(g, rdSnap(unused, q));
    if (add < q) return false;
    exist.gpus += add;
    rememberRd(model, part);
    record("rd", { op: "add", model, part, gpus: add });
    pushReact();
    return true;
  }
  g = Math.min(g, rdSnap(unused, q));
  if (g < q) return false;
  if (Math.round(rdMeanGain(model, part) * 100) < 1) return false;
  S.nextRdJob = S.nextRdJob || 1;
  const job: RdJob = {
    id: "r" + S.nextRdJob++,
    model,
    part,
    gpus: g,
    spent: 0,
    points: 0,
    roll: null,
    pending: null,
  };
  S.rdJobs.push(job);
  rememberRd(model, part);
  record("rd", { op: "add", model, part, gpus: g });
  pushReact();
  return true;
}
/* Mean calendar days to the next improvement and its mean gain in percent, for
   a draft of `gpus` more GPUs. An open search on the pair keeps its points. */
function rdForecast(model: string, partIn: string, gpus: number) {
  if (!S || !MODELS[model]) return null;
  const part = fleetPart(partIn);
  const exist = ensureRdJobs().find(
    j => j.model === model && fleetPart(j.part) === part
  );
  const n = Math.max(0, gpus | 0) + (exist ? rdJobGpus(exist) : 0);
  const from = exist ? exist.points | 0 : 0;
  const found = rdFound(model, part);
  let hours = 0;
  for (let k = from; k < rdPointsNeeded(found); k++)
    hours += rdMeanHours(model, part, n, k);
  return {
    days: hours === Infinity ? null : rdCal(hours) / 24,
    pct: Math.round(rdMeanGain(model, part) * 100),
  };
}
function rdSetGpus(id: string, gpus: number) {
  if (S.dead) return false;
  const j = ensureRdJobs().find(x => x.id === id);
  if (!j || j.pending) return false;
  const k = fleetPart(j.part);
  const q = rdQuantum(j.model, k);
  const room = rdSnap((fleetUse().unused[k] || 0) + rdJobGpus(j), q);
  const g = Math.min(rdSnap(gpus, q), room);
  if (g < q) return false;
  j.gpus = g;
  record("rd", { op: "set", id, gpus: j.gpus });
  pushReact();
  return true;
}
function rdRemove(id: string) {
  if (S.dead) return false;
  const jobs = ensureRdJobs();
  const j = jobs.find(x => x.id === id);
  if (!j) return false;
  S.rdJobs = jobs.filter(x => x.id !== id);
  record("rd", { op: "rm", id });
  pushReact();
  return true;
}
function rdBeginRoll(j: RdJob) {
  const k = fleetPart(j.part);
  const chain = rdGainChain(j.model, k);
  if (!chain) return false;
  j.roll = {
    gain: 0,
    title: pickImprovement(),
    chain,
  };
  return true;
}
function rdAdvanceRoll(j: RdJob, points: number, need: number) {
  if (!j.roll && !rdBeginRoll(j)) return false;
  /* Progressed saves from the fixed-roll build have no chain. Their sampled
     outcome remains fixed and rdOffer applies the old synergy curve. */
  if (!j.roll || !j.roll.chain) return !!j.roll;
  const next = rdGainStep(
    j.roll.gain,
    j.roll.chain.remaining,
    j.roll.chain.betaB,
    points,
    need
  );
  j.roll.gain = next.gain;
  j.roll.chain.remaining = next.remaining;
  return true;
}
function rdShownPct(gain: number) {
  return Math.round((gain > 0 ? gain : 0) * 100);
}
/* A find that rounds to 0% is not an install. Drop the run and free its GPUs. */
function rdDiscard(j: RdJob) {
  const jobs = ensureRdJobs();
  if (!jobs.some(x => x.id === j.id)) return;
  S.rdJobs = jobs.filter(x => x.id !== j.id);
}
function rdOffer(j: RdJob) {
  const k = fleetPart(j.part);
  const need = rdPointsNeeded(rdFound(j.model, k));
  const points = Math.min(need, j.points | 0);
  const roll = j.roll || { gain: 0, title: "" };
  const gain = roll.chain ? roll.gain : rdRealized(roll.gain, points, need);
  if (!(rdShownPct(gain) > 0)) {
    rdDiscard(j);
    return;
  }
  j.pending = { gain, title: roll.title, full: roll.gain || 0, points, need };
  j.roll = null;
}
function rdTerminate(id: string) {
  if (S.dead) return false;
  const j = ensureRdJobs().find(x => x.id === id);
  if (!j || j.pending) return false;
  if (!(j.points > 0)) return rdRemove(id);
  if (!j.roll) return false;
  rdOffer(j);
  record("rd", { op: "term", id });
  pushReact();
  return true;
}
function rdInstall(id: string) {
  if (S.dead) return false;
  const jobs = ensureRdJobs();
  const j = jobs.find(x => x.id === id);
  if (!j || !j.pending) return false;
  const k = fleetPart(j.part);
  const gain = j.pending.gain > 0 ? j.pending.gain : 0;
  if (!(rdShownPct(gain) > 0)) {
    rdDiscard(j);
    pushReact();
    return true;
  }
  const key = rdBoostKey(j.model, k);
  S.rdBoost = S.rdBoost || {};
  S.rdCount = S.rdCount || {};
  const after = rdBoostMul(j.model, k) * (1 + gain);
  S.rdBoost[key] = after;
  S.rdCount[key] = rdFound(j.model, k) + 1;
  S.rdJobs = jobs.filter(x => x.id !== id);
  record("rd", { op: "install", id });
  pulseRdGain(j.model, k);
  pushReact();
  return true;
}
function clampRdJobs() {
  ensureFleet();
  ensureRdJobs();
  const used = emptyFleet();
  const merged: Record<string, RdJob & { part: FleetPart }> = {};
  for (const j of S.rdJobs) {
    const k = fleetPart(j.part);
    const key = j.model + "\0" + k;
    if (!merged[key])
      merged[key] = {
        id: j.id,
        model: j.model,
        part: k,
        gpus: 0,
        spent: j.spent || 0,
        points: j.points | 0,
        roll: (j.points | 0) > 0 ? j.roll || null : null,
        pending: j.pending || null,
      };
    merged[key].gpus += Math.max(0, j.gpus | 0);
    merged[key].spent = Math.max(merged[key].spent, j.spent || 0);
    if ((j.points | 0) > (merged[key].points | 0)) merged[key].points = j.points | 0;
    if (j.roll && (j.points | 0) > 0) merged[key].roll = j.roll;
    if (j.pending) merged[key].pending = j.pending;
  }
  const out: RdJob[] = [];
  for (const key in merged) {
    const j = merged[key];
    const q = rdQuantum(j.model, j.part);
    const cap = Math.max(
      0,
      ((S.fleet && S.fleet[j.part]) || 0) - servingOf(j.part) - used[j.part]
    );
    const gpus = rdSnap(Math.min(j.gpus, cap), q);
    if (gpus < q) continue;
    used[j.part] += gpus;
    out.push({
      id: j.id,
      model: j.model,
      part: j.part,
      gpus,
      spent: j.spent || 0,
      points: j.points | 0,
      roll: j.roll || null,
      pending: j.pending || null,
    });
  }
  S.rdJobs = out;
}
let rdLastT = 0;
/* The first Elise run is the tutorial's, so it finishes within two calendar
   days. Keyed on the job id, not the tutorial, so a replay lands the same. */
const RD_FIRST_ID = "r1";
const RD_FIRST_MAX_H = (2 * 24 * SCORE_HOURS) / YEAR_HOURS;
export function checkRdJobs() {
  const dt = Math.max(0, S.t - rdLastT);
  rdLastT = S.t;
  if (S.dead || gpuDown() || !S.rdJobs || !S.rdJobs.length || !(dt > 0)) return;
  let hit = false;
  for (const j of S.rdJobs) {
    if (j.pending) continue;
    const n = rdJobGpus(j);
    if (n < rdQuantum(j.model, j.part)) continue;
    const need = rdPointsNeeded(rdFound(j.model, j.part));
    let left = dt;
    while ((j.points | 0) < need && left > 0) {
      let wait = rdSampleWait(j.model, j.part, n, j.points | 0);
      if (j.id === RD_FIRST_ID)
        wait = Math.min(wait, Math.max(0, RD_FIRST_MAX_H - (j.spent || 0)));
      if (!(wait >= 0) || wait === Infinity) break;
      if (wait > left) {
        j.spent = (j.spent || 0) + left;
        left = 0;
        break;
      }
      left -= wait;
      j.spent = (j.spent || 0) + wait;
      const points = (j.points | 0) + 1;
      if (!rdAdvanceRoll(j, points, need)) break;
      j.points = points;
      hit = true;
    }
    if ((j.points | 0) >= need) rdOffer(j);
  }
  if (hit) pushReact();
}
function clampJobs() {
  ensureFleet();
  ensureJobs();
  const used = emptyFleet();
  const out: ServeJob[] = [];
  for (const j of S.jobs) {
    const k = fleetPart(j.part);
    const per = unitsToHold(k, j.model);
    const max = Math.floor(Math.max(0, ((S.fleet && S.fleet[k]) || 0) - used[k]) / per);
    const copies = Math.min(Math.max(0, j.copies | 0), max);
    if (copies < 1) continue;
    used[k] += copies * per;
    out.push({ id: j.id, model: j.model, part: k, copies });
  }
  S.jobs = out;
  priceServingJobs();
  clampRdJobs();
}
function serveView(): ServeView {
  ensureJobs();
  const use = fleetUse();
  const models = modelsOut()
    .map(id => ({ id, name: MODELS[id].name }))
    .concat([{ id: MINE_ID, name: MINE_NAME }]);
  const hold: ServeView["hold"] = {};
  const avail: ServeView["avail"] = {};
  models.forEach(m => {
    hold[m.id] = {};
    avail[m.id] = {};
    FLEET_ORDER.forEach(k => {
      hold[m.id][k] = unitsToHold(k, m.id);
      avail[m.id][k] = modelOnPart(m.id, k);
    });
  });
  const disc = fleetDisc(S.gpus || 0);
  const fills = jobFills();
  function fmtDay(n: number) {
    if (n >= 0.01 || n <= -0.01) return fmt$(n) + "/day";
    if (Math.abs(n) >= 1e-6) return "$" + n.toFixed(6) + "/day";
    return fmt$(n) + "/day";
  }
  return {
    jobs: S.jobs.map(j => {
      const k = fleetPart(j.part);
      const per = unitsToHold(k, j.model);
      const nGpus = jobGpus(j);
      const room = (use.unused[k] || 0) + nGpus;
      const mine = isMine(j.model);
      const util = mine ? 1 : fills.get(j) || 0;
      const exp = perDay(nGpus * gpuListRent(k) * disc);
      const rev = perDay(mine ? nGpus * mineUsdHr(k) : jobListRevHr(j) * util);
      const market = mine ? 0 : modelMarketToks(j.model);
      const share =
        market > 0
          ? Math.min(modelShareOf(j.model), supplyTpsOf(j.model) / market, SHARE_CAP)
          : 0;
      return {
        id: j.id,
        model: j.model,
        modelName: mine ? MINE_NAME : MODELS[j.model] ? MODELS[j.model].name : j.model,
        part: k,
        partName: GPUS[k].name,
        copies: j.copies,
        perCopy: per,
        gpus: nGpus,
        price: mine ? null : (j.price ?? null),
        mine,
        usdPerDay: mine ? perDay(mineUsdHr(k)) : null,
        maxCopies: Math.floor(room / per),
        util,
        share: mine ? null : (share * 100).toFixed(2) + "%",
        sharePct: mine ? 0 : share * 100,
        shareMax: !mine && share >= SHARE_CAP - 1e-4,
        utilMax: !mine && util >= 0.999,
        rentCapped: rentBlockOf(k) <= 0,
        revenue: fmtDay(rev),
        revenueUsd: rev,
        expenses: fmtDay(exp),
        expensesUsd: exp,
        profit: fmtDay(rev - exp),
        profitUsd: rev - exp,
        maxGpus: Math.floor(room / per) * per,
        down: gpuDown() ? OUTAGE_TIP : "",
      };
    }),
    models,
    avail,
    parts: FLEET_ORDER.map(k => ({
      id: k,
      name: GPUS[k].name,
      unlocked: partUnlocked(k),
      unused: use.unused[k] || 0,
    })),
    hold,
    gain: rdGain,
    day: dayIndex(S.t || 0),
  };
}
/* What a deployment not made yet would earn once demand has caught up: the
   model's share settles where updateModelShares takes it, so this one is full
   while the market is bigger than every deployment of the model together, and
   shares the market with them when not. Today's market, rent and Elise
   speedups; copies 0 is priced as one. */
function serveExpect(model: string, part: string, copies: number) {
  if (!S) return null;
  const k = fleetPart(part);
  const probe: ServeJob = { id: "", model, part: k, copies: Math.max(1, copies | 0) };
  const gpus = jobGpus(probe);
  const exp = gpus * gpuListRent(k) * fleetDisc(S.gpus || 0);
  let rev: number, fill: number;
  if (isMine(model)) {
    rev = gpus * mineUsdHr(k);
    fill = 1;
  } else {
    const market = modelMarketToks(model);
    const supply = supplyTpsOf(model) + jobTps(probe);
    const share =
      market > 0
        ? clamp(demandTargetToks(market, supply) / market, SHARE_MIN, SHARE_CAP)
        : 0;
    /* jobFills' split, with this deployment merged in the way serveAdd does it. */
    const rows = ensureJobs()
      .filter(j => j.model === model && fleetPart(j.part) !== k)
      .map(j => ({ offer: jobOfferToks(j), got: 0, room: 0 }))
      .filter(r => r.offer > 0);
    const same = ensureJobs().find(j => j.model === model && fleetPart(j.part) === k);
    const merged = same ? { ...same, copies: same.copies + probe.copies } : probe;
    const mine = { offer: jobOfferToks(merged), got: 0, room: 0 };
    rows.push(mine);
    let left = market > 0 ? market * share : 0;
    const claim = left / rows.length;
    rows.forEach(r => {
      r.got = Math.min(r.offer, claim);
      left -= r.got;
    });
    const room = rows.reduce((s, r) => s + (r.room = Math.max(0, r.offer - r.got)), 0);
    if (left > 1e-9 && room > 0) {
      const spill = Math.min(left, room);
      rows.forEach(r => (r.got += spill * (r.room / room)));
    }
    fill = mine.offer > 0 ? clamp(mine.got / mine.offer, 0, 1) : 0;
    rev = jobListRevHr(probe) * fill;
  }
  return {
    copies: probe.copies,
    gpus,
    fill,
    revenue: fmt$(perDay(rev)) + "/day",
    expenses: fmt$(perDay(exp)) + "/day",
    profit: fmt$(perDay(rev - exp)) + "/day",
    profitUsd: perDay(rev - exp),
  };
}
function rentAsk(k?: string) {
  if (S.dead) return 0;
  const before = S.gpus || 0;
  rentNow(k || "h2o");
  return (S.gpus || 0) - before;
}
/* Each press of pause, by button or by key; the button replays its punch on a change. */
let pauseToggles = 0;
function togglePause() {
  pauseToggles++;
  PAUSED = !PAUSED;
  manualPause = PAUSED; // a hold of the player's own, which the watchdog below must not undo
}
export let TSCALE = 1,
  PAUSED = true;
/* ?t= scales the clock. */
const qp = new URLSearchParams(location.search);
{
  const t = qp.get("t");
  if (t) TSCALE = parseFloat(t);
}
if (qp.get("skipstart")) {
  startOpen = false;
  PAUSED = false;
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && board) closeBoard();
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const top = topOverlay();
  if (e.key === "Enter" && top === "ovStart") {
    play();
    e.preventDefault();
  }
  if ((e.key === "Enter" || e.key === "Escape") && top === "ovEvent") {
    if (eventView()?.result != null) {
      closeEvent();
      e.preventDefault();
    }
  }
  /* Space pauses and resumes, the same as the pause button. A focused button
     would otherwise take the key as a click, so the key is claimed here first.
     A tutorial, pop-up, or game-over screen already holds the clock, so space must
     not undo that, and it still must not click the focused button. */
  if (e.key === " " || e.code === "Space") {
    if (e.repeat) return;
    e.preventDefault();
    if (pauseHold()) return;
    togglePause();
  }
});
/* The engine's whole surface: React's buttons, the replay and the tests call
   these, since the engine is its own script and not part of the page bundle. */
const api = {
  play,
  showStart,
  togglePause,
  skipTime,
  openBoard,
  closeBoard,
  closeScore,
  tutNext,
  tutEnd,
  infiniteMode,
  saveHighscore,
  pauseHold,
  restart,
  eval: (src: string) => eval(src),
  /* Everything the simulation modules export, for the console and the tests. */
  sim: { ...constantsModule, ...clockModule, ...pricingModule, ...simulationModule },
  get S() {
    return S;
  },
  get paused() {
    return PAUSED;
  },
  get tutorial() {
    return !!TUT;
  },
  set paused(v: boolean) {
    PAUSED = !!v;
  },
  get whyPaused() {
    return pauseHold();
  },
  get drawFailed() {
    return [...drawFailed];
  },
  checkRdJobs,
  checkMonthEvents,
  fireMonthEvent,
  pickEvent,
  closeEvent,
  tick,
  MODELS,
  rentAsk,
  rentNow,
  shareNowText,
  serveAdd,
  serveExpect,
  serveSetCopies,
  serveRemove,
  rdAdd,
  rdForecast,
  rdSetGpus,
  rdRemove,
  rdInstall,
  rdTerminate,
  holdClock,
  get events() {
    return EVENTS;
  },
  eventsDocument,
  eventsJson,
  scoreTick: SCORE_TICK,
};
export type Board = typeof api;
window.__board = api;

/* ---------------- main loop ---------------- */
try {
  restart();
  if (qp.get("skipstart")) tutStart();
} catch (e) {
  console.error("boot", e);
}
