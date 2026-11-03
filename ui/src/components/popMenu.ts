import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/* A small menu that hangs off a button: the sound levels (sound/SoundControl.tsx).
   A click or tap on the button opens it and closes it again. A press anywhere
   outside it, or Escape, also closes it. Only one is open at a time: opening one
   closes any other.

   The menu is position: fixed and placed from the button's own box, because the
   homes of these buttons (the brand bar, the start card) clip anything that hangs
   out of them. It opens under the button, or over it when there is no room below. */

const GAP = 6;
const EDGE = 8;

/* which menu is open, page-wide; every menu hears when it changes */
let current: symbol | null = null;
const listeners = new Set<() => void>();
function setCurrent(next: symbol | null) {
  if (current === next) return;
  current = next;
  listeners.forEach(l => l());
}

export function usePopMenu<
  W extends HTMLElement = HTMLSpanElement,
  P extends HTMLElement = HTMLDivElement,
>(watch: unknown[] = []) {
  const me = useRef(Symbol("menu")).current;
  const [open, setOpenState] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" });
  const wrap = useRef<W>(null);
  const panel = useRef<P>(null);

  /* follow the page-wide pick, so another menu opening closes this one */
  useEffect(() => {
    const sync = () => setOpenState(current === me);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
      if (current === me) current = null;
    };
  }, [me]);

  const setOpen = (v: boolean) => {
    if (v) setCurrent(me);
    else if (current === me) setCurrent(null);
  };
  const toggle = () => setOpen(current !== me);

  /* a press outside the button and the menu closes it */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node | null)) setOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPlace({ visibility: "hidden" });
      return;
    }
    const position = () => {
      const btn = wrap.current?.querySelector("button");
      const box = panel.current;
      if (!btn || !box) return;
      const r = btn.getBoundingClientRect();
      const w = box.offsetWidth,
        h = box.offsetHeight;
      const left = Math.min(Math.max(EDGE, r.right - w), innerWidth - w - EDGE);
      const below = r.bottom + GAP + h <= innerHeight - EDGE;
      setPlace({ left, top: below ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - h) });
    };
    position();
    addEventListener("resize", position);
    addEventListener("scroll", position, true);
    return () => {
      removeEventListener("resize", position);
      removeEventListener("scroll", position, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...watch]);

  /* Escape closes the menu and hands focus back to its button */
  const onKeyDown = (e: { key: string }) => {
    if (e.key !== "Escape" || !open) return;
    setOpen(false);
    wrap.current?.querySelector("button")?.focus();
  };

  return { open, toggle, setOpen, place, wrap, panel, onKeyDown };
}
