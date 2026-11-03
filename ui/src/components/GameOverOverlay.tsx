import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { BROKEN_KEYBOARD } from "../art/sprites";
import { MONTH_NAMES } from "../engine/clock";
import { useGameOver } from "../game/store";
import type { GameOverView } from "../game/types";
import { getTheme, subscribeTheme } from "../theme";

function monthOf(t: number, monthHours: number) {
  return MONTH_NAMES[Math.max(0, Math.min(11, Math.floor(t / monthHours)))];
}

function axisMoney(v: number) {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a < 0.5) return "$0";
  if (a >= 1000) {
    const k = a / 1000;
    const body = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "");
    return sign + "$" + body + "k";
  }
  return sign + "$" + Math.round(a);
}

/* Draws capital through the hour it crossed zero; returns that hour, or null. */
function drawGameOver(cv: HTMLCanvasElement, gameOver: GameOverView) {
  const c = cv.getContext("2d");
  if (!c) return null;
  const w = cv.clientWidth || 520,
    h = cv.clientHeight || 188,
    dpr = devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const pts = gameOver.capital;
  const simMonth = (i: number) => i * gameOver.monthHours;
  let lo = 0,
    hi = 0,
    peak = pts[0][1];
  pts.forEach(p => {
    if (p[1] < lo) lo = p[1];
    if (p[1] > hi) hi = p[1];
    if (p[1] > peak) peak = p[1];
  });
  const span = Math.max(hi - lo, 1);
  lo -= span * 0.08;
  hi += span * 0.14;
  const padL = 46,
    padR = 14,
    padT = 22,
    padB = 22;
  const t0 = pts[0][0];
  const tData = Math.max(pts[pts.length - 1][0], t0 + 1e-3);
  // Run the axis out to the next month so a short life still shows where it sits.
  let lived = 0;
  while (lived < 11 && simMonth(lived + 1) <= tData) lived++;
  const t1 = Math.max(tData, simMonth(Math.min(12, lived + 1)));
  const X = (t: number) => padL + ((t - t0) / (t1 - t0)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const y0 = Y(0);
  const cs = getComputedStyle(cv);
  const tok = (name: string) => cs.getPropertyValue(name).trim();
  /* the canvas's own font size (board.css), resolved to px: the token itself is a
     calc() the canvas font cannot read */
  const dataFont = `${cs.fontSize} ${tok("--f-data")}`;
  c.strokeStyle = tok("--grid");
  c.setLineDash([3, 3]);
  c.beginPath();
  c.moveTo(padL, y0);
  c.lineTo(w - padR, y0);
  c.stroke();
  c.setLineDash([]);
  c.font = dataFont;
  c.fillStyle = tok("--dim");
  c.textAlign = "left";
  c.textBaseline = "top";
  c.fillText("capital", padL, 6);
  c.textAlign = "right";
  c.textBaseline = "middle";
  const yPeak = Y(peak);
  if (Math.abs(yPeak - y0) > 14)
    c.fillText(axisMoney(peak), padL - 6, Math.max(padT, Math.min(h - padB, yPeak)));
  c.fillStyle = tok("--warn");
  c.fillText("$0", padL - 6, Math.max(padT, Math.min(h - padB, y0)));
  let cross: number | null = null;
  const runs: [boolean, [number, number][]][] = [];
  let cur: [number, number][] = [],
    neg = pts[0][1] < 0;
  pts.forEach((p, i) => {
    if (i) {
      const a = pts[i - 1];
      // A sample can land on $0 exactly; that hour is the hit, and the
      // next one is the first red segment.
      if (cross == null && a[1] > 0 && p[1] <= 0) {
        const den = a[1] - p[1];
        const u = den ? a[1] / den : 1;
        cross = a[0] + (p[0] - a[0]) * u;
      }
      if (a[1] >= 0 !== p[1] >= 0 && a[1] !== p[1]) {
        const u = a[1] / (a[1] - p[1]);
        const z: [number, number] = [a[0] + (p[0] - a[0]) * u, 0];
        cur.push(z);
        runs.push([neg, cur]);
        cur = [z];
        neg = p[1] < 0;
      }
    }
    cur.push(p);
  });
  runs.push([neg, cur]);
  if (cross == null && pts[0][1] <= 0) cross = pts[0][0];
  c.lineWidth = 1.5;
  c.lineJoin = "round";
  c.lineCap = "round";
  runs.forEach(([isNeg, line]) => {
    if (line.length < 2) return;
    c.strokeStyle = isNeg ? tok("--warn") : tok("--ours");
    c.beginPath();
    line.forEach((p, i) =>
      i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))
    );
    c.stroke();
  });
  if (cross != null) {
    const x = X(cross);
    c.strokeStyle = tok("--warn");
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(x, padT);
    c.lineTo(x, h - padB);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = tok("--warn");
    c.beginPath();
    c.arc(x, y0, 3, 0, Math.PI * 2);
    c.fill();
  }
  const months: { t: number; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const t = simMonth(i);
    if (t >= t0 - 1e-6 && t <= t1 + 1e-6) months.push({ t, label: MONTH_NAMES[i] });
  }
  if (!months.length) months.push({ t: t0, label: monthOf(t0, gameOver.monthHours) });
  c.font = dataFont;
  c.fillStyle = tok("--dim");
  c.textBaseline = "bottom";
  let lastX = -1e9;
  months.forEach((m, i) => {
    const x = X(m.t);
    const align = i === 0 ? "left" : x > w - padR - 18 ? "right" : "center";
    const labelX = align === "right" ? Math.min(x, w - padR) : x;
    if (align !== "left" && labelX - lastX < 28) return;
    c.textAlign = align;
    c.fillText(m.label, labelX, h - 2);
    lastX = labelX + (align === "left" ? 18 : 10);
    c.strokeStyle = tok("--hair");
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, h - padB);
    c.lineTo(x, h - padB + 4);
    c.stroke();
  });
  return cross;
}

function GameOverChart({ gameOver }: { gameOver: GameOverView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const [when, setWhen] = useState("");
  useLayoutEffect(() => {
    if (!ref.current) return;
    const cross = drawGameOver(ref.current, gameOver);
    setWhen(cross != null ? `Hit $0 in ${monthOf(cross, gameOver.monthHours)}.` : "");
  }, [gameOver, theme]);
  return (
    <>
      <canvas id="dieChart" ref={ref} />
      <p className="sub" id="dieWhen">
        {when}
      </p>
    </>
  );
}

const RESTART_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
    />
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 3v5h5"
    />
  </svg>
);

/* Always mounted, so opening it is a class change the popup sound picks up.
   The content mounts with each game over, so the keyboard animation starts over. */
export function GameOverOverlay() {
  const gameOver = useGameOver();
  return (
    <div className={gameOver ? "ov show" : "ov"} id="ovDie" data-sound="game.lose">
      {gameOver ? (
        <div className="ovcard">
          <div className="dieHead">
            <div
              className="dieFace"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: BROKEN_KEYBOARD }}
            />
            <div className="dieCopy">
              <h2 id="dieT">{gameOver.title}</h2>
              <p id="dieP">{gameOver.why}</p>
            </div>
          </div>
          <div className="num" id="dieN">
            {gameOver.num}
          </div>
          <GameOverChart gameOver={gameOver} />
          <p className="dieAdvice">
            <span>Business advice</span>
            <span id="dieAdvice">{gameOver.advice}</span>
          </p>
          <div className="row">
            <button
              className="big"
              id="restart"
              type="button"
              title="Restart"
              onClick={() => window.__board?.showStart()}
            >
              {RESTART_ICON}
              RESTART
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
