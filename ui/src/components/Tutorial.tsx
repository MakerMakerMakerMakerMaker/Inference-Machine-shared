import { useEffect, useLayoutEffect, useRef } from "react";
import { useTutorial, useUnfold } from "../game/store";
import type { TutorialView } from "../game/types";
import { toggleCollapsed, useLayout } from "./layout";

/* The tutorial card, its dashed line to the target and the dim around the
   spotlight. The engine picks the step; this measures the board every frame,
   since the targets move with scrolling and resizing. */

type Box = { left: number; top: number; right: number; bottom: number; width: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function boxOf(sel: string): Box | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? r : null;
}

/* One box around every hole that has one. */
function union(sels: string[]): Box | null {
  const rs = sels.map(boxOf).filter((r): r is Box => !!r);
  if (!rs.length) return null;
  const left = Math.min(...rs.map(r => r.left)),
    right = Math.max(...rs.map(r => r.right));
  return {
    left,
    right,
    top: Math.min(...rs.map(r => r.top)),
    bottom: Math.max(...rs.map(r => r.bottom)),
    width: right - left,
  };
}

function placeHole(hole: HTMLElement, r: Box, pad: number) {
  const w = r.right - r.left + pad * 2,
    h = r.bottom - r.top + pad * 2;
  hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`;
}

/* below: the row the card must not cover. The card drops under it so the line to the
   target runs straight down instead of striking through the row. */
function placeCard(
  c: HTMLElement,
  ln: SVGLineElement,
  r: Box,
  pad: number,
  below: Box | null
) {
  c.style.left = "0px";
  c.style.top = "0px";
  const cw = c.offsetWidth || 280,
    ch = c.offsetHeight || 48;
  if (!r.width) {
    c.style.left = clamp(r.left - cw / 2, 8, innerWidth - cw - 8) + "px";
    c.style.top = clamp(r.top - ch / 2, 8, innerHeight - ch - 8) + "px";
    ln.setAttribute("hidden", "");
    return;
  }
  const gap = 56;
  let cx = r.right + gap,
    cy = r.top + (r.bottom - r.top) / 2 - ch / 2;
  if (below) {
    cx = clamp(r.left - 24, 8, innerWidth - cw - 8);
    cy = below.bottom + gap;
  } else {
    if (cx + cw > innerWidth - 8) cx = r.left - cw - gap;
    if (cx < 8) {
      cx = clamp(r.left, 8, innerWidth - cw - 8);
      cy = r.bottom + gap;
      if (cy + ch > innerHeight - 8) cy = r.top - ch - gap;
    }
  }
  cy = clamp(cy, 8, innerHeight - ch - 8);
  c.style.left = cx + "px";
  c.style.top = cy + "px";
  const x1 = r.left - pad,
    y1 = r.top - pad,
    x2 = r.right + pad,
    y2 = r.bottom + pad;
  const axis = (a1: number, a2: number, b1: number, b2: number) => {
    if (a2 < b1) return [a2, b1];
    if (b2 < a1) return [a1, b2];
    const m = (Math.max(a1, b1) + Math.min(a2, b2)) / 2;
    return [m, m];
  };
  const [sx, ex] = axis(cx, cx + cw, x1, x2),
    [sy, ey] = axis(cy, cy + ch, y1, y2);
  ln.setAttribute("hidden", "");
  if (Math.hypot(ex - sx, ey - sy) >= 14) {
    ln.setAttribute("x1", String(sx));
    ln.setAttribute("y1", String(sy));
    ln.setAttribute("x2", String(ex));
    ln.setAttribute("y2", String(ey));
    ln.removeAttribute("hidden");
  }
}

function draw(
  t: TutorialView,
  hole: HTMLElement,
  card: HTMLElement,
  line: SVGLineElement
) {
  let r: Box | null = t.target ? boxOf(t.target) : null;
  if (!r) {
    const cx = innerWidth / 2,
      cy = innerHeight / 2;
    r = { left: cx, right: cx, top: cy, bottom: cy, width: 0 };
  }
  const pad = r.width ? 10 : 0;
  const spot = t.hole ? union(t.hole) : null;
  placeHole(hole, spot || r, pad);
  placeCard(card, line, r, pad, t.below ? spot : null);
}

export function Tutorial() {
  const tut = useTutorial();
  const unfold = useUnfold();
  const collapsed = useLayout().collapsed;
  const cur = useRef(tut);
  cur.current = tut;
  const hole = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);

  /* The step's panel opens once, so the player can still fold it again. */
  const unfolded = useRef<string | null>(null);
  useEffect(() => {
    if (!unfold || unfolded.current === unfold.key) return;
    unfolded.current = unfold.key;
    if (collapsed[unfold.panel]) toggleCollapsed(unfold.panel);
  }, [unfold, collapsed]);

  const seq = tut?.seq;
  const target = tut?.target;
  useEffect(() => {
    if (seq == null || !target) return;
    try {
      document.querySelector(target)?.scrollIntoView({ block: "nearest" });
    } catch {
      /* an element that cannot scroll stays where it is */
    }
  }, [seq, target]);

  const shown = !!tut;
  useLayoutEffect(() => {
    if (!shown) return;
    let raf = 0;
    const frame = () => {
      const t = cur.current;
      if (t && hole.current && card.current && line.current)
        draw(t, hole.current, card.current, line.current);
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  return (
    <>
      <div id="dim" className="white" hidden={!tut}>
        <div id="dimHole" ref={hole} />
      </div>
      <div id="tut" hidden={!tut}>
        <svg id="tutLink">
          <line id="tutLine" ref={line} />
        </svg>
        <div id="tutCard" ref={card}>
          <div id="tutT" dangerouslySetInnerHTML={{ __html: tut?.text || "" }} />
          <div id="tutActs">
            <button
              type="button"
              id="tutSkip"
              hidden={!tut?.skip}
              onClick={() => window.__board?.tutEnd()}
            >
              Skip tutorial
            </button>
            <button
              type="button"
              className="big primary"
              id="tutNext"
              hidden={!tut?.next}
              onClick={() => window.__board?.tutNext()}
            >
              {tut?.next || "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
