/* The R&D reveal: after "Hold to deploy" finishes in R&D, this popup shows what
   Elise found and what it did to the numbers. It holds the clock while it is open
   (window.__board.holdClock), counts every improved figure up from its old value
   to its new one over a looping cash register, and on close bumps the Serving
   cards the improvement speeds up (useServeBump in ServingPanel). */
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { fmt$ } from "../engine/format";
import { blendedTpsPerGpu, fmtRdTps, rdTableCell } from "../game/rdTable";
import { playSound } from "../sound";

export type RdRevealData = {
  model: string;
  part: string;
  modelName: string;
  partName: string;
  /** GPUs the Elise run had allocated */
  gpus: number;
  /** what Elise found, with `code` spans */
  title: string;
  /** throughput gain in whole percent */
  faster: number;
  /** throughput multiplier the improvement adds */
  gainMul: number;
  /** multiplier already in place before this deploy */
  mul: number;
  /** rent per GPU per hour (rdTableCell shows it per day) */
  rent: number;
  /** how many improvements have been deployed this game, this one included */
  level: number;
};

/* How big the reveal goes, 0 to 1, by how many improvements have been deployed
   this game across every model and GPU: the first adds nothing, and it builds in
   even steps to the full show at `fullAt` and beyond. The grow and the yellow
   burst take REVEAL_FULL_AT deploys to peak; the purple burst peaks sooner, at
   PURPLE_FULL_AT. Like the rest, the purple burst is nothing on the first reveal. */
const REVEAL_FULL_AT = 48;
const PURPLE_FULL_AT = 16;
function revealIntensity(level: number, fullAt = REVEAL_FULL_AT) {
  return Math.min(1, Math.max(0, (level - 1) / (fullAt - 1)));
}
/* At full intensity the card grows to 125% and snaps back, and a yellow burst
   twice the size and twice the reach of the purple one follows it. */
const GROW_MAX = 0.25;
const GOLD_COUNT_MAX = 2;
const GOLD_DELAY_MS = 380;

const OV_ID = "ovRdReveal";

/* ---- tiny stores: the open reveal, and the Serving bump that follows it ---- */

let reveal: (RdRevealData & { gen: number }) | null = null;
let revealGen = 0;
const revealListeners = new Set<() => void>();
const emitReveal = () => revealListeners.forEach(fn => fn());

export function openRdReveal(data: RdRevealData) {
  reveal = { ...data, gen: ++revealGen };
  window.__board?.holdClock(OV_ID, true);
  emitReveal();
}

function useReveal() {
  return useSyncExternalStore(
    fn => {
      revealListeners.add(fn);
      return () => revealListeners.delete(fn);
    },
    () => reveal
  );
}

export type ServeBump = { model: string; part: string; gen: number };
let bump: ServeBump | null = null;
let bumpGen = 0;
const bumpListeners = new Set<() => void>();
const emitBump = () => bumpListeners.forEach(fn => fn());
/* long enough for the last staggered card to finish its bounce */
const BUMP_MS = 1400;

function bumpServing(model: string, part: string) {
  const gen = ++bumpGen;
  bump = { model, part, gen };
  emitBump();
  window.setTimeout(() => {
    if (bump?.gen !== gen) return;
    bump = null;
    emitBump();
  }, BUMP_MS);
}

export function useServeBump(): ServeBump | null {
  return useSyncExternalStore(
    fn => {
      bumpListeners.add(fn);
      return () => bumpListeners.delete(fn);
    },
    () => bump
  );
}

function closeRdReveal() {
  const was = reveal;
  if (!was) return;
  reveal = null;
  emitReveal();
  window.__board?.holdClock(OV_ID, false);
  bumpServing(was.model, was.part);
}

/* ---- the count-up ---- */

/* The card pops in first, then the numbers roll. */
const COUNT_DELAY_MS = 320;
const COUNT_MS = 1500;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* 0 until the delay passes, then 0 to 1 eased, with the register looping while it
   moves. Restarts for each new reveal (gen). */
function useCountUp(gen: number | null) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (gen == null) return;
    setK(0);
    let raf = 0;
    let hush: (() => void) | null = null;
    const t0 = performance.now() + COUNT_DELAY_MS;
    const frame = (now: number) => {
      const t = (now - t0) / COUNT_MS;
      if (t >= 0 && !hush) hush = playSound("rd.register");
      if (t >= 1) {
        setK(1);
        hush?.();
        hush = null;
        return;
      }
      setK(t <= 0 ? 0 : easeOut(t));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      hush?.();
    };
  }, [gen]);
  return k;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* ---- pieces moved over from the R&D card ---- */

/* Text with `code` spans, as Elise's finds are written. */
export function Rich({ text }: { text: string }) {
  const bits: { code: boolean; text: string }[] = [];
  const re = /`([^`]+)`/g;
  let i = 0;
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0;
    if (at > i) bits.push({ code: false, text: text.slice(i, at) });
    bits.push({ code: true, text: match[1] });
    i = at + match[0].length;
  }
  if (i < text.length) bits.push({ code: false, text: text.slice(i) });
  if (!bits.length) bits.push({ code: false, text });
  return (
    <>
      {bits.map((bit, n) =>
        bit.code ? <code key={n}>{bit.text}</code> : <span key={n}>{bit.text}</span>
      )}
    </>
  );
}

function pctUp(was: number, now: number) {
  return Math.max(0, Math.round((now / was - 1) * 100));
}

/* "was → ▲ now (+change)". It only breaks after the arrow, so the new value
   and its change always stay together. */
function RdGainLine({
  was,
  now,
  up,
  done,
}: {
  was: string;
  now: string;
  up: string;
  done: boolean;
}) {
  return (
    <span className="rdGainT">
      <span>{was} →</span>
      <span>
        <span className="rdUp" aria-label="up">
          ▲
        </span>{" "}
        <span className={done ? "rdGainNow rvLand" : "rdGainNow"}>{now}</span>{" "}
        <span className={done ? "rdGainUp rvLand" : "rdGainUp"}>({up})</span>
      </span>
    </span>
  );
}

/* ---- the popup ---- */

function RevealBody({ r, k }: { r: RdRevealData; k: number }) {
  const done = k >= 1;
  const mul1 = r.mul * r.gainMul;
  const was = rdTableCell(r.model, r.part, r.mul, r.rent);
  const now = rdTableCell(r.model, r.part, mul1, r.rent);
  const tps0 = blendedTpsPerGpu(r.model, r.part, r.mul);
  const tps1 = blendedTpsPerGpu(r.model, r.part, mul1);
  const p0 = was.profitUsd;
  const p1 = now.profitUsd;

  /* the rolling figures; at k = 1 they are exactly what the Stats table shows */
  const tpsNow =
    done || tps0 == null || tps1 == null ? now.tps : fmtRdTps(lerp(tps0, tps1, k));
  const fasterNow = `+${done ? r.faster : Math.round(r.faster * k)}%`;
  const profitNow =
    done || p0 == null || p1 == null ? now.profit : fmt$(lerp(p0, p1, k));
  const profitUp =
    p0 == null || p1 == null
      ? null
      : p0 > 0
        ? `+${done ? pctUp(p0, p1) : Math.round(pctUp(p0, p1) * k)}%`
        : `+${fmt$(lerp(0, p1 - p0, k))}/day`;
  const pNow = p0 == null || p1 == null ? p1 : done ? p1 : lerp(p0, p1, k);
  const profitCls = pNow != null && pNow < 0 ? "n loss" : "n on";

  return (
    <>
      <p className="rdHow">
        <span className="rdHowL">Discovered improvement</span>
        <span className="rdHowB">
          <Rich text={r.title || "Found something"} />
        </span>
      </p>
      <div className="rdCast rvGain">
        <span data-tip="Per GPU at full load, before and after this deploy.">
          <span>Throughput</span>
          <RdGainLine
            was={was.tps}
            now={`${tpsNow} tok/s`}
            up={fasterNow}
            done={done}
          />
          {profitUp ? (
            <>
              <span className="rdGainL">Profit</span>
              <RdGainLine
                was={was.profit}
                now={`${profitNow}/day`}
                up={profitUp}
                done={done}
              />
            </>
          ) : null}
        </span>
      </div>
      <div className="rvStats">
        <div className="rvStatsH">Stats · Profit</div>
        <table className="rvTable">
          <colgroup>
            <col />
            <col className="gpuCol" />
          </colgroup>
          <tbody>
            <tr>
              <th>Model</th>
              <th>{r.partName}</th>
            </tr>
            <tr>
              <td>{r.modelName}</td>
              <td className={profitCls}>
                <span className="rdPair">
                  <s>{was.profit}</s>
                  <span className={done ? "rvLand" : undefined}>{profitNow}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="rvNote">
          Revenue minus GPU rent, per day per GPU at 100% utilization.
        </div>
      </div>
    </>
  );
}

/* ---- confetti: Elise-coloured pixels bursting out from around the card ---- */

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  spin: number;
  phase: number;
  shade: string;
  life: number;
};

const CONFETTI_COUNT = 110;
const CONFETTI_MS = 2600;
const GRAVITY = 900; // px/s²
const DRAG = 1.6; // per second

/* --elise as rgb, so the confetti can carry a lighter and a darker shade of it */
function eliseShades(el: Element): string[] {
  const raw = getComputedStyle(el).getPropertyValue("--elise").trim() || "#ff7ad9";
  const m = raw.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [raw];
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (to: number, amt: number) =>
    `rgb(${rgb.map(c => Math.round(c + (to - c) * amt)).join(",")})`;
  return [raw, raw, raw, mix(255, 0.45), mix(0, 0.3)];
}
/* the second burst's yellow, with a pale and a deep shade */
const goldShades = () => ["#ffd23f", "#ffd23f", "#ffd23f", "#fff1a8", "#e0a800"];

/* A canvas inside the popup, under the card and over the veil and the board. It
   bursts once per reveal (gen): pixels fly out from the card's edges, tumble by
   flipping their width like an old sprite, fall and fade. */
function Confetti({
  gen,
  cardRef,
  count = CONFETTI_COUNT,
  reach = 1,
  delayMs = 0,
  shadesOf = eliseShades,
}: {
  gen: number | null;
  cardRef: RefObject<HTMLDivElement | null>;
  /** how many bits */
  count?: number;
  /** launch speed multiplier: 2 flings them about twice as far */
  reach?: number;
  /** wait this long after opening before bursting */
  delayMs?: number;
  shadesOf?: (el: Element) => string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (gen == null || !cv || count < 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = cv.getContext("2d");
    if (!g) return;
    let raf = 0;
    let bits: Bit[] = [];
    let last = 0;
    let end = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
    };
    const burst = () => {
      size();
      const box = cardRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const cy = box ? box.top + box.height / 2 : window.innerHeight / 2;
      const hw = box ? box.width / 2 : 200;
      const hh = box ? box.height / 2 : 150;
      const shades = shadesOf(cv);
      bits = Array.from({ length: count }, () => {
        /* a point on the card's outline, flung outward from the centre */
        const a = Math.random() * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
        const speed = (380 + Math.random() * 520) * reach;
        const px = 3 + Math.floor(Math.random() * 3) * 2;
        return {
          x: cx + dx * t,
          y: cy + dy * t,
          vx: dx * speed + (Math.random() - 0.5) * 120,
          vy: dy * speed - 220 - Math.random() * 200,
          w: px,
          h: Math.random() < 0.35 ? px * 2 : px,
          spin: 6 + Math.random() * 10,
          phase: Math.random() * Math.PI * 2,
          shade: shades[Math.floor(Math.random() * shades.length)],
          life: 0.6 + Math.random() * 0.4,
        };
      });
      last = performance.now();
      end = last + CONFETTI_MS;
      raf = requestAnimationFrame(frame);
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const left = (end - now) / CONFETTI_MS;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      if (left <= 0) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const drag = Math.exp(-DRAG * dt);
      for (const b of bits) {
        b.vx *= drag;
        b.vy = b.vy * drag + GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.phase += b.spin * dt;
        /* fade out over the last part of each bit's own life */
        const alpha = Math.min(1, Math.max(0, (left - (1 - b.life)) / 0.35));
        if (alpha <= 0) continue;
        /* width flips through whole pixels: an 8-bit tumble */
        const w = Math.max(1, Math.round(Math.abs(Math.cos(b.phase)) * b.w));
        g.globalAlpha = alpha;
        g.fillStyle = b.shade;
        g.fillRect(Math.round(b.x - w / 2), Math.round(b.y - b.h / 2), w, b.h);
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    /* one frame later, so the card is laid out and its edges are where they land */
    const wait = window.setTimeout(() => {
      raf = requestAnimationFrame(burst);
    }, delayMs);
    return () => {
      window.clearTimeout(wait);
      cancelAnimationFrame(raf);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
    };
  }, [gen, cardRef, count, reach, delayMs, shadesOf]);
  return <canvas ref={canvasRef} className="rvConfetti" aria-hidden="true" />;
}

/* Always mounted, like the other popups, so it keeps one element; "show" and the
   content change. Its popup sound is the discovery horn (rd.discover), played by
   the sound engine's popup watcher when "show" lands. */
export function RdRevealOverlay() {
  const r = useReveal();
  const k = useCountUp(r ? r.gen : null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hype = r ? revealIntensity(r.level) : 0;
  const purple = r ? revealIntensity(r.level, PURPLE_FULL_AT) : 0;
  /* A click closes it from outside the card only when the press also started
     there; the release of the hold that opened it must not. */
  const downOutside = useRef(false);

  useEffect(() => {
    if (!r) return;
    confirmRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        closeRdReveal();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [r]);

  return (
    <div
      className={r ? "ov show" : "ov"}
      id={OV_ID}
      data-sound="rd.discover"
      onPointerDown={e => {
        downOutside.current = e.target === e.currentTarget;
      }}
      onClick={e => {
        if (e.target === e.currentTarget && downOutside.current) closeRdReveal();
        downOutside.current = false;
      }}
    >
      <Confetti
        gen={r ? r.gen : null}
        cardRef={cardRef}
        count={Math.round(CONFETTI_COUNT * purple)}
      />
      <Confetti
        gen={r ? r.gen : null}
        cardRef={cardRef}
        count={Math.round(CONFETTI_COUNT * GOLD_COUNT_MAX * hype)}
        reach={1 + hype}
        delayMs={GOLD_DELAY_MS}
        shadesOf={goldShades}
      />
      <div
        ref={cardRef}
        style={{ "--rv-grow": 1 + GROW_MAX * hype } as CSSProperties}
        className={hype > 0 ? "ovcard rvGrow" : "ovcard"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rvTitle"
        key={r?.gen}
      >
        {r ? (
          <>
            <div className="rvHead">
              <svg
                className="sparkle"
                viewBox="0 0 10 10"
                shapeRendering="crispEdges"
                aria-hidden="true"
              >
                <g fill="currentColor">
                  <rect x="3" y="2" width="1" height="7" />
                  <rect x="0" y="5" width="7" height="1" />
                  <rect x="2" y="4" width="3" height="3" />
                  <rect x="8" y="0" width="1" height="3" />
                  <rect x="7" y="1" width="3" height="1" />
                </g>
              </svg>
              <p className="kicker">
                {r.modelName} on {r.gpus} x {r.partName}
              </p>
            </div>
            <h2 id="rvTitle">Optimization deployed</h2>
            <RevealBody r={r} k={k} />
            <div className="row">
              <button
                ref={confirmRef}
                type="button"
                className="big primary"
                id="rvConfirm"
                onClick={closeRdReveal}
              >
                Confirm
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
