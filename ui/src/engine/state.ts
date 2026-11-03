/* The run state. game.ts builds it in fresh() and installs it with setState();
   every module that imports S sees the current run. */
import type { Fleet } from "./constants";

/* A serving deployment: copies of one model on one GPU type. game.ts creates
   them; model is MINE_ID for a Bitcoin miner. */
export interface ServeJob {
  id: string;
  model: string;
  part: string;
  copies: number;
  /* The list price per million tokens, set when the job is priced. */
  price?: number;
}
/* The improvement an open search is heading for. */
export interface RdRoll {
  /* For a chain roll, gain is the cumulative gain revealed so far. For a
     legacy roll without chain, it is the old full gain sampled at launch. */
  gain: number;
  /* The improvement's title, "" when the list is empty. */
  title: string;
  /* Dirichlet stick state. Absent only on progressed jobs loaded from an
     older build, which continue using their original fixed roll. */
  chain?: {
    remaining: number;
    betaB: number;
  };
}
/* A search that found something, waiting to be installed. */
export interface RdFind {
  gain: number;
  title: string;
  /* The cumulative gain revealed by this search. */
  full: number;
  points: number;
  need: number;
}
/* Elise researching one model on one GPU type. */
export interface RdJob {
  id: string;
  model: string;
  part: string;
  gpus: number;
  spent: number;
  points: number;
  roll: RdRoll | null;
  pending: RdFind | null;
}
export type ModelPick = { model: string; part: string };

/* A month's news card that only informs. */
export interface NoticeEvent {
  kind: "noop" | "script";
  month: string;
  title?: string;
  art: string;
  html: string;
  logHtml: string;
  logged: boolean;
}
/* A month event with a choice; picked stays null until the player chooses. */
export interface ChoiceEvent {
  kind: "choice";
  roll: number;
  month: string;
  picked: number | null;
  sentence: string;
  mark?: string;
}
export type QueuedEvent =
  NoticeEvent | { kind?: undefined; roll: number; month: string };

/* [hour, capital, utilization %, expenses/hr, revenue/hr, capital without Elise] */
export type ChartSample = [number, number, number, number, number, number];

export interface GameState {
  /* Sim hours since the start. */
  t: number;
  money: number;
  /* The same run's capital without Elise's speedups. */
  moneyBare: number;
  /* The capital tile, stepped once per accounting hour. */
  capitalShown: number;
  capitalHour: number;
  gpus: number;
  fleet: Fleet;
  /* Smoothed profit, revenue and expenses an hour. */
  prof5: number;
  revS: number;
  costS: number;
  revHr: number;
  costHr: number;
  util: number;
  samples: ChartSample[];
  dead: boolean;
  timeUp: boolean;
  infinite: boolean;
  monthMark: number;
  /* The last month index the December warning was queued for. */
  decMark?: number;
  outageUntil: number;
  serveSpeed: number;
  rdSpeed: number;
  driverMul: number;
  rentOff: number;
  rentNbibia: number;
  rentAmb: number;
  /* The old provider's bill after a migration, and a partner's revenue cut. */
  breakFee: number;
  revCut: number;
  engineBoost: Record<string, number>;
  seenEvents: Record<number, 1>;
  seenNoops: Record<number, 1>;
  eventQ: QueuedEvent[];
  eventOpen: NoticeEvent | ChoiceEvent | null;
  /* News held back over the first and last day of the year. */
  heldNews: { html: string; cls: string }[];
  /* Models announced in the news, and models whose release has been highlighted. */
  modelsSeen: Record<string, 1>;
  modelsLit: Record<string, 1>;
  jobs: ServeJob[];
  nextJob: number;
  servePick: ModelPick | null;
  rdJobs: RdJob[];
  nextRdJob: number;
  rdPick: ModelPick | null;
  rdBoost: Record<string, number>;
  rdCount: Record<string, number>;
  modelShare: Record<string, number>;
  servedEma: Record<string, number>;
  /* Per-model multiplier on the whole market. 1 until an event raises demand. */
  marketMul: Record<string, number>;
  /* Analytics: the run's id, whether its end was sent, seconds of real play. */
  run?: string;
  endSent?: boolean;
  activeSec?: number;
}

/* Unset until the first restart(); simulation.ts guards for that. */
export let S: GameState;
export function setState(next: GameState) {
  S = next;
}
