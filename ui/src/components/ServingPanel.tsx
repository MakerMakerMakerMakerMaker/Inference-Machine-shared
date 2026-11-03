import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import { MINE_ID } from "../engine/constants";
import { useServe } from "../game/store";
import { playSound } from "../sound";
import type { ServeJobView, ServePartOpt } from "../game/types";
import { DeployCount, EmptyNote, RentMore } from "./deploy";
import { gpusWord, pickedGpu } from "./gpuLabels";
import { atCapacity } from "./serveCap";
import { ServingIco } from "./panelIcons";
import { RackHeader } from "./RackHeader";
import { GainNum, HoldInstall } from "./RdPanel";
import { useServeBump } from "./RdReveal";

/** Same bands the fleet boxes use, so a serving GPU and its utilization figure match. */
export function utilTone(util: number): "hi" | "mid" | "low" {
  if (util >= 0.8) return "hi";
  if (util >= 0.5) return "mid";
  return "low";
}

/* Gap between one bumped card (and its ding) and the next. */
const BUMP_STAGGER_MS = 110;

/* At the end of every in-game day the cards re-sort by profit, highest first, and
   slide from their old places to their new ones with a whoosh. Between days the
   order holds still, and a new deployment joins at the bottom until the next sort.
   The slide is FLIP: measure each card, re-order, measure again, start each card
   at its old offset and let it glide to zero.
   While the pointer is over the list the sort waits, so a card never slides out
   from under a click; it runs the moment the pointer leaves. */
const SORT_MS = 420;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function useDailySort(jobs: ServeJobView[], day: number | undefined) {
  const [order, setOrder] = useState<string[]>([]);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const before = useRef<Map<string, number> | null>(null);
  const lastDay = useRef<number | undefined>(undefined);
  const hovered = useRef(false);
  const pending = useRef(false);

  const rank = new Map<string, number>(order.map((id: string, i: number) => [id, i]));
  const shown = jobs
    .map((job, i) => ({ job, i }))
    .sort(
      (a, b) =>
        (rank.get(a.job.id) ?? Infinity) - (rank.get(b.job.id) ?? Infinity) || a.i - b.i
    )
    .map(x => x.job);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const sortNow = () => {
    pending.current = false;
    const now = shownRef.current;
    /* a stable sort of what is on screen, so ties keep their places */
    const next = [...now]
      .sort((a, b) => (b.profitUsd ?? 0) - (a.profitUsd ?? 0))
      .map(j => j.id);
    if (next.every((id, i) => id === now[i].id)) return;
    const tops = new Map<string, number>();
    cards.current.forEach((el, id) => tops.set(id, el.getBoundingClientRect().top));
    before.current = tops;
    setOrder(next);
  };

  useEffect(() => {
    if (day == null) return;
    const prev = lastDay.current;
    lastDay.current = day;
    if (prev === undefined || day === prev) return;
    if (hovered.current) pending.current = true;
    else sortNow();
    // sortNow reads everything through refs; only a new day should trigger it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  /* on the list: hold any sort while the pointer is over it */
  const listHover = {
    onPointerEnter: () => {
      hovered.current = true;
    },
    onPointerLeave: () => {
      hovered.current = false;
      if (pending.current) sortNow();
    },
  };

  useLayoutEffect(() => {
    const tops = before.current;
    before.current = null;
    if (!tops) return;
    let moved = false;
    cards.current.forEach((el, id) => {
      const was = tops.get(id);
      if (was == null) return;
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      moved = true;
      if (reducedMotion.matches) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      /* cards moving up pass over the ones moving down */
      el.style.position = "relative";
      el.style.zIndex = dy > 0 ? "2" : "1";
      void el.getBoundingClientRect();
      el.style.transition = `transform ${SORT_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.08)`;
      el.style.transform = "";
      const done = () => {
        el.style.transition = "";
        el.style.zIndex = "";
        el.style.position = "";
        el.removeEventListener("transitionend", done);
      };
      el.addEventListener("transitionend", done);
    });
    if (moved) playSound("serve.whoosh");
  }, [order]);

  const cardRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) cards.current.set(id, el);
    else cards.current.delete(id);
  };
  return { shown, cardRef, listHover, cards };
}

function profitTone(n: number) {
  return n >= 0 ? "hi" : "low";
}

function utilLabel(util: number) {
  return Math.round(util * 100) + "%";
}

export const GPU_UTIL_TIP =
  "GPU utilization\nLow utilization means you are not getting enough inference requests to occupy all the GPUs dedicated to this inference job. Get a larger market share to increase utilization.";

const REVENUE_TIP =
  "Revenue\nHow much you earn from this deployment. A low number usually means one of two things: your market share is still small, so keep the model hosted and more clients will find you, or the engine is too slow to serve them. Optimize it with Elise.";

const EXPENSES_TIP =
  "Expenses\nWhat you pay to rent these GPUs. Discouns become available as you buy more GPUs. Once unlocked, more powerful GPUs can provide better cost/performance tradeoff. GPUs you have already rented cannot be returned.";

const PROFIT_TIP =
  "Profit\nRevenue minus expenses. Raise it by earning more or by spending less on rent. A negative number means this deployment is losing money. Increase market share to increase revenue or optimize your engine with Elise.  Get more information for your market research from the Stats pannel.";

function withMax(text: string, max?: boolean) {
  return max ? text + " (max)" : text;
}

/* Arrow while the number has moved, gone once it has sat still.
   `fine` is for a value shown rounded to 0.01: below that the label stays
   0.00 while it is already climbing, so any real movement counts. */
const TREND_MS = 4000;

function useTrend(value: number, fine = false): "up" | "dn" | "" {
  const hist = useRef<{ usd: number; at: number }[]>([
    { usd: value, at: performance.now() },
  ]);
  const [tick, setTick] = useState(0);

  const now = performance.now();
  const last = hist.current[hist.current.length - 1];
  if (last.usd !== value) hist.current.push({ usd: value, at: now });
  const cutoff = now - TREND_MS;
  let baseIdx = 0;
  for (let i = 0; i < hist.current.length; i++) {
    if (hist.current[i].at <= cutoff) baseIdx = i;
    else break;
  }
  const base = hist.current[baseIdx].usd;
  if (baseIdx > 0) hist.current.splice(0, baseIdx);
  const delta = value - base;
  const hidden = fine && Math.abs(value) < 0.005 && Math.abs(base) < 0.005;
  const eps = hidden ? 0 : Math.max(0.005, Math.abs(base) * 0.004);
  const dir = delta > eps ? "up" : delta < -eps ? "dn" : "";

  useEffect(() => {
    const nxt = hist.current[1];
    if (!nxt && !dir) return;
    const from = nxt ? nxt.at : hist.current[0].at;
    const wait = from + TREND_MS - performance.now() + 40;
    const id = window.setTimeout(() => setTick(n => n + 1), Math.max(40, wait));
    return () => window.clearTimeout(id);
  }, [value, dir, tick]);

  return dir;
}

function TrendFigure({
  value,
  text,
  pop,
  fine = false,
}: {
  value: number;
  text: string;
  pop: number;
  fine?: boolean;
}) {
  const dir = useTrend(value, fine);
  return (
    <b className={dir ? "revTrend" : undefined}>
      {dir ? (
        <span className={dir === "up" ? "revUp" : "revDn"}>
          <TrendIcon down={dir === "dn"} />
        </span>
      ) : null}
      <GainNum gen={pop}>{text}</GainNum>
    </b>
  );
}

function ProfitTrend({ value }: { value: number }) {
  const dir = useTrend(value, true);
  if (!dir) return null;
  return (
    <span className={dir === "up" ? "profitUp" : "profitDn"}>
      <TrendIcon down={dir === "dn"} />
    </span>
  );
}

export function TrendIcon({ down }: { down?: boolean }) {
  return (
    <svg className="serveIco" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d={down ? "M2.4 4.1h11.2L8 12.7z" : "M2.4 11.9h11.2L8 3.3z"}
      />
    </svg>
  );
}

export function UtilIcon() {
  return (
    <svg className="serveIco" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.2 11.4a5.8 5.8 0 0 1 11.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 11.4 L11.3 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.4" r="1.15" fill="currentColor" />
    </svg>
  );
}

function fmtMineDay(n: number) {
  if (n >= 0.01) return "$" + n.toFixed(2);
  if (n >= 0.000001) return "$" + n.toFixed(6);
  return "$" + n.toExponential(2);
}

type ServeDraft = {
  key: number;
  model: string;
  part: string;
  /** null: as many as fit */
  copies: number | null;
};

/* While "Hold to deploy" fills on a draft, the card shrinks toward 90%, easing in
   so most of the squeeze comes at the end of the hold. */
const SQUEEZE_TO = 0.9;
function useHoldSqueeze() {
  const ref = useRef<HTMLDivElement>(null);
  const squeeze = (p: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = p > 0 && p < 1 ? `scale(${1 - (1 - SQUEEZE_TO) * p * p})` : "";
  };
  return { ref, squeeze };
}

function DraftJob({
  draft,
  models,
  parts,
  hold,
  avail,
  onChange,
  onDeployed,
  onCancel,
}: {
  draft: ServeDraft;
  models: { id: string; name: string }[];
  parts: ServePartOpt[];
  hold: Record<string, Record<string, number>>;
  avail: Record<string, Record<string, boolean>>;
  onChange: (next: ServeDraft) => void;
  /** the model and GPU the deploy landed on, so that card can pop */
  onDeployed: (model: string, part: string) => void;
  onCancel: () => void;
}) {
  const { ref: squeezeRef, squeeze } = useHoldSqueeze();
  const openParts = parts.filter(p => p.unlocked);
  const okOn = (model: string, id: string) => !!avail[model]?.[id];
  const openModels = models.filter(m => openParts.some(p => okOn(m.id, p.id)));
  const modelId = openModels.some(m => m.id === draft.model)
    ? draft.model
    : openModels[0]?.id || "";
  const partOk = (id: string) => okOn(modelId, id);
  const partId = openParts.some(p => p.id === draft.part && partOk(p.id))
    ? draft.part
    : openParts.find(p => partOk(p.id))?.id || openParts[0]?.id || "";
  const perCopy = (hold[modelId] && hold[modelId][partId]) || 1;
  const needOf = (model: string, part: string) => hold[model]?.[part] ?? 1;
  const landOn = (model: string) =>
    okOn(model, partId) ? partId : openParts.find(p => okOn(model, p.id))?.id || partId;
  const modelOption = (m: { id: string; name: string }) => {
    const land = landOn(m.id);
    const where = land === partId ? "" : ` on ${parts.find(p => p.id === land)?.name}`;
    return `${m.name} · ${gpusWord(needOf(m.id, land))}${where}`;
  };
  const partRow = parts.find(p => p.id === partId);
  const unused = partRow?.unused ?? 0;
  const maxCopies = Math.floor(unused / Math.max(1, perCopy));
  const copies =
    maxCopies < 1 ? 0 : Math.min(Math.max(1, draft.copies ?? maxCopies), maxCopies);
  const mining = modelId === MINE_ID;
  const canAdd =
    !!modelId && !!partId && !!partRow?.unlocked && partOk(partId) && copies >= 1;
  const name = partRow?.name || "GPU";
  const total = copies * perCopy;
  const expect =
    modelId && partId && partRow?.unlocked && partOk(partId)
      ? (window.__board?.serveExpect(modelId, partId, copies) ?? null)
      : null;
  const [modelOpen, setModelOpen] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const showMenu = (set: (open: boolean) => void) => flushSync(() => set(true));
  const hideMenu = (set: (open: boolean) => void) => flushSync(() => set(false));

  return (
    <div className="serveJob draft" ref={squeezeRef}>
      <div className="serveDraftT">New deployment</div>
      <div className="serveDraftFields">
        <div className="ctl">
          <label htmlFor={`serveModel-${draft.key}`}>Model</label>
          <select
            id={`serveModel-${draft.key}`}
            value={modelId}
            onMouseDown={() => showMenu(setModelOpen)}
            onKeyDown={e => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ")
                showMenu(setModelOpen);
            }}
            onBlur={() => hideMenu(setModelOpen)}
            onChange={e => {
              const model = e.target.value;
              hideMenu(setModelOpen);
              onChange({ ...draft, model, part: partId });
            }}
          >
            {openModels.map(m => (
              <option key={m.id} value={m.id}>
                {modelOpen && partId ? modelOption(m) : m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ctl">
          <label htmlFor={openParts.length > 1 ? `servePart-${draft.key}` : undefined}>
            GPU
          </label>
          {openParts.length > 1 ? (
            <select
              id={`servePart-${draft.key}`}
              value={partId}
              onMouseDown={() => showMenu(setGpuOpen)}
              onKeyDown={e => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ")
                  showMenu(setGpuOpen);
              }}
              onBlur={() => hideMenu(setGpuOpen)}
              onChange={e => {
                const part = e.target.value;
                hideMenu(setGpuOpen);
                onChange({ ...draft, model: modelId, part });
              }}
            >
              {openParts.map(p => {
                const ok = partOk(p.id);
                return (
                  <option key={p.id} value={p.id} disabled={!ok}>
                    {ok
                      ? pickedGpu(
                          p.name,
                          needOf(modelId, p.id),
                          gpuOpen || p.id !== partId
                        )
                      : `${p.name} (incompatible)`}
                  </option>
                );
              })}
            </select>
          ) : (
            <span className="serveGpuFixed" id={`servePart-${draft.key}`}>
              {openParts[0]
                ? partOk(openParts[0].id)
                  ? pickedGpu(
                      openParts[0].name,
                      needOf(modelId, openParts[0].id),
                      false
                    )
                  : `${openParts[0].name} (incompatible)`
                : "No GPU unlocked"}
            </span>
          )}
        </div>
      </div>
      <DeployCount
        copies={copies}
        maxCopies={maxCopies}
        perCopy={perCopy}
        onCopies={n => onChange({ ...draft, model: modelId, part: partId, copies: n })}
        end={
          <RentMore
            part={partId}
            onRented={() =>
              onChange({ ...draft, model: modelId, part: partId, copies: null })
            }
          />
        }
      />
      {expect ? (
        <div
          className="serveExpect"
          data-tip="Final profit depends on your market share. It will take a couple of weeks for users to discover your model and start using it."
        >
          <span>
            Expected profit
            {copies < 1 ? ` for ${expect.copies} deployment` : ""}
          </span>
          <b className={expect.profitUsd < 0 ? "low" : undefined}>{expect.profit}</b>
        </div>
      ) : null}
      <div className="serveDraftActs">
        <HoldInstall
          disabled={!canAdd}
          idle={
            canAdd
              ? `Hold to ${mining ? "mine" : "deploy"} on ${total} x ${name} GPUs`
              : `Requires ${perCopy} more unused ${name} GPU${perCopy === 1 ? "" : "s"}`
          }
          busy={mining ? "Starting to mine..." : "Deploying..."}
          onProgress={squeeze}
          onDone={() => {
            if (!window.__board?.serveAdd(modelId, partId, copies)) return false;
            onDeployed(modelId, partId);
          }}
        />
        <button type="button" className="serveRm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ServingPanel() {
  const serve = useServe();
  const models = serve?.models ?? [];
  const parts = serve?.parts ?? [];
  const jobs = serve?.jobs ?? [];
  const hold = serve?.hold ?? {};
  const avail = serve?.avail ?? {};
  const nextDraft = useRef(1);
  const [drafts, setDrafts] = useState<ServeDraft[]>([]);
  const listed = jobs.length > 0 || drafts.length > 0;
  const { shown, cardRef, listHover, cards } = useDailySort(jobs, serve?.day);
  /* A deploy from a draft lands on a card, new or existing: that card pops to 110%
     and back with the power-up sound, once it has rendered. */
  const [landing, setLanding] = useState<{ model: string; part: string } | null>(null);
  useEffect(() => {
    if (!landing) return;
    const job = jobs.find(j => j.model === landing.model && j.part === landing.part);
    const el = job && cards.current.get(job.id);
    if (!el) return;
    setLanding(null);
    playSound("serve.powerup");
    el.classList.remove("deployPop");
    void el.offsetWidth;
    el.classList.add("deployPop");
    const done = () => {
      el.classList.remove("deployPop");
      el.removeEventListener("animationend", done);
    };
    el.addEventListener("animationend", done);
  }, [landing, jobs, cards]);
  /* Closing the R&D reveal bumps every card the improvement speeds up: a bounce,
     a green flash and a ding each, one after another. */
  const bump = useServeBump();
  const bumped = (job: ServeJobView) =>
    !!bump && !job.mine && job.model === bump.model && job.part === bump.part;
  const bumpOrder = jobs.filter(bumped).map(j => j.id);
  const bumpCount = bumpOrder.length;
  const bumpGen = bump?.gen;
  useEffect(() => {
    if (!bumpGen || !bumpCount) return;
    const timers = Array.from({ length: bumpCount }, (_, i) =>
      window.setTimeout(() => playSound("serve.ding"), i * BUMP_STAGGER_MS)
    );
    return () => timers.forEach(t => window.clearTimeout(t));
    // only a new bump plays; the job list ticking over must not replay it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bumpGen]);

  return (
    <div className="rackWrap" id="servingWrap">
      <RackHeader kind="serve" />
      <div className="panel" id="servingPanel">
        <h2>
          <span className="panelTitle">
            <ServingIco />
            Serving
          </span>
        </h2>
        {listed ? (
          <div id="serveJobs" {...listHover}>
            {shown.map(job => {
              const gain = serve?.gain;
              const pop =
                gain && gain.model === job.model && gain.part === job.part && !job.mine
                  ? gain.gen
                  : 0;
              const bumpAt = bumpOrder.indexOf(job.id);
              return (
                <div
                  className={[
                    "serveJob",
                    atCapacity(job) ? "atCap" : "",
                    bumpAt >= 0 ? "bump" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={job.id}
                  ref={cardRef(job.id)}
                  data-tip={job.down || undefined}
                  style={
                    bumpAt >= 0
                      ? ({
                          "--bump-delay": `${bumpAt * BUMP_STAGGER_MS}ms`,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <div className="serveJobH">
                    <span>
                      <b>
                        {job.modelName} on {job.gpus} x {job.partName}
                      </b>
                    </span>
                    <span
                      className={`serveProfit ${profitTone(job.profitUsd ?? 0)}`}
                      data-tip={PROFIT_TIP}
                    >
                      <ProfitTrend value={job.profitUsd ?? 0} />
                      <b>
                        <GainNum gen={pop}>{job.profit ?? "–"}</GainNum>
                      </b>
                    </span>
                  </div>
                  {job.mine && job.usdPerDay != null ? (
                    <div className="serveJobM">{fmtMineDay(job.usdPerDay)}/day/GPU</div>
                  ) : job.price != null ? (
                    <div className="serveJobM">
                      price: ${job.price.toFixed(2)}/1M tokens
                    </div>
                  ) : null}
                  <div className="serveJobMoney">
                    <span data-tip={REVENUE_TIP}>
                      Revenue{" "}
                      <TrendFigure
                        value={job.revenueUsd ?? 0}
                        text={job.revenue ?? "–"}
                        pop={pop}
                      />
                    </span>
                    <span data-tip={EXPENSES_TIP}>
                      Expenses <b>{job.expenses ?? "–"}</b>
                    </span>
                    <span
                      data-tip={
                        "Market share\nThe more throughput you provide, the more people will choose you as a preferred provider. The inverse is also true: drop throughput and users will go elsewhere."
                      }
                    >
                      Market share{" "}
                      {job.share == null ? (
                        <b>–</b>
                      ) : (
                        <TrendFigure
                          value={job.sharePct ?? 0}
                          text={withMax(job.share, job.shareMax)}
                          pop={0}
                          fine
                        />
                      )}
                    </span>
                    <span data-tip={job.down || GPU_UTIL_TIP}>
                      Utilization{" "}
                      <b className={utilTone(job.util ?? 0)}>
                        <GainNum gen={pop}>
                          {withMax(utilLabel(job.util ?? 0), job.utilMax)}
                        </GainNum>
                      </b>
                    </span>
                  </div>
                  <DeployCount
                    copies={job.copies}
                    maxCopies={job.maxCopies}
                    perCopy={job.perCopy}
                    onCopies={n => window.__board?.serveSetCopies(job.id, n)}
                    end={
                      <span className="serveEnd">
                        <RentMore
                          part={job.part}
                          assigns="this deployment"
                          onRented={rented =>
                            /* as many more copies as the new GPUs make (at least
                               one, using spare GPUs too); the engine caps it at
                               what fits */
                            window.__board?.serveSetCopies(
                              job.id,
                              job.copies + Math.max(1, Math.floor(rented / job.perCopy))
                            )
                          }
                        />
                        <button
                          type="button"
                          className="serveRm"
                          onClick={() => window.__board?.serveRemove(job.id)}
                        >
                          Remove
                        </button>
                      </span>
                    }
                  />
                </div>
              );
            })}
            {drafts.map(draft => (
              <DraftJob
                key={draft.key}
                draft={draft}
                models={models}
                parts={parts}
                hold={hold}
                avail={avail}
                onChange={next =>
                  setDrafts(list => list.map(d => (d.key === next.key ? next : d)))
                }
                onDeployed={(model, part) => {
                  setDrafts(list => list.filter(d => d.key !== draft.key));
                  setLanding({ model, part });
                }}
                onCancel={() =>
                  setDrafts(list => list.filter(d => d.key !== draft.key))
                }
              />
            ))}
          </div>
        ) : (
          <EmptyNote which="serve" />
        )}
        <button
          type="button"
          className={listed ? "serveNew" : "serveNew nudge"}
          id="serveNew"
          data-tip="Assign GPUs to serve production traffic."
          onClick={() => {
            const key = nextDraft.current++;
            const copies = window.__board?.tutorial ? 1 : null;
            setDrafts(list => [...list, { key, model: "", part: "", copies }]);
          }}
        >
          + Serve
        </button>
      </div>
    </div>
  );
}
