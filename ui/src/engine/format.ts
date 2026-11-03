/* Money: cents always, thousands separators from $10k. */
export const fmt$ = (n: number) => {
  const s = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return (
    s +
    "$" +
    (v >= 1e4
      ? v.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : v.toFixed(2))
  );
};
/* Counts: B and M suffixes, separators from 10k. */
export const fmtN = (v: number) =>
  v >= 1e9
    ? (v / 1e9).toFixed(2) + "B"
    : v >= 1e6
      ? (v / 1e6).toFixed(2) + "M"
      : v >= 1e4
        ? Math.round(v).toLocaleString()
        : Math.round(v).toString();
