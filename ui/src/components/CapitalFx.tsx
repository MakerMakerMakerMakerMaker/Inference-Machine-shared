/* The Capital tile gets louder as the business earns more. Profit per day drives
   one "hype" level, 0 at HYPE_START and 1 at HYPE_FULL. It climbs on a log scale,
   so each 10x in profit is the same step: $4k/day is 0, $40k/day is halfway and
   $400k/day is the full show. Four effects ride on it, and each one fades in from
   nothing at its own threshold and reaches full strength with the whole system at
   $400k/day:

     25%  the amount bounces each time it changes, up to the Serving pop (110%)
     40%  the tile shakes, up to the R&D card's hardest shake (4px, 0.9
          degrees); the Profit tile beside it shakes too, at half the Capital
          tile's strength
     60%  pixel-art coins spray off the tile, constantly
     75%  pixel-art cash bundles join them

   More ride the same scale elsewhere: the Progress headings ripple from 67.5%
   (RippleText.tsx), the Fleet panel's utilization bars ripple from 70%
   (GpuPanel.tsx), GPUs spray off the Fleet panel from 80% (FleetFx.tsx) and
   riches popcorn up the window from 85% (LuxuryPopcorn.tsx). On the music's beat
   (BeatPulse.tsx), the panel titles pulse from 30% to 50%.

   The shake and the spray stop while the clock does (#hud.frozen), and none of it
   runs for players who ask for reduced motion. */
import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useGpu, useHud, useServe } from "../game/store";

const HYPE_START = 4_000;
const HYPE_FULL = 400_000;

export const SHAKE_AT = 0.4;
/* the Profit tile's shake, as a share of the Capital tile's */
const PROFIT_SHAKE = 0.5;
const BOUNCE_AT = 0.25;
export const COINS_AT = 0.6;
export const CASH_AT = 0.75;

/* the R&D card's hold shake at full fill, and the Serving landing pop */
const SHAKE_PX = 4;
const SHAKE_DEG = 0.9;
const SHAKE_EVERY_MS = 34;
const BOUNCE_MAX = 0.1;
const BOUNCE_MS = 260;

/* particles per second at full strength */
const COIN_RATE = 26;
const CASH_RATE = 12;
const LIFE_MS = 1500;
const GRAVITY = 900;
const DRAG = 1.6;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Profit per day, the same sum the Profit tile shows. */
export function useProfitDay() {
  const serve = useServe();
  const gpu = useGpu();
  const revenue = (serve?.jobs ?? []).reduce((a, j) => a + (j.revenueUsd ?? 0), 0);
  return revenue - (gpu?.costDay ?? 0);
}

export function hypeOf(profit: number) {
  if (!(profit > HYPE_START)) return 0;
  return Math.min(1, Math.log(profit / HYPE_START) / Math.log(HYPE_FULL / HYPE_START));
}

/** one effect's own 0..1, starting at zero when the system passes `from` */
function rampFrom(hype: number, from: number) {
  if (hype <= from) return 0;
  return Math.min(1, (hype - from) / (1 - from));
}

/* ---- pixel-art sprites, drawn once into small canvases ---- */

const COIN = [
  "..oooo..",
  ".ohhggo.",
  "ohggggso",
  "ohgsggso",
  "ohgsggso",
  "oggggsso",
  ".osssso.",
  "..oooo..",
];
const COIN_INK: Record<string, string> = {
  o: "#8a5a00",
  g: "#ffd23f",
  h: "#fff1a8",
  s: "#e0a800",
};

const CASH = [
  "kkkkkkkkkkkk",
  "kllllbbllllk",
  "kmmmmbbmmmmk",
  "kmdmmbbmmdmk",
  "kmmmmbbmmmmk",
  "kddddbbddddk",
  "kkkkkkkkkkkk",
];
const CASH_INK: Record<string, string> = {
  k: "#1f5a2a",
  l: "#a8e08a",
  m: "#5fbf4a",
  d: "#3a8a34",
  b: "#f2e6b0",
};

function sprite(rows: string[], ink: Record<string, string>) {
  const c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext("2d");
  if (g)
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!ink[ch]) return;
        g.fillStyle = ink[ch];
        g.fillRect(x, y, 1, 1);
      })
    );
  return c;
}

/* one judder: whole pixels and a slight tilt, scaled by strength k */
function jiggle(el: HTMLElement, k: number) {
  const amp = SHAKE_PX * k;
  const jig = () => Math.round((Math.random() * 2 - 1) * amp);
  const tilt = ((Math.random() * 2 - 1) * SHAKE_DEG * k).toFixed(2);
  el.style.transform = `translate(${jig()}px, ${Math.round(jig() * 0.6)}px) rotate(${tilt}deg)`;
}

type Bit = {
  img: HTMLCanvasElement;
  scale: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
  born: number;
};

export function CapitalFx({
  tileRef,
  value,
}: {
  tileRef: RefObject<HTMLDivElement | null>;
  /** the amount as shown; a change is what bounces it */
  value: string;
}) {
  const hype = hypeOf(useProfitDay());
  const frozen = !!useHud()?.frozen;
  const live = useRef({ hype, frozen });
  live.current = { hype, frozen };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounce = useRef<Animation | null>(null);

  /* the bounce, on each new amount */
  useEffect(() => {
    const k = rampFrom(live.current.hype, BOUNCE_AT);
    if (!(k > 0) || reducedMotion.matches) return;
    const amt = tileRef.current?.querySelector<HTMLElement>(".capAmt");
    if (!amt || !amt.animate) return;
    if (bounce.current?.playState === "running") return;
    bounce.current = amt.animate(
      [{ scale: 1 }, { scale: 1 + BOUNCE_MAX * k, offset: 0.35 }, { scale: 1 }],
      { duration: BOUNCE_MS, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" }
    );
  }, [value, tileRef]);

  /* the shake and the spray share one frame loop */
  const active = hype > 0 && !reducedMotion.matches;
  useEffect(() => {
    if (!active) return;
    const cv = canvasRef.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const coin = sprite(COIN, COIN_INK);
    const cash = sprite(CASH, CASH_INK);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let bits: Bit[] = [];
    let raf = 0;
    let last = performance.now();
    let lastShake = 0;
    let coinDebt = 0;
    let cashDebt = 0;

    const spawn = (img: HTMLCanvasElement, box: DOMRect, now: number) => {
      /* a point on the tile's outline, flung outward from its centre */
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const hw = box.width / 2;
      const hh = box.height / 2;
      const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
      const speed = 160 + Math.random() * 260;
      bits.push({
        img,
        scale: 2,
        x: box.left + hw + dx * t,
        y: box.top + hh + dy * t,
        vx: dx * speed + (Math.random() - 0.5) * 80,
        vy: dy * speed - 160 - Math.random() * 160,
        spin: img === coin ? 8 + Math.random() * 8 : 3 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        born: now,
      });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { hype: h, frozen: still } = live.current;
      const tile = tileRef.current;

      /* shake: Capital at full strength, Profit at PROFIT_SHAKE of it */
      const profitTile = document.querySelector<HTMLElement>("#hud .stat.income");
      const k = rampFrom(h, SHAKE_AT);
      if (still || !(k > 0)) {
        if (tile) tile.style.transform = "";
        if (profitTile) profitTile.style.transform = "";
      } else if (now - lastShake >= SHAKE_EVERY_MS) {
        lastShake = now;
        if (tile) jiggle(tile, k);
        if (profitTile) jiggle(profitTile, k * PROFIT_SHAKE);
      }

      /* spawn, only while the clock runs and the tile is on screen */
      const box = tile?.getBoundingClientRect();
      if (!still && box && box.width > 0 && box.height > 0) {
        coinDebt += COIN_RATE * rampFrom(h, COINS_AT) * dt;
        cashDebt += CASH_RATE * rampFrom(h, CASH_AT) * dt;
        for (; coinDebt >= 1; coinDebt--) spawn(coin, box, now);
        for (; cashDebt >= 1; cashDebt--) spawn(cash, box, now);
      }

      /* fly, fall, fade */
      const w = Math.round(window.innerWidth * dpr);
      const hgt = Math.round(window.innerHeight * dpr);
      if (cv.width !== w || cv.height !== hgt) {
        cv.width = w;
        cv.height = hgt;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      if (!bits.length) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      const drag = Math.exp(-DRAG * dt);
      bits = bits.filter(b => now - b.born < LIFE_MS);
      for (const b of bits) {
        b.vx *= drag;
        b.vy = b.vy * drag + GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.phase += b.spin * dt;
        const age = (now - b.born) / LIFE_MS;
        g.globalAlpha = age < 0.65 ? 1 : Math.max(0, (1 - age) / 0.35);
        /* the width flips through whole pixels: an 8-bit tumble */
        const fw = b.img.width * b.scale;
        const ww = Math.max(b.scale, Math.round(Math.abs(Math.cos(b.phase)) * fw));
        const hh = b.img.height * b.scale;
        g.drawImage(b.img, Math.round(b.x - ww / 2), Math.round(b.y - hh / 2), ww, hh);
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      bits = [];
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      if (tileRef.current) tileRef.current.style.transform = "";
      const profitTile = document.querySelector<HTMLElement>("#hud .stat.income");
      if (profitTile) profitTile.style.transform = "";
    };
  }, [active, tileRef]);

  if (!active) return null;
  return createPortal(
    <canvas ref={canvasRef} className="capFx" aria-hidden="true" />,
    document.body
  );
}
