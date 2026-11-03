/* The Stats table and the R&D gain line: tok/s, price and profit per GPU for
   each model on each GPU type, from the same pricing the engine runs on. */
import { RD_TPS, TPS_PER_GPU, type FleetPart } from "../engine/constants";
import { perDay } from "../engine/clock";
import { fmt$ } from "../engine/format";
import { gpuBlendedTps, gpuRevHr, listPricePerM } from "../engine/pricing";

const tableTps = (model: string, gpu: string) => RD_TPS[model]?.[gpu as FleetPart];

/* Market tok/s one GPU takes, the capacity jobTps sums. */
export function servingTpsPerGpu(model: string, gpu: string, tpsMul = 1) {
  const tps = TPS_PER_GPU[model]?.[gpu as FleetPart];
  if (tps == null) return null;
  return tps * Math.max(1, tpsMul);
}

export function blendedTpsPerGpu(model: string, gpu: string, tpsMul = 1) {
  const tps = tableTps(model, gpu);
  if (tps == null) return null;
  return gpuBlendedTps(tps * Math.max(1, tpsMul));
}

function revenuePerHrPerGpu(model: string, gpu: string, tpsMul: number) {
  const tps = tableTps(model, gpu);
  if (tps == null || !listPricePerM(model)) return null;
  return gpuRevHr(model, tps * tpsMul);
}

export function fmtRdTps(n: number) {
  if (n >= 100) return Math.round(n).toLocaleString();
  return n.toFixed(1);
}

/* Only for pairings the engine lists as available (RdView.avail). `rentHr` is the
   engine's hourly rent; the profit it returns is per day, as the game shows it. */
export function rdTableCell(model: string, gpu: string, tpsMul = 1, rentHr = 0) {
  const mul = tpsMul > 1 ? tpsMul : 1;
  const tps0 = blendedTpsPerGpu(model, gpu, 1);
  const tps = blendedTpsPerGpu(model, gpu, mul);
  const price = listPricePerM(model);
  const rev0 = revenuePerHrPerGpu(model, gpu, 1);
  const rev = revenuePerHrPerGpu(model, gpu, mul);
  const profit0 = rev0 == null ? null : perDay(rev0 - rentHr);
  const profit = rev == null ? null : perDay(rev - rentHr);
  return {
    profitUsd: profit,
    profit: profit == null ? "–" : fmt$(profit),
    profitWas: mul > 1 && profit0 != null ? fmt$(profit0) : null,
    tps: tps == null ? "–" : fmtRdTps(tps),
    tpsWas: mul > 1 && tps0 != null ? fmtRdTps(tps0) : null,
    price: price ? "$" + price.toFixed(2) : "–",
  };
}
