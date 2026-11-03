import type { PanelId } from "../components/layout";

export type GpuTypeRow = {
  id: string;
  name: string;
  count: number;
  serving: number;
  rd: number;
  unused: number;
  cost: number;
  unlocked: boolean;
  unlock: string;
  aura: boolean;
  tip: string;
};

export type GpuBuyRow = {
  id: string;
  name: string;
  disabled: boolean;
  /** at the per-type cap; nothing more to rent */
  full: boolean;
  max: number;
  first: boolean;
  /** the usual rental block, as the button shows it */
  block: number;
  /** GPUs added on top of the block to land the type on a multiple of it */
  extra: number;
  /** how many of this type there will be after the rental */
  total: number;
  /** price of the whole rental, top-up included */
  cost: string;
  aura: boolean;
  sizeFlash: boolean;
};

export type GpuView = {
  countLabel: string;
  tint: "" | "up" | "dn";
  types: GpuTypeRow[];
  buys: GpuBuyRow[];
  penalty?: string;
  /** Everything you pay per day: rent, refunds, old-provider penalty, partner cut. */
  costDay?: number;
  /** The current rental batch size; the deployment steppers move by it. */
  rentBlock?: number;
};

export type ChartPoint = {
  t: number;
  capital: number;
  capitalBare: number;
  util: number;
  profit: number;
};

export type ChartView = {
  points: ChartPoint[];
  t0: number;
  t1: number;
  capital: string;
  capitalBare: string;
  util: string;
  profit: string;
};

export type StartView = {
  show: boolean;
};

export type ControlsView = {
  paused: boolean;
  /** The player pressed pause. Other clock stops (a news card, the tutorial) leave this false. */
  playerPaused: boolean;
  /** Presses of pause so far. */
  toggles: number;
  canSkip: boolean;
  /** What the layered music needs from the run (MusicDirector.tsx). */
  music: {
    /** bumped by every restart */
    run: number;
    /** a run is under way and the tutorial is done (or was skipped) */
    ready: boolean;
    /** bankrupt, or the year is over and the score screen is up */
    over: boolean;
    /** share of the year gone, 0 to 1 */
    year: number;
  };
};

export type HudTile = {
  id: string;
  wrap?: string;
  label: string;
  value: string;
  valueClass?: string;
  hidden: boolean;
  tip?: string;
  anim?: "coin" | "trophy" | "clock";
  money?: boolean;
  trend?: "up" | "down" | "";
};

export type HudView = {
  tiles: HudTile[];
  frozen: boolean;
};

export type RdTab = "profit" | "tps" | "gpus" | "price" | "demand";

/** A just-deployed inference improvement, long enough to light the numbers it moved. */
export type GainFlash = {
  model: string;
  part: string;
  gen: number;
};

export type RdDemandRow = {
  id: string;
  name: string;
  market: string;
  share: string;
  yours: string;
  marketToks: number;
  listed: boolean;
};

export type RdJobView = {
  id: string;
  model: string;
  modelName: string;
  part: string;
  partName: string;
  gpus: number;
  maxGpus: number;
  quantum: number;
  phase: "search" | "found";
  spentLabel: string;
  dayFill: number;
  /** estimated time left while searching (see rdLeftHours); "" once found */
  leftLabel: string;
  /** the part of a day in leftLabel, 0 to 4 quarters, for the day ring */
  leftFill: number;
  title: string;
  faster: number;
  /** Throughput multiplier the found improvement adds once deployed. */
  gainMul: number;
  points: number;
  need: number;
  soFar: number;
  down?: string;
};

export type RdView = {
  models: { id: string; name: string; released: boolean; aura?: boolean }[];
  gpus: {
    id: string;
    name: string;
    unlocked: boolean;
    unlock?: string;
    aura?: boolean;
    unused?: number;
    rent?: number;
  }[];
  /** Which model/GPU pairs have a serving job. */
  serving: Record<string, Record<string, boolean>>;
  boosts?: Record<string, Record<string, number>>;
  avail?: Record<string, Record<string, boolean>>;
  hold?: Record<string, Record<string, number>>;
  demand?: RdDemandRow[];
  jobs?: RdJobView[];
  pick?: { model: string; part: string } | null;
  gain?: GainFlash | null;
};

export type ServeJobView = {
  id: string;
  model: string;
  modelName: string;
  part: string;
  partName: string;
  copies: number;
  perCopy: number;
  gpus: number;
  price: number | null;
  mine?: boolean;
  usdPerDay?: number | null;
  maxCopies: number;
  util: number;
  share: string | null;
  sharePct?: number;
  shareMax?: boolean;
  utilMax?: boolean;
  /** this GPU type is at its rental cap; no more of it can be rented */
  rentCapped?: boolean;
  revenue: string;
  revenueUsd?: number;
  /* rent on this deployment's GPUs, $/day (the card's Expenses) */
  expensesUsd?: number;
  expenses: string;
  profit: string;
  profitUsd: number;
  maxGpus: number;
  down?: string;
};

export type ServePartOpt = {
  id: string;
  name: string;
  unlocked: boolean;
  unused: number;
};

export type ServeView = {
  jobs: ServeJobView[];
  models: { id: string; name: string }[];
  parts: ServePartOpt[];
  hold: Record<string, Record<string, number>>;
  avail: Record<string, Record<string, boolean>>;
  gain?: GainFlash | null;
  /** The in-game day; the panel re-sorts its cards by profit when it ticks over. */
  day: number;
};

/** The monthly event card: a choice to make, or the result once made. */
export type EventView = {
  month: string;
  /** SVG markup of the card's picture, or "". */
  art: string;
  title: string;
  ask: string;
  /** The two button labels while the choice is open, otherwise null. */
  choices: string[] | null;
  /** HTML of what happened, once there is something to report. */
  result: string | null;
};

/** The game-over screen, fixed at the moment the money ran out. */
export type GameOverView = {
  title: string;
  why: string;
  num: string;
  advice: string;
  /** [hour, capital] from the start of the run to its end. */
  capital: [number, number][];
  /** Game hours in one calendar month. */
  monthHours: number;
};

export type LbRow = {
  rank: string;
  name: string;
  score: string;
  /** The player's own run. */
  you: boolean;
  /** Not verified yet. */
  pending: boolean;
};

/** The year-end screen. A null row is the gap before a run past the 10th. */
export type ScoreView = {
  /** Changes each time the screen opens. */
  id: number;
  title: string;
  line: string;
  money: string;
  loading: boolean;
  note: string;
  rows: (LbRow | null)[];
  /** The run placed and has no name on the board yet. */
  naming: boolean;
  saving: boolean;
  error: string;
  /** The text the share buttons post. */
  share: string;
};

export type BoardView = {
  id: number;
  blurb: string;
  rows: (LbRow | null)[];
  note: string;
};

/** The tutorial card on screen. Targets are selectors; the board measures them. */
export type TutorialView = {
  /** The step's text (HTML). */
  text: string;
  /** The label of the button that moves on, or null when the step moves on by itself. */
  next: string | null;
  skip: boolean;
  /** What the card's line points at; null centres the card. */
  target: string | null;
  /** The spotlight is one box around those of these that have a box, else the target. */
  hole: string[] | null;
  /** The card drops under the spotlight instead of beside the target. */
  below: boolean;
  /** Changes when the target should be scrolled into view. */
  seq: number;
};

/** A panel the tutorial needs open, once per step. */
export type UnfoldView = { key: string; panel: PanelId };

export type GameView = {
  tick: number;
  gpu: GpuView | null;
  chart: ChartView | null;
  start: StartView;
  controls: ControlsView | null;
  hud: HudView | null;
  rd: RdView;
  serve: ServeView | null;
  event: EventView | null;
  gameOver: GameOverView | null;
  score: ScoreView | null;
  board: BoardView | null;
  tutorial: TutorialView | null;
  unfold: UnfoldView | null;
  /** On a phone, the tab whose footer button calls the player to the next tutorial step. */
  tutCall: string | null;
};

declare global {
  interface Window {
    __reactPush?: (next: GameView) => void;
    __pushNews?: (item: {
      id: number;
      html: string;
      cls: string;
      month: string;
    }) => void;
    __clearNews?: () => void;
    __board?: import("../engine/game").Board;
  }
}
