/* Token prices and throughput blending: pure functions of constants.ts, shared by
   the engine and the Stats table so both price a GPU the same way. */
import { INPUT_TOKEN_BLEND, LIST_PRICE, PREFILL_TO_DECODE } from "./constants";

/* $ per 1M billed tokens: the INPUT_TOKEN_BLEND mix of input and output list prices. */
export function listPricePerM(id: string) {
  const p = LIST_PRICE[id];
  if (!p) return 0;
  return INPUT_TOKEN_BLEND * p.inputPerM + (1 - INPUT_TOKEN_BLEND) * p.outputPerM;
}
/* Tokens/s of the input/output time-share: 1 / (in share/inTps + out share/outTps). */
export function blendedTps(outTps: number, inTps: number) {
  if (!(outTps > 0) || !(inTps > 0)) return 0;
  const inn = INPUT_TOKEN_BLEND,
    out = 1 - INPUT_TOKEN_BLEND;
  return 1 / (inn / inTps + out / outTps);
}
/* Blended tok/s of one full GPU decoding outTps. */
export function gpuBlendedTps(outTps: number) {
  return blendedTps(outTps, outTps * PREFILL_TO_DECODE);
}
/* What one full GPU decoding outTps earns an hour at list price. */
export function gpuRevHr(model: string, outTps: number) {
  return ((gpuBlendedTps(outTps) * 3600) / 1e6) * listPricePerM(model);
}
