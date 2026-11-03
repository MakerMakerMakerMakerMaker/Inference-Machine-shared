/* The last rung of the profit ramp. Once profit per day passes 85% of the Capital
   tile's hype scale (CapitalFx.tsx, about $200k/day), pixel-art riches start
   popcorning up from the bottom of the window: money, jets, sports cars, watches,
   villas, gems, gold bars, martinis, top hats, bow ties and steaks (LUXURY_ART),
   mixed with the start card's GPU and the dancing robot from the news art. Each one pops up from just
   below the bottom edge, arcs and drops back out of sight.

   It starts as the odd pop at 85% and reaches its busiest at $400k/day. Nothing new
   pops while the clock is stopped, the pops sit over the board and under the
   popups, they never block a click, and none of it runs with reduced motion. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LUXURY_ART, NEWS_ART, START_GPU } from "../art/sprites";
import { useHud } from "../game/store";
import { hypeOf, useProfitDay } from "./CapitalFx";

export const POP_AT = 0.85;
/* pops per second, from just past POP_AT to the top of the scale */
const RATE_MIN = 0.6;
const RATE_MAX = 8;
const MAX_LIVE = 40;
const GRAVITY = 1700; // px/s²
const SIZES = [36, 42, 48]; // css px, whole multiples-ish of the 24px art

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const ROBOT = NEWS_ART.find(a => a.key === "dance")?.svg;
const POOL: string[] = [
  ...LUXURY_ART.map(a => a.svg),
  START_GPU,
  ...(ROBOT ? [ROBOT] : []),
];

type Kernel = {
  el: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  tilt: number;
  spin: number;
  born: number;
};

export function LuxuryPopcorn() {
  const hype = hypeOf(useProfitDay());
  const frozen = !!useHud()?.frozen;
  const live = useRef({ hype, frozen });
  live.current = { hype, frozen };
  const layerRef = useRef<HTMLDivElement>(null);
  const active = hype >= POP_AT && !reducedMotion.matches;

  useEffect(() => {
    const layer = layerRef.current;
    if (!active || !layer) return;
    let kernels: Kernel[] = [];
    let raf = 0;
    let last = performance.now();
    let debt = 0;

    const pop = (now: number) => {
      const size = SIZES[Math.floor(Math.random() * SIZES.length)];
      const el = document.createElement("div");
      el.className = "luxPop";
      el.style.width = el.style.height = `${size}px`;
      el.innerHTML = POOL[Math.floor(Math.random() * POOL.length)];
      layer.appendChild(el);
      const h = window.innerHeight;
      /* high enough to clear the bottom third of the window, at most */
      const rise = h * (0.18 + Math.random() * 0.17);
      kernels.push({
        el,
        x: Math.random() * (window.innerWidth - size),
        y: h + 4,
        vx: (Math.random() - 0.5) * 140,
        vy: -Math.sqrt(2 * GRAVITY * rise),
        size,
        tilt: (Math.random() - 0.5) * 16,
        spin: (Math.random() - 0.5) * 50,
        born: now,
      });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { hype: h, frozen: still } = live.current;
      if (!still && h >= POP_AT && kernels.length < MAX_LIVE) {
        const k = Math.min(1, (h - POP_AT) / (1 - POP_AT));
        debt += (RATE_MIN + (RATE_MAX - RATE_MIN) * k) * dt;
        /* a little randomness so the pops do not land on a beat */
        while (debt >= 1 && kernels.length < MAX_LIVE) {
          if (Math.random() < 0.85) pop(now);
          debt -= 1;
        }
      }
      const floor = window.innerHeight + 8;
      kernels = kernels.filter(kr => {
        kr.vy += GRAVITY * dt;
        kr.x += kr.vx * dt;
        kr.y += kr.vy * dt;
        kr.tilt += kr.spin * dt;
        if (kr.y > floor && kr.vy > 0) {
          kr.el.remove();
          return false;
        }
        /* a quick squash and stretch as it pops out of the floor */
        const age = (now - kr.born) / 1000;
        const sq = age < 0.12 ? 1 + 0.25 * Math.sin((age / 0.12) * Math.PI) : 1;
        kr.el.style.transform =
          `translate(${Math.round(kr.x)}px, ${Math.round(kr.y)}px) ` +
          `rotate(${kr.tilt.toFixed(1)}deg) scale(${(1 / sq).toFixed(3)}, ${sq.toFixed(3)})`;
        return true;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      kernels.forEach(kr => kr.el.remove());
      kernels = [];
    };
  }, [active]);

  if (!active) return null;
  return createPortal(
    <div className="luxLayer" ref={layerRef} aria-hidden="true" />,
    document.body
  );
}
