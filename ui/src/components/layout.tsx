import DragIndicator from "@mui/icons-material/DragIndicator";
import ExpandMore from "@mui/icons-material/ExpandMore";
import IconButton from "@mui/material/IconButton";
import {
  useEffect,
  useLayoutEffect,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { useControls, useRd, useServe, useTutCall } from "../game/store";
import { FleetIco, MonitorIco, RdIco, ServingIco, StatsIco } from "./panelIcons";
import { atCapacity } from "./serveCap";

/** Keep this in step with the @media block in mobile.css. */
export const MOB_QUERY =
  "(max-width: 900px), (pointer: coarse) and (max-width: 1180px)";

export type MobTab = "fleet" | "serve" | "rd" | "stats" | "monitor";

const MOB_TABS: { id: MobTab; label: string; Icon: ComponentType }[] = [
  { id: "fleet", label: "Fleet", Icon: FleetIco },
  { id: "serve", label: "Serving", Icon: ServingIco },
  { id: "rd", label: "R&D", Icon: RdIco },
  { id: "stats", label: "Stats", Icon: StatsIco },
  { id: "monitor", label: "Monitoring", Icon: MonitorIco },
];

function mobNow() {
  return window.matchMedia(MOB_QUERY).matches;
}

function publishMob(tab: MobTab) {
  const root = document.documentElement;
  if (!mobNow()) {
    root.classList.remove("mob", "news-open");
    delete root.dataset.tab;
    return;
  }
  root.classList.add("mob");
  root.dataset.tab = tab;
}

export function toggleMobNews() {
  if (!mobNow()) return;
  document.documentElement.classList.toggle("news-open");
}

export function closeMobNews() {
  document.documentElement.classList.remove("news-open");
}

/* mobile.css: the tabLit animation (2.4s) plus the stagger between tabs */
const FLASH_MS = 2800;
const FLASH_STAGGER_S = 0.14;
const flashListeners = new Set<(tabs: MobTab[]) => void>();

/** Lights the given tab buttons up for a few seconds. */
export function flashMobTabs(tabs: MobTab[]) {
  flashListeners.forEach(fn => fn(tabs));
}

export function MobNav() {
  const [tab, setTab] = useState<MobTab>("fleet");
  const [lit, setLit] = useState<{ tabs: MobTab[]; gen: number }>({ tabs: [], gen: 0 });
  const rd = useRd();
  const found = !!rd.jobs?.some(j => j.phase === "found");
  /* A serving card at full utilization that could still win more of its market,
     on a GPU type that can still be rented: the card's at-capacity test. */
  const serveHot = !!useServe()?.jobs.some(atCapacity);
  /* The engine lights a newly unlocked model or GPU type for a few seconds (its
     aura); the bubble holds on until the player opens the tab that shows it. */
  const modelAura = rd.models.some(m => m.aura);
  const gpuAura = rd.gpus.some(g => g.aura);
  const run = useControls()?.music.run;
  const [unseen, setUnseen] = useState<{ stats: boolean; fleet: boolean }>({
    stats: false,
    fleet: false,
  });
  useEffect(() => {
    setUnseen({ stats: false, fleet: false });
  }, [run]);
  useEffect(() => {
    if (modelAura) setUnseen(u => (u.stats ? u : { ...u, stats: true }));
  }, [modelAura]);
  useEffect(() => {
    if (gpuAura) setUnseen(u => (u.fleet ? u : { ...u, fleet: true }));
  }, [gpuAura]);
  useEffect(() => {
    if (tab === "stats" || tab === "fleet")
      setUnseen(u => (u[tab] ? { ...u, [tab]: false } : u));
  }, [tab, unseen.stats, unseen.fleet]);
  const tutCall = useTutCall();

  const bubble = (id: MobTab): { cls: string; says: string } | null => {
    if (id === tab) return null;
    if (id === "rd" && found)
      return { cls: "mobBubble elise", says: "research complete" };
    if (id === "serve" && serveHot)
      return { cls: "mobBubble", says: "a deployment is at capacity" };
    if (id === "stats" && unseen.stats) return { cls: "mobBubble", says: "new model" };
    if (id === "fleet" && unseen.fleet)
      return { cls: "mobBubble", says: "new GPU type" };
    return null;
  };

  useEffect(() => {
    const fn = (tabs: MobTab[]) => setLit(l => ({ tabs, gen: l.gen + 1 }));
    flashListeners.add(fn);
    return () => {
      flashListeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!lit.tabs.length) return;
    const t = setTimeout(() => setLit(l => ({ ...l, tabs: [] })), FLASH_MS);
    return () => clearTimeout(t);
  }, [lit.gen]);

  useLayoutEffect(() => {
    publishMob(tab);
    const q = window.matchMedia(MOB_QUERY);
    const onChange = () => publishMob(tab);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, [tab]);

  const pick = (next: MobTab) => {
    closeMobNews();
    setTab(next);
  };

  return (
    <nav id="mobNav" aria-label="Board">
      <div className="mobTabs">
        {MOB_TABS.map(({ id, label, Icon }) => {
          const at = lit.tabs.indexOf(id);
          /* the tutorial's next step is on this tab; a one-off flash wins while it runs */
          const call = at < 0 && tutCall === id && tab !== id;
          const note = bubble(id);
          return (
            <button
              key={at < 0 ? id : `${id}-${lit.gen}`}
              type="button"
              className={at >= 0 ? "lit" : call ? "tutCall" : undefined}
              style={
                at > 0
                  ? ({ "--d": `${at * FLASH_STAGGER_S}s` } as CSSProperties)
                  : undefined
              }
              aria-label={
                note
                  ? `${label}, ${note.says}`
                  : call
                    ? `${label}, next tutorial step`
                    : label
              }
              aria-pressed={tab === id}
              onClick={() => pick(id)}
            >
              <span className="mobTabLbl" aria-hidden="true">
                {label}
              </span>
              <Icon />
              {note ? <span className={note.cls} /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export type PanelId = "time" | "fleet" | "serving" | "chart" | "rd" | "stats" | "news";

type Heights = Partial<Record<"news" | "fleet" | "stats", number>>;

type Layout = {
  left: number | null;
  collapsed: Partial<Record<PanelId, boolean>>;
  h: Heights;
};

const KEY = "im_panel_layout";

const EMPTY: Layout = { left: null, collapsed: {}, h: {} };

/* Serving and R&D have no fold button, so a fold saved before it was removed must
   not leave them shut. */
const NO_FOLD: PanelId[] = ["serving", "rd"];
function unfoldable(c: Layout["collapsed"]): Layout["collapsed"] {
  const out = { ...c };
  for (const id of NO_FOLD) delete out[id];
  return out;
}

function load(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return EMPTY;
    return {
      left: typeof raw.left === "number" ? raw.left : null,
      collapsed: unfoldable(
        raw.collapsed && typeof raw.collapsed === "object" ? raw.collapsed : {}
      ),
      h: raw.h && typeof raw.h === "object" ? raw.h : {},
    };
  } catch {
    return EMPTY;
  }
}

let layout = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(fn => fn());
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* a full disk should not break the board */
  }
}

export function applyLayout(next: Layout = layout) {
  const app = document.getElementById("app");
  if (!app) return;
  if (next.left) app.style.setProperty("--left-col", next.left + "px");
  else app.style.removeProperty("--left-col");
  (["news", "fleet", "stats"] as const).forEach(id => {
    const v = next.h[id];
    if (v) app.style.setProperty("--h-" + id, v + "px");
    else app.style.removeProperty("--h-" + id);
  });
}

function commit(next: Layout) {
  layout = next;
  applyLayout(next);
  save();
  emit();
}

export function useLayout() {
  const [v, set] = useState(layout);
  useEffect(() => {
    const fn = () => set(layout);
    listeners.add(fn);
    applyLayout(layout);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return v;
}

export function toggleCollapsed(id: PanelId) {
  commit({
    ...layout,
    collapsed: { ...layout.collapsed, [id]: !layout.collapsed[id] },
  });
}

export function setPanelHeight(id: "news" | "fleet" | "stats", px: number) {
  commit({
    ...layout,
    h: { ...layout.h, [id]: px },
    collapsed: { ...layout.collapsed, [id]: false },
  });
}

export function setLeftWidth(px: number) {
  commit({ ...layout, left: px });
}

function preview(prop: string, px: number) {
  document.getElementById("app")?.style.setProperty(prop, px + "px");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function Fold({ id }: { id: PanelId }) {
  const on = !!useLayout().collapsed[id];
  return (
    <IconButton
      size="small"
      color="inherit"
      className={on ? "panelFold collapsed" : "panelFold"}
      aria-expanded={!on}
      aria-label={on ? "Expand panel" : "Collapse panel"}
      sx={{ p: 0, width: 16, height: 16, color: "inherit" }}
      onClick={e => {
        e.stopPropagation();
        toggleCollapsed(id);
      }}
    >
      <ExpandMore sx={{ fontSize: 16 }} />
    </IconButton>
  );
}

const BOX: Record<"news" | "fleet" | "stats", string> = {
  news: "logPanel",
  fleet: "gpusPanel",
  stats: "statsPanel",
};

function DragPad() {
  return (
    <span className="dragPad">
      <DragIndicator />
    </span>
  );
}

export function RowSplit({
  id,
  edge,
}: {
  id: "news" | "fleet" | "stats";
  edge: "below" | "above";
}) {
  const collapsed = !!useLayout().collapsed[id];
  if (collapsed) return null;
  return (
    <div
      className={edge === "below" ? "rowSplit below" : "rowSplit above"}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panel"
      onPointerDown={e => {
        if (e.button !== 0) return;
        const box = document.getElementById(BOX[id]);
        const col = box?.closest("#left, #rightSection") as HTMLElement | null;
        if (!box || !col) return;
        e.preventDefault();
        const startY = e.clientY;
        const startH = box.getBoundingClientRect().height;
        let last = startH;
        box.classList.add("hasH");
        const move = (ev: PointerEvent) => {
          const dy = ev.clientY - startY;
          const next = edge === "below" ? startH + dy : startH - dy;
          const room = col.getBoundingClientRect().height - 120;
          last = Math.round(clamp(next, 72, Math.max(72, room)));
          preview("--h-" + id, last);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.classList.remove("panelSizing");
          setPanelHeight(id, last);
        };
        document.body.classList.add("panelSizing");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <DragPad />
    </div>
  );
}

export function ColSplit() {
  useLayout();
  useEffect(() => {
    const app = document.getElementById("app");
    const left = document.getElementById("left");
    if (!app || !left) return;
    const place = () => {
      const a = app.getBoundingClientRect();
      const l = left.getBoundingClientRect();
      app.style.setProperty("--split-x", l.right - a.left + "px");
      app.style.setProperty("--split-top", l.top - a.top + "px");
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(app);
    ro.observe(left);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      className="colSplit"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      onPointerDown={e => {
        if (e.button !== 0) return;
        const app = document.getElementById("app");
        const left = document.getElementById("left");
        if (!app || !left) return;
        e.preventDefault();
        const startX = e.clientX;
        const startW = left.getBoundingClientRect().width;
        let last = startW;
        const move = (ev: PointerEvent) => {
          const a = app.getBoundingClientRect();
          last = Math.round(
            clamp(startW + (ev.clientX - startX), 300, Math.max(320, a.width - 420))
          );
          preview("--left-col", last);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.classList.remove("panelSizingX");
          setLeftWidth(last);
        };
        document.body.classList.add("panelSizingX");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <DragPad />
    </div>
  );
}
