/* The pixel-art GPU rack above the Serving and R&D panels: the ends of a row of
   GPUs, sticking up out of the top of the panel as if from behind it.

   - 8 to 16 GPUs, as many as the panel's width fits.
   - They pop up from behind the panel, left to right, as the rented fleet grows:
     always at least one, and all of them once the fleet reaches 75% of everything
     that can be rented (FLEET_FULL: 576 of 768 GPUs).
   - Each has a status light, and one light runs along the row in sequence.
   - Separately, once profit per day passes 75% of the Capital tile's hype scale
     (CapitalFx.tsx, about $126k/day), every light flashes together and pixel
     flames burn behind the rack. Green for Serving, Elise's purple for R&D.

   Drawn on a canvas in art pixels of ART_PX css pixels each, so it stays crisp. */
import { useEffect, useRef } from "react";
import { useGpu } from "../game/store";
import { hypeOf, useProfitDay } from "./CapitalFx";

const ART_PX = 2;
const HEAD_H = 15; // art pixels: the header is 30 css px tall
const BLADE_H = 10;
const MIN_GPUS = 8;
const MAX_GPUS = 16;
const SLOT_CSS = 30; // css px of panel width per GPU before capping to 8..16
/* the fleet that shows every GPU: 75% of the 768 the providers allow (3 x 256) */
const FLEET_FULL = 576;
/* the profit hype that lights the fire */
const FIRE_AT = 0.75;
const POP_GAP_MS = 70; // between one GPU popping up and the next
const POP_MS = 260;
const CHASE_MS = 110;
const FLASH_MS = 520;

/* dark greys for the cards, the same in both themes */
const BODY = "#2b2e33";
const BEVEL = "#4b5057";
const EDGE = "#1a1c20";
const VENT = "#1f2226";
const LED_OFF = "#111214";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function rgbOf(color: string): [number, number, number] | null {
  const m = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(rgb: [number, number, number], to: number, amt: number) {
  return `rgb(${rgb.map(c => Math.round(c + (to - c) * amt)).join(",")})`;
}

export function RackHeader({ kind }: { kind: "serve" | "rd" }) {
  const hype = hypeOf(useProfitDay());
  const fleet = (useGpu()?.types ?? []).reduce((n, row) => n + (row.count ?? 0), 0);
  const live = useRef({ hype, fleet });
  live.current = { hype, fleet };
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const g = cv?.getContext("2d");
    if (!box || !cv || !g) return;

    let raf = 0;
    let cssW = 0;
    let gpus = MIN_GPUS;
    /* per GPU: 0 hidden .. 1 up, and when it started moving */
    let rise: { from: number; to: number; at: number }[] = [];
    let shown = 0;
    let lastPop = 0;
    let palette = {
      led: "#58c996",
      flame: ["#0d3d1c", "#1f7a32", "#58c996", "#c8f7d6"],
    };

    const readPalette = () => {
      const raw = getComputedStyle(box).getPropertyValue(
        kind === "rd" ? "--elise" : "--tok"
      );
      const rgb =
        rgbOf(raw) ??
        ((kind === "rd" ? [255, 122, 217] : [126, 231, 135]) as [
          number,
          number,
          number,
        ]);
      palette = {
        led: raw.trim() || mix(rgb, 0, 0),
        flame: [
          mix(rgb, 0, 0.7),
          mix(rgb, 0, 0.35),
          mix(rgb, 0, 0),
          mix(rgb, 255, 0.6),
        ],
      };
    };
    const resize = () => {
      cssW = box.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(cssW * dpr));
      cv.height = Math.round(HEAD_H * ART_PX * dpr);
      cv.style.width = `${cssW}px`;
      cv.style.height = `${HEAD_H * ART_PX}px`;
      const n = Math.max(MIN_GPUS, Math.min(MAX_GPUS, Math.floor(cssW / SLOT_CSS)));
      if (n !== gpus || rise.length !== n) {
        gpus = n;
        rise = Array.from(
          { length: n },
          (_, i) => rise[i] ?? { from: 0, to: 0, at: 0 }
        );
        shown = Math.min(shown, n);
      }
      readPalette();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const themeWatch = new MutationObserver(readPalette);
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    /* where a GPU is, 0..1, with a little overshoot on the way up */
    const riseAt = (r: { from: number; to: number; at: number }, now: number) => {
      const t = Math.min(1, (now - r.at) / POP_MS);
      if (t >= 1) return r.to;
      if (r.to > r.from) {
        const back = 1.7;
        const u = t - 1;
        return r.from + (r.to - r.from) * (1 + (back + 1) * u * u * u + back * u * u);
      }
      return r.from + (r.to - r.from) * t;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dpr = cv.width / Math.max(1, cssW);
      const px = ART_PX * dpr;
      const artW = Math.floor(cssW / ART_PX);
      const { hype: h, fleet: owned } = live.current;
      const full = h >= FIRE_AT; // the fire and the synced flash
      const want = Math.max(1, Math.min(gpus, Math.ceil((gpus * owned) / FLEET_FULL)));

      /* one GPU at a time toward the target, left to right (or back) */
      if (shown !== want && now - lastPop >= POP_GAP_MS) {
        lastPop = now;
        const i = shown < want ? shown : shown - 1;
        const r = rise[i];
        rise[i] = { from: riseAt(r, now), to: shown < want ? 1 : 0, at: now };
        shown += shown < want ? 1 : -1;
      }

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      const dot = (x: number, y: number, w: number, hh: number, c: string) => {
        g.fillStyle = c;
        g.fillRect(
          Math.round(x * px),
          Math.round(y * px),
          Math.ceil(w * px),
          Math.ceil(hh * px)
        );
      };
      const still = reducedMotion.matches;
      const tSec = still ? 0 : now / 1000;

      /* flames behind the rack once profit is high enough: tall enough to lick up over the
         GPUs' tops, with the odd ember drifting above them */
      if (full) {
        for (let x = 0; x < artW; x++) {
          const flick = still
            ? 0
            : Math.sin(tSec * 9 + x * 1.7) * 1.5 + Math.sin(tSec * 15 + x * 0.6);
          const hgt = Math.min(
            HEAD_H,
            Math.max(
              BLADE_H,
              Math.round(BLADE_H + 1.5 + 2 * Math.sin(tSec * 4 + x * 0.45) + flick)
            )
          );
          for (let y = 0; y < hgt; y++) {
            const k = y / hgt; // 0 at the base
            const c =
              k < 0.45
                ? palette.flame[3]
                : k < 0.7
                  ? palette.flame[2]
                  : k < 0.88
                    ? palette.flame[1]
                    : palette.flame[0];
            dot(x, HEAD_H - 1 - y, 1, 1, c);
          }
          /* embers: a pixel that rises off a column now and then */
          const seed = Math.sin(x * 12.9898) * 43758.5453;
          const phase = (tSec * 0.9 + (seed - Math.floor(seed))) % 1;
          if (!still && (x * 7) % 5 === 0 && phase < 0.6) {
            const ey = HEAD_H - 1 - BLADE_H - 1 - Math.floor(phase * 6);
            if (ey >= 0) dot(x, ey, 1, 1, palette.flame[2]);
          }
        }
      }

      /* the GPUs */
      const slot = artW / gpus;
      const bw = Math.max(5, Math.floor(slot) - 2);
      const upCount = rise.filter(r => riseAt(r, now) > 0.5).length;
      const chase = still ? 0 : Math.floor(now / CHASE_MS) % Math.max(1, upCount);
      const flashOn = still || Math.floor(now / (FLASH_MS / 2)) % 2 === 0;
      let upIndex = 0;
      for (let i = 0; i < gpus; i++) {
        const y = riseAt(rise[i], now);
        if (y <= 0.001) continue;
        const x0 = Math.round(i * slot + (slot - bw) / 2);
        const top = HEAD_H - Math.round(y * BLADE_H);
        dot(x0, top, bw, HEAD_H - top + 1, BODY);
        dot(x0, top, bw, 1, BEVEL); // top bevel
        dot(x0, top, 1, HEAD_H - top + 1, BEVEL); // lit left edge
        dot(x0 + bw - 1, top, 1, HEAD_H - top + 1, EDGE); // shaded right edge
        for (let v = top + 4; v < HEAD_H; v += 2) dot(x0 + 1, v, bw - 3, 1, VENT); // fan vents
        /* status light */
        let led = LED_OFF;
        if (y > 0.5) {
          if (full) led = flashOn ? palette.led : LED_OFF;
          else if (upIndex === chase) led = palette.led;
          else if (upIndex === (chase - 1 + upCount) % upCount) led = palette.flame[1];
          upIndex++;
        }
        dot(x0 + bw - 3, top + 2, 2, 1, led);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
    };
  }, [kind]);

  return (
    <div className={`rackHead ${kind}`} ref={boxRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
