import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTick } from "../game/store";

/* Descriptions that used to sit under a control show here while the pointer is
   over it: any element with data-tip, one line per "\n". Progress rows stay
   quiet, except the profit row and the clock buttons inside the time row. A
   click hides the tip until the pointer leaves and comes back. The engine's
   updates re-render it, so an open tip stays live. */

/* Same breakpoint as mobile.css. On a phone there is no hover, so a tap pins a
   tip that is not itself a live control, and moving the pointer does not. */
const mobScreen = window.matchMedia(
  "(max-width: 900px), (pointer: coarse) and (max-width: 1180px)"
);

/* A disabled button (a greyed-out RENT explains why in its tip) does not reliably
   get mouse events, so those buttons let events pass through (see CSS) and the
   container looks for a tipped child under the pointer. */
function tipTarget(e: MouseEvent): HTMLElement | null {
  const el = e.target as HTMLElement | null;
  if (!el?.closest) return null;
  const clockBtn = el.closest<HTMLElement>(".clockCtl");
  if (clockBtn && clockBtn.dataset.tip && !clockBtn.hidden) return clockBtn;
  const income = el.closest<HTMLElement>(".stat.income");
  if (income && income.dataset.tip) return income;
  if (el.closest(".stat")) return null;
  const t = el.closest<HTMLElement>("[data-tip]");
  if (t) return t;
  if (el.closest("#timePanel,#gpusPanel"))
    for (const c of Array.from(el.children) as HTMLElement[]) {
      if (!c.dataset?.tip || c.hidden) continue;
      const r = c.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      )
        return c;
    }
  return null;
}

function tipLines(t: HTMLElement): [string, string][] {
  return (t.dataset.tip || "")
    .split("\n")
    .filter(Boolean)
    .map((txt, i) => [i ? "hd" : "hs", txt]);
}

export function HoverTip() {
  useTick();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [quiet, setQuiet] = useState(false);
  const cur = useRef({ target, quiet });
  cur.current = { target, quiet };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (mobScreen.matches) return;
      const t = tipTarget(e);
      if (t !== cur.current.target) {
        setTarget(t);
        setQuiet(false);
      }
    };
    const out = (e: MouseEvent) => {
      if (mobScreen.matches || e.relatedTarget) return;
      setTarget(null);
    };
    const click = (e: MouseEvent) => {
      if (mobScreen.matches) {
        const t = tipTarget(e);
        const live = (e.target as HTMLElement).closest?.(
          "button:not(:disabled), a[href]"
        );
        if (t && !live) {
          const next = t === cur.current.target && !cur.current.quiet ? null : t;
          setTarget(next);
          setQuiet(!next);
          return;
        }
      }
      setQuiet(true);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseout", out);
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("click", click);
    };
  }, []);

  const lines =
    target && !quiet && target.isConnected && !target.hidden ? tipLines(target) : [];

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip || !target || !lines.length) return;
    const r = target.getBoundingClientRect(),
      h = tip.offsetHeight;
    tip.style.left =
      Math.min(Math.max(r.left, 8), innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top =
      (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4) +
      "px";
  });

  return (
    <div id="hoverTip" ref={ref} hidden={!lines.length}>
      {lines.map(([cls, txt], i) => (
        <div key={i} className={cls}>
          {txt}
        </div>
      ))}
    </div>
  );
}
