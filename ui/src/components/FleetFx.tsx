/* GPUs spraying off the Fleet panel, the same way coins and cash spray off the
   Capital tile (CapitalFx.tsx). The particle is the start card's GPU (START_GPU in
   art/sprites.ts), tumbling as it flies.

   It rides the Capital tile's hype scale: it starts at 80% (about $160k/day) as the
   odd GPU and reaches its busiest at 100% ($400k/day). Nothing new flies while the
   clock is stopped or while the panel is off screen (a phone tab), the GPUs fly
   over the board and under the popups, and none of it runs with reduced motion. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { START_GPU } from "../art/sprites";
import { useHud } from "../game/store";
import { hypeOf, useProfitDay } from "./CapitalFx";

export const GPUS_AT = 0.8;
const GPUS_FULL = 1;

/* GPUs per second at full strength */
const GPU_RATE = 10;
const LIFE_MS = 1700;
const GRAVITY = 900;
const DRAG = 1.6;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function ramp(hype: number) {
  if (hype <= GPUS_AT) return 0;
  return Math.min(1, (hype - GPUS_AT) / (GPUS_FULL - GPUS_AT));
}

/* The sprite as a small canvas, cropped to the GPU itself. The SVG is drawn once
   at its own 24 px, so every art pixel is one canvas pixel. */
function gpuSprite(): Promise<HTMLCanvasElement | null> {
  return new Promise(resolve => {
    const svg = START_GPU.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    const img = new Image();
    img.onload = () => {
      const full = document.createElement("canvas");
      full.width = full.height = 24;
      const g = full.getContext("2d");
      if (!g) return resolve(null);
      g.drawImage(img, 0, 0, 24, 24);
      const { data } = g.getImageData(0, 0, 24, 24);
      let x0 = 24,
        y0 = 24,
        x1 = -1,
        y1 = -1;
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++)
          if (data[(y * 24 + x) * 4 + 3] > 0) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
      if (x1 < 0) return resolve(null);
      const out = document.createElement("canvas");
      out.width = x1 - x0 + 1;
      out.height = y1 - y0 + 1;
      out.getContext("2d")?.drawImage(full, -x0, -y0);
      resolve(out);
    };
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

type Bit = {
  scale: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
  born: number;
};

export function FleetFx() {
  const hype = hypeOf(useProfitDay());
  const frozen = !!useHud()?.frozen;
  const live = useRef({ hype, frozen });
  live.current = { hype, frozen };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = hype > GPUS_AT && !reducedMotion.matches;

  useEffect(() => {
    if (!active) return;
    const cv = canvasRef.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let gpu: HTMLCanvasElement | null = null;
    let gone = false;
    gpuSprite().then(img => {
      if (!gone) gpu = img;
    });
    let bits: Bit[] = [];
    let raf = 0;
    let last = performance.now();
    let debt = 0;

    const spawn = (box: DOMRect, now: number) => {
      /* a point on the panel's outline, flung outward from its centre */
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const hw = box.width / 2;
      const hh = box.height / 2;
      const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
      const speed = 160 + Math.random() * 260;
      bits.push({
        scale: Math.random() < 0.3 ? 2 : 1,
        x: box.left + hw + dx * t,
        y: box.top + hh + dy * t,
        vx: dx * speed + (Math.random() - 0.5) * 80,
        vy: dy * speed - 160 - Math.random() * 160,
        spin: 3 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        born: now,
      });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { hype: h, frozen: still } = live.current;

      /* spawn, only while the clock runs and the panel is on screen */
      const box = document.getElementById("gpusPanel")?.getBoundingClientRect();
      if (gpu && !still && box && box.width > 0 && box.height > 0) {
        debt += GPU_RATE * ramp(h) * dt;
        for (; debt >= 1; debt--) spawn(box, now);
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
      if (!bits.length || !gpu) return;
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
        const fw = gpu.width * b.scale;
        const ww = Math.max(b.scale, Math.round(Math.abs(Math.cos(b.phase)) * fw));
        const hh = gpu.height * b.scale;
        g.drawImage(gpu, Math.round(b.x - ww / 2), Math.round(b.y - hh / 2), ww, hh);
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      bits = [];
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
    };
  }, [active]);

  if (!active) return null;
  return createPortal(
    <canvas ref={canvasRef} className="capFx" aria-hidden="true" />,
    document.body
  );
}
