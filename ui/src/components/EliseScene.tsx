import { useEffect, useRef } from "react";
import {
  ELISE_ACTS,
  ELISE_GLYPHS,
  ELISE_IDLE,
  ELISE_PAL,
  ELISE_PX,
  ELISE_WALK,
  type EliseAct,
  type EliseClip,
} from "../art/elise";

/* Elise at work on an R&D run. Two stations sit at either end of the strip, each a
   random activity; she does one for a few loops, walks over to the other, and the
   station she left turns into something new with a puff of maths. While she works,
   symbols drift up from her in Elise's colour.

   The canvas is one pixel per CSS pixel and the browser scales it up with
   `image-rendering: pixelated`, so the art stays crisp at any zoom. */

const SCENE_H = 40;
const TOP = SCENE_H - ELISE_PX;
const WALK_PX_PER_S = 24;
const ACTS = Object.keys(ELISE_ACTS) as EliseAct[];
const CLIPS = Object.values(ELISE_ACTS);
/* how far a station reaches from its wall to the far side of Elise */
const REACH = Math.max(...CLIPS.map(c => c.w - c.eliseX));
/* Two stations need room for both and a few steps between. Narrower, she works at
   one station in the middle and changes activity in place; narrower than any
   station, she just stands and thinks. */
const TWO_W = 2 * REACH - ELISE_PX + 24;
const SOLO_W = Math.max(...CLIPS.map(c => c.w));
const FALLBACK_INK = "#ff7ad9";

/* every frame painted once each way round, the first time it is needed */
const painted = new Map<readonly string[], [HTMLCanvasElement?, HTMLCanvasElement?]>();

function paint(rows: readonly string[], flip: boolean) {
  const w = rows[0].length;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = rows.length;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ink = ELISE_PAL[row[x]];
      if (!ink) {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < w && row[x + n] === row[x]) n++;
      ctx.fillStyle = ink;
      ctx.fillRect(flip ? w - x - n : x, y, n, 1);
      x += n;
    }
  });
  return cv;
}

function cached(rows: readonly string[], flip: boolean) {
  let pair = painted.get(rows);
  if (!pair) {
    pair = [undefined, undefined];
    painted.set(rows, pair);
  }
  const side = flip ? 1 : 0;
  return (pair[side] ??= paint(rows, flip));
}

function frameAt(clip: EliseClip, elapsed: number) {
  const step = Math.floor(Math.max(0, elapsed) / clip.ms) % clip.order.length;
  return clip.order[step];
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);

type Particle = {
  x: number;
  y: number;
  rise: number;
  sway: number;
  glyph: number;
  age: number;
  life: number;
};

type Scene = {
  /** the scene's own clock, ms; it only moves while the run is running */
  t: number;
  /** left station, right station */
  acts: [EliseAct, EliseAct];
  /** the station she is at, or walking to */
  at: 0 | 1;
  mode: "act" | "walk";
  since: number;
  until: number;
  nextPuff: number;
  parts: Particle[];
};

function newScene(): Scene {
  const first = pick(ACTS);
  const second = pick(ACTS.filter(a => a !== first));
  const at: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  const scene: Scene = {
    t: 0,
    acts: [first, second],
    at,
    mode: "act",
    since: 0,
    until: 0,
    nextPuff: 0,
    parts: [],
  };
  scene.until = actLength(scene.acts[at]);
  return scene;
}

/* two or three loops of the activity */
function actLength(act: EliseAct) {
  const clip = ELISE_ACTS[act];
  const loops = 2 + Math.floor(Math.random() * 2);
  return loops * clip.order.length * clip.ms;
}

type Kind = "two" | "solo" | "idle";
const kindOf = (w: number): Kind =>
  w >= TWO_W ? "two" : w >= SOLO_W ? "solo" : "idle";

/* Where everything stands on a strip `w` wide. With two stations the left one is
   mirrored, so she faces the left wall there and the right wall at the other. */
function layout(w: number, scene: Scene) {
  const L = ELISE_ACTS[scene.acts[0]];
  const R = ELISE_ACTS[scene.acts[1]];
  const kind = kindOf(w);
  if (kind === "solo") {
    const clip = ELISE_ACTS[scene.acts[scene.at]];
    const x = Math.round((w - clip.w) / 2);
    const emit = [x + (clip.emit?.[0] ?? 16), TOP + (clip.emit?.[1] ?? 4)] as const;
    return { kind, L, R, lx: x, rx: x, elise: [x, x] as const, emit: [emit, emit] };
  }
  const lx = 0;
  const rx = w - R.w;
  return {
    kind,
    L,
    R,
    lx,
    rx,
    /* the left edge of Elise's own 32px frame at each station */
    elise: [lx + L.w - L.eliseX - ELISE_PX, rx + R.eliseX] as const,
    emit: [
      [lx + L.w - 1 - (L.emit?.[0] ?? 16), TOP + (L.emit?.[1] ?? 4)] as const,
      [rx + (R.emit?.[0] ?? 16), TOP + (R.emit?.[1] ?? 4)] as const,
    ],
  };
}

/* a new activity for station `i`, unlike what was there and the other station */
function swap(scene: Scene, i: 0 | 1) {
  const was = scene.acts[i];
  const other = scene.acts[i === 0 ? 1 : 0];
  scene.acts[i] = pick(ACTS.filter(a => a !== was && a !== other));
}

function spawn(scene: Scene, x: number, y: number, spread = 3) {
  scene.parts.push({
    x: x + between(-spread, spread),
    y: y + between(-1, 2),
    rise: between(9, 15),
    sway: between(0, Math.PI * 2),
    glyph: Math.floor(Math.random() * ELISE_GLYPHS.length),
    age: 0,
    life: between(1700, 2600),
  });
}

function step(scene: Scene, dt: number, w: number) {
  scene.t += dt;
  const { t } = scene;
  const kind = kindOf(w);
  if (kind !== "two" && scene.mode === "walk") {
    /* squeezed mid-walk: she is simply there */
    scene.mode = "act";
    scene.since = t;
    scene.until = t + actLength(scene.acts[scene.at]);
  }
  if (scene.mode === "act" && t >= scene.until) {
    if (kind === "two") {
      scene.mode = "walk";
      scene.since = t;
      scene.at = scene.at === 0 ? 1 : 0;
    } else {
      /* one station: a puff, and she is on to something else */
      swap(scene, scene.at);
      scene.since = t;
      scene.until = t + actLength(scene.acts[scene.at]);
      if (kind === "solo") {
        const [x, y] = layout(w, scene).emit[scene.at];
        for (let i = 0; i < 6; i++) spawn(scene, x, y, 8);
      }
    }
  }
  if (scene.mode === "walk") {
    const g = layout(w, scene);
    const dist = Math.abs(g.elise[1] - g.elise[0]);
    if (t - scene.since >= (dist / WALK_PX_PER_S) * 1000) {
      scene.mode = "act";
      scene.since = t;
      scene.until = t + actLength(scene.acts[scene.at]);
      /* the station she just left becomes something new */
      const left = scene.at === 0 ? 1 : 0;
      swap(scene, left);
      const [x, y] = layout(w, scene).emit[left];
      for (let i = 0; i < 6; i++) spawn(scene, x, y, 6);
    }
  }
  if (scene.mode === "act" && t >= scene.nextPuff) {
    const [x, y] =
      kind === "idle" ? [w / 2 + 4, TOP + 2] : layout(w, scene).emit[scene.at];
    spawn(scene, x, y);
    scene.nextPuff = t + between(260, 480);
  }
  for (const p of scene.parts) {
    p.age += dt;
    p.y -= (p.rise * dt) / 1000;
  }
  scene.parts = scene.parts.filter(p => p.age < p.life && p.y > -8);
}

function draw(ctx: CanvasRenderingContext2D, scene: Scene, w: number, ink: string) {
  ctx.clearRect(0, 0, w, SCENE_H);
  const g = layout(w, scene);
  const elapsed = scene.t - scene.since;

  if (g.kind === "idle") {
    if (w < ELISE_PX - 8) return;
    const frame = cached(ELISE_IDLE.frames[frameAt(ELISE_IDLE, scene.t)], false);
    ctx.drawImage(frame, Math.round(w / 2 - ELISE_PX / 2), TOP);
  } else if (g.kind === "solo") {
    const clip = ELISE_ACTS[scene.acts[scene.at]];
    ctx.drawImage(cached(clip.frames[frameAt(clip, elapsed)], false), g.lx, TOP);
  } else {
    const stations = [
      { clip: g.L, x: g.lx, flip: true },
      { clip: g.R, x: g.rx, flip: false },
    ] as const;
    stations.forEach((s, i) => {
      const working = scene.mode === "act" && scene.at === i;
      const rows = working
        ? s.clip.frames[frameAt(s.clip, elapsed)]
        : (s.clip.empty ?? s.clip.frames[0]);
      ctx.drawImage(cached(rows, s.flip), s.x, TOP);
    });
    if (scene.mode === "walk") {
      const from = g.elise[scene.at === 0 ? 1 : 0];
      const to = g.elise[scene.at];
      const dist = Math.abs(to - from);
      const done = Math.min(1, (elapsed / 1000) * (WALK_PX_PER_S / Math.max(1, dist)));
      const x = Math.round(from + (to - from) * done);
      const rows = ELISE_WALK.frames[frameAt(ELISE_WALK, elapsed)];
      ctx.drawImage(cached(rows, to < from), x, TOP);
    }
  }

  ctx.fillStyle = ink;
  for (const p of scene.parts) {
    const f = p.age / p.life;
    /* fade in stepped levels, like an old palette fade */
    ctx.globalAlpha = f < 0.12 ? 0.5 : f < 0.6 ? 1 : f < 0.82 ? 0.6 : 0.3;
    const rows = ELISE_GLYPHS[p.glyph];
    const gx = Math.round(
      p.x + Math.sin(p.sway + p.age / 380) * 1.5 - rows[0].length / 2
    );
    const gy = Math.round(p.y - rows.length);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "#") ctx.fillRect(gx + x, gy + y, 1, 1);
      }
    });
  }
  ctx.globalAlpha = 1;
}

export function EliseScene({ running }: { running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    scene.current ??= newScene();
    const s = scene.current;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let ink = FALLBACK_INK;
    let inkAt = -Infinity;
    const readInk = (now: number) => {
      if (now - inkAt < 1000) return;
      inkAt = now;
      ink =
        getComputedStyle(cv).getPropertyValue("--fill-elise").trim() || FALLBACK_INK;
    };
    const fit = () => {
      const w = Math.max(1, Math.round(cv.clientWidth));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== SCENE_H) cv.height = SCENE_H;
      return w;
    };
    const render = (now: number) => {
      readInk(now);
      draw(ctx, s, fit(), ink);
    };
    const ro = new ResizeObserver(() => render(performance.now()));
    ro.observe(cv);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      /* a long gap (a background tab) does not fast-forward her */
      const dt = Math.min(100, Math.max(0, now - last));
      last = now;
      step(s, dt, fit());
      render(now);
      raf = requestAnimationFrame(tick);
    };
    if (running && !still) raf = requestAnimationFrame(tick);
    else render(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [running]);

  return (
    <canvas
      ref={ref}
      className="eliseScene"
      height={SCENE_H}
      role="img"
      aria-label="Elise at work on the run"
    />
  );
}
