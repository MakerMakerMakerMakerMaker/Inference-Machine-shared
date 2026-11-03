import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LATEST_NODE_GPUS, LATEST_PARTS, NODE_GPUS } from "../engine/constants";
import { rdTableCell, servingTpsPerGpu } from "../game/rdTable";
import { useControls, useRd } from "../game/store";
import { playSound } from "../sound";
import type { RdJobView, RdTab } from "../game/types";
import { blogLinkProps } from "./blogLink";
import { DeployCount, EmptyNote, RentMore } from "./deploy";
import { EliseScene } from "./EliseScene";
import { gpusWord, pickedGpu } from "./gpuLabels";
import { flashMobTabs, Fold, RowSplit, useLayout } from "./layout";
import { LockIco, RdIco, StatsIco } from "./panelIcons";
import { RackHeader } from "./RackHeader";
import { openRdReveal } from "./RdReveal";

const HOLD_MS = 1200;

const DAY_PARTS = ["Night", "Morning", "Afternoon", "Evening"] as const;

function dayArc(index: number) {
  const gap = 28;
  const a0 = -90 + index * 90 + gap / 2;
  const a1 = -90 + (index + 1) * 90 - gap / 2;
  const rad = (d: number) => (d * Math.PI) / 180;
  const r = 11;
  const x0 = 16 + r * Math.cos(rad(a0));
  const y0 = 16 + r * Math.sin(rad(a0));
  const x1 = 16 + r * Math.cos(rad(a1));
  const y1 = 16 + r * Math.sin(rad(a1));
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

function DayRing({ fill }: { fill: number }) {
  const n = Number.isFinite(fill) ? Math.min(4, Math.max(0, fill)) : 0;
  const part = Math.min(3, Math.floor(n));
  return (
    <span className="rdDay" role="img" aria-label={DAY_PARTS[part]}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => {
          const amt = Math.min(1, Math.max(0, n - i));
          const d = dayArc(i);
          return (
            <g key={i}>
              <path d={d} />
              <path d={d} className="on" pathLength={1} strokeDasharray={`${amt} 1`} />
            </g>
          );
        })}
      </svg>
    </span>
  );
}

/* A button that acts only after being held for HOLD_MS, with a fill sliding under
   the label. onDone returning false (the action did not happen) resets it.
   onProgress hears the fill (0 to 1) every frame, and 0 when the press ends. */
export function HoldInstall({
  idle = "Hold to deploy",
  busy = "Deploying new version...",
  disabled = false,
  onDone,
  onProgress,
}: {
  idle?: ReactNode;
  busy?: ReactNode;
  disabled?: boolean;
  onDone: () => boolean | void;
  onProgress?: (pct: number) => void;
}) {
  const progress = useRef(onProgress);
  progress.current = onProgress;
  const [pct, setPct] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const holding = useRef(false);
  const raf = useRef(0);
  const hush = useRef<() => void>(() => {});
  const stop = () => {
    holding.current = false;
    hush.current();
    cancelAnimationFrame(raf.current);
    setPct(0);
    setDeploying(false);
    progress.current?.(0);
  };
  const start = () => {
    if (holding.current || disabled) return;
    holding.current = true;
    hush.current = playSound("gpu.deploy");
    setDeploying(true);
    const t0 = performance.now();
    raf.current = requestAnimationFrame(frame(t0));
  };
  useEffect(() => {
    const up = () => {
      if (holding.current) stop();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (holding.current) hush.current();
      cancelAnimationFrame(raf.current);
    };
  }, []);
  const frame = (t0: number) => (now: number) => {
    if (!holding.current) return;
    const p = Math.min(1, (now - t0) / HOLD_MS);
    setPct(p);
    progress.current?.(p);
    if (p >= 1) {
      holding.current = false;
      if (onDone() === false) stop();
      return;
    }
    raf.current = requestAnimationFrame(frame(t0));
  };
  /* Space or Enter held down works like a held press */
  const holdKey = (key: string) => key === " " || key === "Enter";
  return (
    <button
      type="button"
      className="big rdHold"
      data-sound="none"
      disabled={disabled}
      onPointerDown={e => {
        if (holding.current || disabled) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic events have no capture */
        }
        start();
      }}
      onPointerUp={() => {
        if (holding.current) stop();
      }}
      onPointerCancel={() => {
        if (holding.current) stop();
      }}
      onKeyDown={e => {
        if (!holdKey(e.key)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={e => {
        if (holdKey(e.key) && holding.current) stop();
      }}
      onBlur={() => {
        if (holding.current) stop();
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <i style={{ width: `${pct * 100}%` }} />
      <span>{deploying ? busy : idle}</span>
    </button>
  );
}

function RdMarks({ job }: { job: RdJobView }) {
  return (
    <span
      className="rdTrack"
      role="img"
      aria-label={`${job.points} of ${job.need} research points`}
      data-tip={"Finish every step. The last one unlocks the full gain."}
    >
      {Array.from({ length: job.need }, (_, i) => {
        const on = i < job.points;
        const goal = i === job.need - 1;
        return (
          <span key={i} className="rdStep">
            {i > 0 ? (
              <i className={on ? (goal ? "rdLine on goal" : "rdLine on") : "rdLine"} />
            ) : null}
            <i
              className={["rdDot", on ? "on" : "", goal ? "goal" : ""]
                .filter(Boolean)
                .join(" ")}
            />
          </span>
        );
      })}
    </span>
  );
}

type RdDraft = {
  key: number;
  model: string;
  part: string;
  /** null: as many as fit */
  copies: number | null;
};

type RdGpuOpt = {
  id: string;
  name: string;
  unlocked: boolean;
  unused?: number;
};

function RdDraftJob({
  draft,
  models,
  parts,
  hold,
  avail,
  jobs,
  onChange,
  onStarted,
  onCancel,
}: {
  draft: RdDraft;
  models: { id: string; name: string }[];
  parts: RdGpuOpt[];
  hold: Record<string, Record<string, number>>;
  avail: Record<string, Record<string, boolean>>;
  jobs: RdJobView[];
  onChange: (next: RdDraft) => void;
  onStarted: () => void;
  onCancel: () => void;
}) {
  const openParts = parts.filter(p => p.unlocked);
  const runnable = (model: string, gpu: string) => !!avail[model]?.[gpu];
  const openModels = models.filter(m => openParts.some(p => runnable(m.id, p.id)));
  const modelId = openModels.some(m => m.id === draft.model)
    ? draft.model
    : openModels[0]?.id || "";
  const fitParts = openParts.filter(p => runnable(modelId, p.id));
  const partId = fitParts.some(p => p.id === draft.part)
    ? draft.part
    : fitParts[0]?.id || "";
  const perCopy = Math.max(1, hold[modelId]?.[partId] ?? 1);
  const needOf = (model: string, part: string) => Math.max(1, hold[model]?.[part] ?? 1);
  const modelOption = (m: { id: string; name: string }) => {
    const land = runnable(m.id, partId)
      ? partId
      : openParts.find(p => runnable(m.id, p.id))?.id || partId;
    const where = land === partId ? "" : ` on ${parts.find(p => p.id === land)?.name}`;
    return `${m.name} · ${gpusWord(needOf(m.id, land))}${where}`;
  };
  const partRow = parts.find(p => p.id === partId);
  const unused = partRow?.unused ?? 0;
  const maxCopies = Math.floor(unused / perCopy);
  const copies =
    maxCopies < 1 ? 0 : Math.min(Math.max(1, draft.copies ?? maxCopies), maxCopies);
  const held = jobs.find(j => j.model === modelId && j.part === partId);
  const blocked = !!held && held.phase !== "search";
  const canAdd =
    !!modelId && !!partId && !!partRow?.unlocked && copies >= 1 && !blocked;
  const name = partRow?.name || "GPU";
  const total = copies * perCopy;
  const [modelOpen, setModelOpen] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const showMenu = (set: (open: boolean) => void) => flushSync(() => set(true));
  const hideMenu = (set: (open: boolean) => void) => flushSync(() => set(false));
  const cast = canAdd ? window.__board?.rdForecast(modelId, partId, total) : null;
  const topped = !!cast && cast.pct < 1;
  const castDays =
    cast?.days == null
      ? null
      : cast.days < 1
        ? "under a day"
        : `~${Math.round(cast.days)} day${Math.round(cast.days) === 1 ? "" : "s"}`;

  return (
    <div className="serveJob draft">
      <div className="serveDraftT">New Elise RSI run</div>
      <div className="serveDraftFields">
        <div className="ctl">
          <label htmlFor={`rdModel-${draft.key}`}>Model</label>
          <select
            id={`rdModel-${draft.key}`}
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
              const still = runnable(model, partId);
              const part = still
                ? partId
                : openParts.find(p => runnable(model, p.id))?.id || "";
              onChange({ ...draft, model, part });
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
          <label htmlFor={fitParts.length > 1 ? `rdPart-${draft.key}` : undefined}>
            GPU
          </label>
          {fitParts.length > 1 ? (
            <select
              id={`rdPart-${draft.key}`}
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
              {fitParts.map(p => (
                <option key={p.id} value={p.id}>
                  {pickedGpu(p.name, needOf(modelId, p.id), gpuOpen || p.id !== partId)}
                </option>
              ))}
            </select>
          ) : (
            <span className="serveGpuFixed" id={`rdPart-${draft.key}`}>
              {fitParts[0]
                ? pickedGpu(fitParts[0].name, needOf(modelId, fitParts[0].id), false)
                : openParts[0]?.name || "No GPU unlocked"}
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
      {cast && cast.pct >= 1 && castDays && (
        <div className="rdCast" role="status">
          <span>
            Expected time
            <b>{castDays}</b>
          </span>
          <span>
            Expected gain
            <b className="hi">+{cast.pct}% throughput</b>
          </span>
        </div>
      )}
      <div className="serveDraftActs">
        <button
          type="button"
          className="big primary"
          disabled={!canAdd || topped}
          onClick={() => {
            if (window.__board?.rdAdd(modelId, partId, total)) onStarted();
          }}
        >
          {blocked
            ? "Deploy discovered improvements first"
            : topped
              ? "At the research ceiling"
              : canAdd
                ? "Launch Elise RSI"
                : `Need ${perCopy} unused ${name}${perCopy === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="serveRm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* While "Hold to deploy" fills, the whole card shakes, harder as it fills. Whole
   pixels and a new offset every couple of frames, so it judders like a sprite. */
const SHAKE_EVERY_MS = 34;
function useHoldShake() {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const shake = (p: number) => {
    const el = ref.current;
    if (!el) return;
    if (!(p > 0) || p >= 1) {
      el.style.transform = "";
      return;
    }
    const now = performance.now();
    if (now - last.current < SHAKE_EVERY_MS) return;
    last.current = now;
    const amp = 0.6 + p * p * 3.4;
    const jig = () => Math.round((Math.random() * 2 - 1) * amp);
    const tilt = ((Math.random() * 2 - 1) * p * 0.9).toFixed(2);
    el.style.transform = `translate(${jig()}px, ${Math.round(jig() * 0.6)}px) rotate(${tilt}deg)`;
  };
  return { ref, shake };
}

function RdJob({
  job,
  mul,
  rent,
  onInstalled,
}: {
  job: RdJobView;
  mul: number;
  rent: number;
  onInstalled: () => void;
}) {
  const [sure, setSure] = useState(false);
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (job.phase !== "search") setSure(false);
  }, [job.phase]);
  useEffect(() => {
    if (job.phase !== "found") {
      setGlow(false);
      return;
    }
    setGlow(true);
    const t = window.setTimeout(() => setGlow(false), 4000);
    return () => window.clearTimeout(t);
  }, [job.phase, job.id]);
  const hit = glow;
  const { ref: shakeRef, shake } = useHoldShake();
  const controls = useControls();
  const working = !!controls && !controls.paused && !job.down;
  /* while searching, count down the estimated time left; once found, the total */
  const searching = job.phase === "search";
  const clock = searching ? job.leftLabel : job.spentLabel;
  const gain =
    job.phase === "search"
      ? { label: "Improvement so far", value: `+${job.soFar}%` }
      : null;
  return (
    <div
      ref={shakeRef}
      className={hit ? "rdJob hit" : "rdJob"}
      data-tip={job.down || undefined}
    >
      <div className="serveJobH">
        <b>
          {job.modelName} on {job.gpus} x {job.partName}
        </b>
      </div>
      {job.phase === "search" ? <RdMarks job={job} /> : null}
      {job.phase === "found" && job.faster > 0 ? (
        <p className="rdHow rdFound">
          <span className="rdFoundT">Elise RSI Found An Improvement</span>
          <span className="rdHowB">
            Deploy the optimization to find out what has been improved!
          </span>
        </p>
      ) : null}
      <div className={gain ? "rdCast rdClock withElise" : "rdCast rdClock"}>
        <span>
          <span>
            {job.down ? "Paused" : searching ? "Time remaining" : "Total time"}
          </span>
          <b
            data-tip={
              searching
                ? "An estimate. Elise finds each step after a random wait, so a run can land early or late."
                : undefined
            }
          >
            {clock ? <span className="rdDays">{clock}</span> : null}
            <DayRing fill={searching ? job.leftFill : job.dayFill} />
          </b>
        </span>
        {gain ? <EliseScene running={working} /> : null}
        {gain ? (
          <span>
            <span>{gain.label}</span>
            <b className={job.soFar < 1 ? undefined : "hi"}>{gain.value}</b>
          </span>
        ) : null}
      </div>
      {job.phase === "found" && job.faster > 0 ? (
        <HoldInstall
          onProgress={shake}
          onDone={() => {
            /* what the popup reveals, read before the install removes the job */
            const reveal = {
              model: job.model,
              part: job.part,
              modelName: job.modelName,
              partName: job.partName,
              gpus: job.gpus,
              title: job.title,
              faster: job.faster,
              gainMul: job.gainMul,
              mul,
              rent,
            };
            if (window.__board?.rdInstall(job.id) === false) return false;
            flashMobTabs(["serve", "stats"]);
            onInstalled();
            openRdReveal({
              ...reveal,
              /* every improvement deployed this game, this one included */
              level: Object.values(window.__board?.S.rdCount ?? {}).reduce(
                (sum, n) => sum + (n > 0 ? n : 0),
                0
              ),
            });
          }}
        />
      ) : null}
      {job.phase === "search" ? (
        <DeployCount
          copies={Math.max(1, Math.round(job.gpus / Math.max(1, job.quantum)))}
          maxCopies={Math.floor(job.maxGpus / Math.max(1, job.quantum))}
          perCopy={Math.max(1, job.quantum)}
          onCopies={n =>
            window.__board?.rdSetGpus(job.id, n * Math.max(1, job.quantum))
          }
          end={
            <span className="serveEnd">
              <RentMore
                part={job.part}
                assigns="this Elise RSI run"
                onRented={rented =>
                  /* at least one more deployment, using spare GPUs too; the
                     engine snaps to whole deployments and caps at what fits */
                  window.__board?.rdSetGpus(
                    job.id,
                    job.gpus + Math.max(rented, Math.max(1, job.quantum))
                  )
                }
              />
              <button
                type="button"
                className={sure ? "serveRm sure" : "serveRm"}
                onClick={() => {
                  if (!sure) {
                    setSure(true);
                    return;
                  }
                  if (job.points > 0) window.__board?.rdTerminate(job.id);
                  else window.__board?.rdRemove(job.id);
                }}
                onMouseLeave={() => setSure(false)}
              >
                {sure ? "Are you sure?" : "Terminate early"}
              </button>
            </span>
          }
        />
      ) : null}
    </div>
  );
}

const TABS: { id: RdTab; label: string; note: string }[] = [
  {
    id: "profit",
    label: "Profit",
    note: "Revenue minus GPU rent, per day per GPU. Assumes 100% utilization. In practice, utilization might be lower when your market share is low.",
  },
  { id: "tps", label: "Tok/s", note: "Blended tok/s per GPU (90% input / 10% output)" },
  { id: "gpus", label: "GPUs required", note: "GPUs per deployment" },
  { id: "price", label: "Price per token", note: "$/1M tokens" },
  {
    id: "demand",
    label: "Demand",
    note: "Deployments to cover the whole market (100% share) at their serving capacity. Share matches what your GPUs can serve, up to the whole market, and eases down when you stop.",
  },
];

export function GainNum({ gen, children }: { gen?: number; children: ReactNode }) {
  if (!gen) return <>{children}</>;
  return (
    <span key={gen} className="gainPop">
      {children}
    </span>
  );
}

function RdVal({ now, was, pop }: { now: string; was?: string | null; pop?: number }) {
  const shown = <GainNum gen={pop}>{now}</GainNum>;
  if (!was || was === now) return shown;
  return (
    <span className="rdPair">
      <s>{was}</s>
      {shown}
    </span>
  );
}

export function RdPanel() {
  const rd = useRd();
  const nextDraft = useRef(1);
  const [drafts, setDrafts] = useState<RdDraft[]>([]);
  const models = (rd?.models ?? []).filter(m => m.released);
  const gpuCols = rd?.gpus ?? [];
  const avail = rd?.avail ?? {};
  const hold = rd?.hold ?? {};
  const jobs = rd?.jobs ?? [];
  const listed = jobs.length > 0 || drafts.length > 0;
  const rerun = (j: RdJobView) =>
    setDrafts(list =>
      list.some(d => d.model === j.model && d.part === j.part)
        ? list
        : [
            ...list,
            {
              key: nextDraft.current++,
              model: j.model,
              part: j.part,
              copies: Math.max(1, Math.round(j.gpus / Math.max(1, j.quantum))),
            },
          ]
    );

  return (
    <div className="rackWrap" id="rdWrap">
      <RackHeader kind="rd" />
      <div id="rdPanel" className="panel">
        <h2>
          <span className="panelTitle">
            <RdIco />
            R&amp;D
          </span>
          <a id="rdElise" {...blogLinkProps("elise")}>
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
            Powered by Elise RSI
          </a>
        </h2>
        {listed ? (
          <div id="rdJobs">
            {jobs.map(job => (
              <RdJob
                key={job.id}
                job={job}
                mul={rd?.boosts?.[job.model]?.[job.part] || 1}
                rent={gpuCols.find(g => g.id === job.part)?.rent ?? 0}
                onInstalled={() => rerun(job)}
              />
            ))}
            {drafts.map(draft => (
              <RdDraftJob
                key={draft.key}
                draft={draft}
                models={models}
                parts={gpuCols}
                hold={hold}
                avail={avail}
                jobs={jobs}
                onChange={next =>
                  setDrafts(list => list.map(d => (d.key === next.key ? next : d)))
                }
                onStarted={() =>
                  setDrafts(list => list.filter(d => d.key !== draft.key))
                }
                onCancel={() =>
                  setDrafts(list => list.filter(d => d.key !== draft.key))
                }
              />
            ))}
          </div>
        ) : (
          <EmptyNote which="rd" />
        )}
        <button
          type="button"
          className={listed ? "serveNew" : "serveNew nudge"}
          id="rdNew"
          data-tip="Start Elise RSI jobs on spare GPUs to improve your inference engine."
          onClick={() => {
            const key = nextDraft.current++;
            const pick = rd?.pick;
            setDrafts(list => [
              ...list,
              {
                key,
                model: pick?.model || "",
                part: pick?.part || "",
                copies: null,
              },
            ]);
          }}
        >
          + Optimize with Elise RSI
        </button>
      </div>
    </div>
  );
}

function NoFit({
  gpu,
  need,
  name,
  gpuName,
}: {
  gpu: string;
  need?: number;
  name: string;
  gpuName: string;
}) {
  const node = (LATEST_PARTS as readonly string[]).includes(gpu)
    ? LATEST_NODE_GPUS
    : NODE_GPUS;
  const tip =
    need != null && need > node
      ? `${name} doesn't fit on ${gpuName}: it needs ${need} GPUs, one server holds ${node}`
      : `${name} isn't supported on ${gpuName}`;
  return (
    <span className="noFit" data-tip={tip} aria-label={tip}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M4.2 11.8 L11.8 4.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function UpcomingName() {
  return (
    <span className="upcomingName">
      <LockIco />
      Upcoming model
    </span>
  );
}

function CellLock() {
  return (
    <span className="cellLock" aria-label="Locked">
      <LockIco />
    </span>
  );
}

function LockedSpan({ label, rows }: { label: string; rows: number }) {
  const parts = label.match(/^(Unlocks at)\s+(.+)$/);
  return (
    <td className="lockedCol" rowSpan={rows}>
      <span className="rentLock">
        <LockIco />
        <span>
          {parts ? (
            <>
              {parts[1]}
              <br />
              {parts[2]}
            </>
          ) : (
            label
          )}
        </span>
      </span>
    </td>
  );
}

export function StatsPanel() {
  const rd = useRd();
  const [tab, setTab] = useState<RdTab>("profit");
  const gpuCols = rd?.gpus ?? [];
  const avail = rd?.avail ?? {};
  const hold = rd?.hold ?? {};
  const onGpu = (model: string, gpu: string) => !!avail[model]?.[gpu];
  const fits = (id: string) => gpuCols.some(g => onGpu(id, g.id));
  const notOut = new Set((rd?.models ?? []).filter(m => !m.released).map(m => m.id));
  const upcoming = (id: string) =>
    notOut.has(id) || !gpuCols.some(g => g.unlocked && onGpu(id, g.id));
  const models = (rd?.models ?? []).filter(m => fits(m.id));
  const lit = new Set(models.filter(m => m.aura).map(m => m.id));
  const rowCls = (id: string) =>
    [upcoming(id) ? "upcoming" : "", !upcoming(id) && lit.has(id) ? "modelAura" : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const demand = (rd?.demand ?? []).filter(row => fits(row.id));
  const serving = rd?.serving ?? {};
  const boosts = rd?.boosts ?? {};
  const gain = rd?.gain;
  const popped = (model: string, part: string) =>
    gain && gain.model === model && gain.part === part ? gain.gen : 0;
  const active = TABS.find(t => t.id === tab) || TABS[0];
  const layout = useLayout();
  const collapsed = !!layout.collapsed.stats;
  const cls = [collapsed ? "collapsed" : "", layout.h.stats ? "hasH" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div id="statsPanel" className={cls ? `panel ${cls}` : "panel"}>
      <RowSplit id="stats" edge="above" />
      <h2>
        <span className="panelTitle">
          <Fold id="stats" />
          <StatsIco />
          Stats
        </span>
      </h2>
      <div id="rdTabs">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? "on" : undefined}
            /* the note under the table, as a tip: on a laptop the note itself is
               hidden (board.css) */
            data-tip={`${t.label}\n${t.note}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="rdBody">
        {tab === "demand" ? (
          <table id="rdDemand">
            <colgroup>
              <col />
              <col className="demWide" />
              <col className="demMid" />
              <col className="demWide" />
              {gpuCols.map(g => (
                <col key={g.id} className="gpuCol" />
              ))}
            </colgroup>
            <tbody>
              <tr>
                <th className="spanHead" rowSpan={2}>
                  Model
                </th>
                <th className="spanHead" rowSpan={2}>
                  Demand (M tok/s)
                </th>
                <th className="spanHead" rowSpan={2}>
                  Market share
                </th>
                <th className="spanHead" rowSpan={2}>
                  Demand on you (M tok/s)
                </th>
                <th colSpan={Math.max(1, gpuCols.length)}>
                  Deployments to cover demand
                </th>
              </tr>
              <tr>
                {gpuCols.map(g => (
                  <th
                    key={g.id}
                    className={
                      [
                        "gpuCol",
                        g.unlocked ? "" : "locked",
                        g.unlocked && g.aura ? "gpuAura" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    {g.unlocked ? g.name : null}
                  </th>
                ))}
              </tr>
              {demand.map((row, rowIndex) => {
                return (
                  <tr key={row.id} className={rowCls(row.id)}>
                    <td>{upcoming(row.id) ? <UpcomingName /> : row.name}</td>
                    <td className="n">{row.market}</td>
                    <td className={row.listed ? "n on" : "n"}>{row.share}</td>
                    <td className="n">{row.yours}</td>
                    {gpuCols.map(g => {
                      if (!g.unlocked) {
                        if (rowIndex !== 0) return null;
                        return (
                          <LockedSpan
                            key={g.id}
                            label={g.unlock || "Locked"}
                            rows={demand.length}
                          />
                        );
                      }
                      if (upcoming(row.id)) {
                        return (
                          <td key={g.id} className={g.aura ? "n gpuAura" : "n"}>
                            <CellLock />
                          </td>
                        );
                      }
                      if (!onGpu(row.id, g.id)) {
                        return (
                          <td key={g.id} className={g.aura ? "n gpuAura" : "n"}>
                            <NoFit
                              gpu={g.id}
                              need={hold[row.id]?.[g.id]}
                              name={row.name}
                              gpuName={g.name}
                            />
                          </td>
                        );
                      }
                      const tps =
                        servingTpsPerGpu(row.id, g.id, boosts[row.id]?.[g.id] || 1) ||
                        0;
                      const perCopy = Math.max(1, hold[row.id]?.[g.id] ?? 1);
                      const cover =
                        tps > 0
                          ? Math.ceil(
                              Math.max(0, row.marketToks) / (tps * perCopy)
                            ).toLocaleString("en-US")
                          : "–";
                      return (
                        <td key={g.id} className={g.aura ? "n gpuAura" : "n"}>
                          <GainNum gen={popped(row.id, g.id)}>{cover}</GainNum>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : models.length ? (
          <table id="rdTps">
            <colgroup>
              <col />
              {gpuCols.map(g => (
                <col key={g.id} className="gpuCol" />
              ))}
            </colgroup>
            <tbody>
              <tr>
                <th>Model</th>
                {gpuCols.map(g => (
                  <th
                    key={g.id}
                    className={
                      [
                        "gpuCol",
                        g.unlocked ? "" : "locked",
                        g.unlocked && g.aura ? "gpuAura" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
                    {g.unlocked ? g.name : null}
                  </th>
                ))}
              </tr>
              {models.map((m, rowIndex) => {
                return (
                  <tr key={m.id} className={rowCls(m.id)}>
                    <td>{upcoming(m.id) ? <UpcomingName /> : m.name}</td>
                    {gpuCols.map(g => {
                      if (!g.unlocked) {
                        if (rowIndex !== 0) return null;
                        return (
                          <LockedSpan
                            key={g.id}
                            label={g.unlock || "Locked"}
                            rows={models.length}
                          />
                        );
                      }
                      if (upcoming(m.id)) {
                        return (
                          <td key={g.id} className={g.aura ? "n gpuAura" : "n"}>
                            <CellLock />
                          </td>
                        );
                      }
                      if (!onGpu(m.id, g.id)) {
                        return (
                          <td key={g.id} className={g.aura ? "n gpuAura" : "n"}>
                            <NoFit
                              gpu={g.id}
                              need={hold[m.id]?.[g.id]}
                              name={m.name}
                              gpuName={g.name}
                            />
                          </td>
                        );
                      }
                      const on = !!serving[m.id]?.[g.id];
                      const mul = boosts[m.id]?.[g.id] || 1;
                      const shown = rdTableCell(m.id, g.id, mul, g.rent ?? 0);
                      const loss =
                        tab === "profit" &&
                        shown.profitUsd != null &&
                        shown.profitUsd < 0;
                      const cls = [
                        "n",
                        g.aura ? "gpuAura" : "",
                        on ? "on" : "",
                        mul > 1 ? "boost" : "",
                        loss ? "loss" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <td key={g.id} className={cls}>
                          {tab === "gpus" ? (
                            (hold[m.id]?.[g.id] ?? "–")
                          ) : tab === "price" ? (
                            shown.price
                          ) : tab === "tps" ? (
                            <RdVal
                              now={shown.tps}
                              was={shown.tpsWas}
                              pop={popped(m.id, g.id)}
                            />
                          ) : (
                            <RdVal
                              now={shown.profit}
                              was={shown.profitWas}
                              pop={popped(m.id, g.id)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <div id="rdNote">{active.note}</div>
      </div>
    </div>
  );
}
