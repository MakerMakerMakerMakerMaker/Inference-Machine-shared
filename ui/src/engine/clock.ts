/* The contest is one year on the clock. Those hours are shown as 52 weeks,
   and one of those days is DAY_SECONDS real seconds at 1×. */
export const YEAR_WEEKS = 52;
export const YEAR_HOURS = YEAR_WEEKS * 168;
export const DAY_SECONDS = 4;
export const SCORE_HOURS = (YEAR_HOURS * DAY_SECONDS) / 24;
export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/* One calendar month and one calendar day, in accounting hours. */
export function monthHours() {
  return SCORE_HOURS / 12;
}
export function acctDay() {
  return 24 * (SCORE_HOURS / YEAR_HOURS);
}
/* Rates run per accounting hour in the engine; the game shows money as per
   day, one day being acctDay() accounting hours. */
export const perDay = (usdPerHour: number) => usdPerHour * acctDay();
