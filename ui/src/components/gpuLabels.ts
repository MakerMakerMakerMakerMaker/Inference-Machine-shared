export function gpusWord(n: number) {
  return `${n} GPU${n === 1 ? "" : "s"}`;
}

/** A GPU choice in a draft's picker: open, it says how many one copy takes. */
export function pickedGpu(name: string, n: number, open: boolean) {
  if (open) return `${name} · ${gpusWord(n)}`;
  return n > 1 ? `${name} x ${n}` : name;
}

/** What a rent button rents, top-up included: "Rent 8 more H200". When the type's
    count is off the block, the rental quietly rounds it up to the next multiple, and
    the number here is the whole rental (block plus top-up), so the tip stays true. */
export function rentWhat(buy: { block: number; extra: number; name: string }) {
  return `Rent ${buy.block + Math.max(0, buy.extra)} more ${buy.name}`;
}
