/*
  Bar lines for stations that play in time (lo-fi, chiptune): a tempo, sixteenth
  notes with an optional swing, and a way for a layer to book its music a bar at a
  time. Bars count from the station's Clock, so every layer agrees on where bar n
  starts, and a layer that joins waits for the next bar line and comes in on the
  downbeat.
*/
import type { Book, Clock, Kit } from "./kit";

export type BarClock = ReturnType<typeof barClock>;

/* `swing` pushes every second sixteenth that share of a step late (0 is straight) */
export function barClock(bpm: number, swing = 0) {
  /* a sixteenth, and a bar of sixteen of them */
  const STEP_S = 60 / bpm / 4;
  const BAR_S = 16 * STEP_S;
  const barStart = (clock: Clock, n: number) => clock.t0 + n * BAR_S;
  /* the first bar that has not started by t (a bar that started a moment ago counts) */
  const firstBar = (clock: Clock, t: number) =>
    Math.ceil((t - clock.t0) / BAR_S - 0.01);
  /* sixteenth `step` of the bar that starts at `bar`, swung */
  const stepTime = (bar: number, step: number) =>
    bar + step * STEP_S + (step % 2 ? swing * STEP_S : 0);

  /* Calls play(n, at) for each bar n starting before `until`, from the next bar
     line on. Bars that went by while the page slept are skipped, not played late. */
  function bars(k: Kit, play: (n: number, at: number) => void): Book {
    const { ac, clock } = k;
    let n = firstBar(clock, ac.currentTime + 0.02);
    return until => {
      const now = ac.currentTime;
      if (barStart(clock, n) < now - 0.05) n = firstBar(clock, now + 0.02);
      while (barStart(clock, n) < until) {
        play(n, barStart(clock, n));
        n++;
      }
    };
  }

  return { STEP_S, BAR_S, stepTime, bars };
}
