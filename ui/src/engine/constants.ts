/* ===== constants: every number the game is tuned with =====
   One home for the models, GPUs, prices, throughput, market and R&D tuning.
   The React panels import this module, and vite/board.ts bundles it into the
   engine, so both sides read the same values. Keep it to plain data: no
   functions and no state.

   Every number here is an example, picked so the game plays well: none is a
   measurement or a quote from any provider, so do not cite them.

   Price: GigaParrot 120B opens at $0.17 per 1M output tokens. That is
   deliberately NOT break-even: a factory-default GPU earns about $0.99 an hour
   against $1.75 of rent at this price, and a fully tuned one about $1.78. The
   business does not work until it is tuned, which is the whole subject.
   Electricity is not billed; rent is the cost line. ===== */

/* ---------------- types ---------------- */
/* A model the player can serve or research. Ids are plain strings because they
   arrive from untyped code and replayed event files; lookups guard for misses. */
export interface ModelSpec {
  name: string;
  /* Size of one copy, GB; sets how many GPUs a copy needs. */
  weightsGB: number;
}
export type Vendor = "AMB" | "Nbibia";
export interface GpuSpec {
  name: string;
  vendor: Vendor;
  /* Board power, W; memory, GB; memory bandwidth, B/s; dense FP16 peak, FLOP/s.
     The fleet panel shows them on hover; mem also sets GPUs per copy. */
  tdp: number;
  mem: number;
  hbm: number;
  peak: number;
  /* List $/GPU-hr before the volume schedule. */
  rental: number;
}
/* The four GPU types the board rents. */
export type FleetPart = "h2o" | "a2d" | "a3d" | "b2o";
export type PerPart<T> = Record<FleetPart, T>;
/* GPUs rented of each type. */
export type Fleet = PerPart<number>;
/* $ per 1M tokens, input and output. */
export interface ListPrice {
  inputPerM: number;
  outputPerM: number;
}

/* ---------------- models ---------------- */
export const MODELS: Record<string, ModelSpec> = {
  gigaparrot: { name: "GigaParrot 120B", weightsGB: 62 },
  kimchi: { name: "Kimchi K3 (2.8P)", weightsGB: 1476 },
  deepsniff: { name: "DeepSniff Flash", weightsGB: 765 },
  greatwork: { name: "GreatWork FP1", weightsGB: 1917 },
  glom: { name: "GLOM Flash", weightsGB: 328 },
  quack: { name: "Quack 27B", weightsGB: 30.9 },
};
/* Release order: GigaParrot from hour zero, then one a month. */
export const MODEL_ORDER = [
  "gigaparrot",
  "quack",
  "deepsniff",
  "glom",
  "kimchi",
  "greatwork",
];

/* ---------------- prices and tokens ---------------- */
/* Serving and R&D charge the INPUT_TOKEN_BLEND mix of these. */
export const LIST_PRICE: Record<string, ListPrice> = {
  gigaparrot: { inputPerM: 0.03, outputPerM: 0.17 },
  kimchi: { inputPerM: 1.4, outputPerM: 10.75 },
  deepsniff: { inputPerM: 0.04, outputPerM: 0.49 },
  glom: { inputPerM: 0.3, outputPerM: 1.1 },
  quack: { inputPerM: 0.214, outputPerM: 2.55 },
  greatwork: { inputPerM: 2.0, outputPerM: 6.0 },
};
/* Share of billed tokens that are input. */
export const INPUT_TOKEN_BLEND = 0.9;
/* Input tok/s per output tok/s. */
export const PREFILL_TO_DECODE = 8;

/* ---------------- throughput ---------------- */
/* Output tok/s per GPU that a full GPU earns on, for the pairings the R&D and
   Serving tables show. Pairings left blank cannot be served or researched. */
export const RD_TPS: Record<string, Partial<PerPart<number>>> = {
  gigaparrot: { h2o: 8080, a2d: 8450, a3d: 22740, b2o: 25770 },
  kimchi: { a3d: 2440, b2o: 2370 },
  deepsniff: { h2o: 15880, a2d: 19200, a3d: 42260, b2o: 41290 },
  glom: { a3d: 7530, b2o: 8770 },
  quack: { h2o: 3240, a2d: 2950, a3d: 4950, b2o: 5990 },
  greatwork: { a3d: 2260, b2o: 2700 },
};
/* tok/s one GPU of that type produces on that model. Serving capacity is
   just the sum of (GPUs on the job × this cell). It sets how much of a model's
   market a deployment can take; what a full GPU earns comes from RD_TPS. */
export const TPS_PER_GPU: Record<string, Partial<PerPart<number>>> = {
  gigaparrot: { h2o: 1552.7, a2d: 2362.3, a3d: 6900.7, b2o: 3954.3 },
  kimchi: { a3d: 79.9, b2o: 8.8 },
  deepsniff: { h2o: 215.3, a2d: 721.3, a3d: 954.5, b2o: 374.4 },
  glom: { a3d: 25991.3, b2o: 28206.8 },
  quack: { h2o: 3240, a2d: 2950, a3d: 4950, b2o: 5990 },
  greatwork: { a3d: 2260, b2o: 2700 },
};
/* GPUs one copy takes, where it is not just enough memory for the weights. */
export const UNITS_SET: Record<string, Partial<PerPart<number>>> = {
  deepsniff: { h2o: 8, a2d: 8, a3d: 8, b2o: 8 },
  glom: { a3d: 8, b2o: 4 },
  kimchi: { a3d: 8, b2o: 16 },
  greatwork: { a3d: 8, b2o: 8 },
};
/* Share of a GPU's memory left for weights once the KV cache has its room. */
export const KV_HEADROOM = 0.88;
/* A copy may span one node, or two on the latest parts. */
export const NODE_GPUS = 8;
export const LATEST_NODE_GPUS = 16;
export const LATEST_PARTS: readonly FleetPart[] = ["a3d", "b2o"];

/* ---------------- GPUs and the fleet ---------------- */
export const GPUS: Record<string, GpuSpec> = {
  a2d: {
    name: "AMB A2D",
    vendor: "AMB",
    tdp: 750,
    mem: 192,
    hbm: 5.3e12,
    peak: 1.3e15,
    rental: 6,
  },
  a3d: {
    name: "AMB A3D",
    vendor: "AMB",
    tdp: 1400,
    mem: 288,
    hbm: 8.0e12,
    peak: 2.5e15,
    rental: 8.6,
  },
  h2o: {
    name: "Nbibia H2O",
    vendor: "Nbibia",
    tdp: 700,
    mem: 141,
    hbm: 4.8e12,
    peak: 0.99e15,
    rental: 5.97,
  },
  b2o: {
    name: "Nbibia B2O",
    vendor: "Nbibia",
    tdp: 1000,
    mem: 180,
    hbm: 8.0e12,
    peak: 2.25e15,
    rental: 12.36,
  },
};
export const FLEET_ORDER: readonly FleetPart[] = ["h2o", "a2d", "a3d", "b2o"];
/* Fleet size at which each type can be rented. */
export const FLEET_UNLOCK: Fleet = { h2o: 0, a2d: 16, a3d: 64, b2o: 256 };
/* No provider rents you more than this many of one GPU type. */
export const FLEET_CAP = 256;

/* ---------------- Bitcoin ---------------- */
export const MINE_ID = "btc";
export const MINE_NAME = "Bitcoin";
/* SHA-256 earnings, $/hr per GPU. */
export const MINE_USD_HR: PerPart<number> = {
  h2o: 0.000003505,
  a2d: 0.00000405,
  a3d: 0.000003403,
  b2o: 0.000003829,
};

/* ---------------- R&D ----------------
   How they combine is described above rdPointsNeeded() in simulation.ts. */
/* Days the first research point of a search averages for one deployment. */
export const RD_POINT_DAYS = 2;
/* Research points the 1st, 2nd, ... improvement of a search needs. */
export const RD_POINT_NEED = [1, 3, 5, 12, 20];
/* Each find is expected to close this share of the headroom under the ceiling. */
export const RD_GAIN_ALPHA = 0.2;
/* Ceiling on the installed speedup; AMB parts have more headroom. */
export const RD_CEILING = 2.5;
export const RD_CEILING_AMB = 3.25;
/* Gains are drawn from an integer Beta(RD_BETA_A, b). */
export const RD_BETA_A = 8;
/* Expected cumulative gain before completion follows
   RD_SYNERGY_ALPHA × (points/need)^RD_SYNERGY_P. */
export const RD_SYNERGY_P = 2;
export const RD_SYNERGY_ALPHA = 0.85;

/* ---------------- market ---------------- */
export const SHARE_MIN = 0;
export const SHARE_CAP = 1;
/* Demand settles at the fleet's throughput, not past it. The old 1.2 let an
   instant catch-up overshoot what the GPUs can serve, so the stats table
   showed a higher share than the serving card. */
export const DEMAND_HEADROOM = 1;
/* Each model's whole market, tok/s, before MARKET_SCALE. */
export const OR_MARKET_TPS: Record<string, number> = {
  gigaparrot: 1122872.2,
  quack: 653086.2,
  deepsniff: 32696136.5,
  glom: 27199853.2,
  kimchi: 4328583.1,
  greatwork: 5484330,
};
/* Each market is this fraction of OR_MARKET_TPS, so a big fleet can take all of it. */
export const MARKET_SCALE = 0.3;

/* Where every game starts: hour-zero capital and fleet. model and price are the
   opening list price of the first model, recorded in each run's start block. */
export const START_STATE = {
  capital: 10000,
  gpus: 0,
  model: "gigaparrot",
  price: 0.17,
};
