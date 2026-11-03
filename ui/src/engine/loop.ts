import {
  PAUSED,
  TSCALE,
  checkMonthEvents,
  checkRdJobs,
  drawFailed,
  eventHold,
  healPause,
  paintRace,
  pushReact,
  tick,
  tutRender,
} from "./game";

let last = performance.now(),
  acc = 0,
  uiT = 0;
function frame(now: number) {
  try {
    frameBody(now);
  } catch (e) {
    console.error(e);
    if (!window.__frameErr) window.__frameErr = e;
  }
  requestAnimationFrame(frame);
}
function frameBody(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!PAUSED) {
    const step = 0.05;
    acc += dt * TSCALE;
    let n = 0;
    while (acc >= step && n < 200 && !eventHold) {
      tick(step);
      checkRdJobs();
      checkMonthEvents();
      /* The step already moved the clock. Dropping it here used to leave it
         in acc, so closing a month event played that same step again and the
         replay, which never does that, diverged. */
      acc -= step;
      n++;
      if (eventHold) break;
    }
  }
  /* Drawing is the most fragile part of a frame and the least load-bearing:
    any of these can throw on a shape of state nobody anticipated. They
    used to run as one unguarded chain immediately before tutRender - and
    tutRender is the ONLY thing that ever RELEASES the tutorial pause. So a
    single bad draw took tutRender with it for the rest of the session and
    froze the clock permanently: board alive, money in the bank, no pop-up on
    screen, nothing to click, and one "internal error" line in the log saying
    the game keeps running when it had in fact stopped.

    Each draw now fails on its own, and the two things that must never miss
    a frame - the tutorial and the pause watchdog - are outside the
    drawing entirely. A broken chart costs you the chart. */
  uiT += dt;
  if (uiT > 0.12) {
    uiT = 0;
    const draws: [string, () => void][] = [
      ["paintRace", paintRace],
      ["pushReact", pushReact],
    ];
    for (const [name, f] of draws) {
      try {
        f();
      } catch (e) {
        drawFail(e, name);
      }
    }
  }
  try {
    tutRender();
  } catch (e) {
    drawFail(e, "tutRender");
  }
  window.__frames = (window.__frames || 0) + 1;
  healPause();
}
/* A draw that throws throws sixty times a second; report each one once. */
function drawFail(e: unknown, where: string) {
  if (drawFailed.has(where)) return;
  drawFailed.add(where);
  console.error(where, e);
}
requestAnimationFrame(frame);
