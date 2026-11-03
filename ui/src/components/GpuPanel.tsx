import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { fmt$ } from "../engine/format";
import type { GpuTypeRow, ServeJobView } from "../game/types";
import { useGpu, useServe } from "../game/store";
import { rentWhat } from "./gpuLabels";
import { Fold, RowSplit, useLayout } from "./layout";
import { CartIco, FleetIco, LockIco } from "./panelIcons";
import { useHypeRamp } from "./RippleText";
import { utilTone } from "./ServingPanel";

/* where on the profit scale (CapitalFx.tsx) the utilization bars start to ripple */
const BOX_RIPPLE_FROM = 0.7;

function sumRows(rows: GpuTypeRow[]) {
  return rows.reduce(
    (a, row) => ({
      count: a.count + (row.count ?? 0),
      serving: a.serving + (row.serving ?? 0),
      rd: a.rd + (row.rd ?? 0),
      unused: a.unused + (row.unused ?? 0),
      cost: a.cost + (row.cost ?? 0),
    }),
    { count: 0, serving: 0, rd: 0, unused: 0, cost: 0 }
  );
}

export function GpuLabel({ name }: { name: string }) {
  const cut = name.indexOf(" ");
  if (cut < 0) return <>{name}</>;
  return (
    <>
      <span className="gpuVendor">{name.slice(0, cut + 1)}</span>
      {name.slice(cut + 1)}
    </>
  );
}

const CELLS = 16;

type CellKind = "hi" | "mid" | "low" | "elise" | "idle" | "empty";

type Split = { count: number; serving: number; rd: number; unused: number };

type Bands = { hi: number; mid: number; low: number };

/** Largest remainder, then one cell for any use that would otherwise vanish. */
function apportion(weights: number[], slots: number): number[] {
  const clean = weights.map(n => Math.max(0, n));
  const out = clean.map(() => 0);
  const total = clean.reduce((a, n) => a + n, 0);
  if (!(total > 0) || slots <= 0) return out;
  const exact = clean.map(n => (n / total) * slots);
  for (let i = 0; i < exact.length; i++) out[i] = Math.floor(exact[i]);
  let used = out.reduce((a, n) => a + n, 0);
  const ranked = exact
    .map((x, i) => ({ i, frac: x - out[i] }))
    .filter(r => clean[r.i] > 0)
    .sort((a, b) => b.frac - a.frac || clean[b.i] - clean[a.i]);
  let pass = 0;
  while (used < slots && ranked.length > 0 && pass < slots) {
    out[ranked[pass % ranked.length].i] += 1;
    used += 1;
    pass += 1;
  }
  const positive = clean.filter(n => n > 0).length;
  if (positive > slots) return out;
  for (let i = 0; i < clean.length; i++) {
    if (!(clean[i] > 0) || out[i] > 0) continue;
    let donor = -1;
    for (let j = 0; j < out.length; j++) {
      if (out[j] > 1 && (donor < 0 || out[j] > out[donor])) donor = j;
    }
    if (donor < 0) break;
    out[donor] -= 1;
    out[i] += 1;
  }
  return out;
}

function servingBands(
  jobs: ServeJobView[],
  partId: string | null,
  serving: number
): Bands {
  const bands: Bands = { hi: 0, mid: 0, low: 0 };
  if (!(serving > 0)) return bands;
  for (const job of jobs) {
    if (partId && job.part !== partId) continue;
    const n = Math.max(0, job.gpus || 0);
    if (!n) continue;
    bands[utilTone(job.util ?? 0)] += n;
  }
  const seen = bands.hi + bands.mid + bands.low;
  if (!(seen > 0)) return { hi: 0, mid: 0, low: serving };
  if (Math.abs(seen - serving) < 1e-6) return bands;
  const scale = serving / seen;
  return { hi: bands.hi * scale, mid: bands.mid * scale, low: bands.low * scale };
}

/** Sixteen cells, always. Each one is an equal share of this row's rented GPUs.
    Nothing rented leaves the track empty. */
function layoutCells(weights: number[]): CellKind[] {
  const kinds: CellKind[] = ["hi", "mid", "low", "elise", "idle"];
  const total = weights.reduce((a, n) => a + Math.max(0, n), 0);
  if (!(total > 0)) return Array.from({ length: CELLS }, () => "empty");
  const counts = apportion(weights, CELLS);
  const cells: CellKind[] = [];
  kinds.forEach((kind, i) => {
    for (let n = 0; n < counts[i]; n++) cells.push(kind);
  });
  while (cells.length < CELLS) cells.push("empty");
  return cells.slice(0, CELLS);
}

function fmtCount(n: number) {
  return String(Math.round(n));
}

/** One band is just the word. A mix names how many GPUs sit in each. */
function utilLine(bands: Bands, serving: number): string | null {
  if (!(serving > 0)) return null;
  const parts = (
    [
      ["high", bands.hi],
      ["partial", bands.mid],
      ["low", bands.low],
    ] as const
  ).filter(([, n]) => n > 0.5);
  if (!parts.length) return null;
  if (parts.length === 1) return `Utilization: ${parts[0][0]}`;
  return `Utilization: ${parts.map(([name, n]) => `${fmtCount(n)} ${name}`).join(", ")}`;
}

function boxesTip(
  name: string,
  serving: number,
  rd: number,
  idle: number,
  bands: Bands
) {
  const count = serving + rd + idle;
  if (!(count > 0)) return `${name}\nNone rented yet.`;
  /* the colour key rides along here: on a laptop the one above the table is
     hidden (board.css) */
  const lines = [
    name,
    `Serving (green, amber, red: high to low utilization): ${fmtCount(serving)}`,
  ];
  const util = utilLine(bands, serving);
  if (util) lines.push(util);
  lines.push(`Elise (pink): ${fmtCount(rd)}`, `Idle (empty): ${fmtCount(idle)}`);
  return lines.join("\n");
}

/** Serving follows each deployment's utilization. Elise is her colour.
    Idle is black, the same as a row with nothing rented. */
function GpuBoxes({
  name,
  split,
  jobs,
  partId,
}: {
  name: string;
  split: Split;
  jobs: ServeJobView[];
  partId: string | null;
}) {
  const serving = Math.max(0, split.serving);
  const rd = Math.max(0, split.rd);
  const idle = Math.max(0, split.unused);
  const bands = servingBands(jobs, partId, serving);
  const cells = layoutCells([bands.hi, bands.mid, bands.low, rd, idle]);
  const tip = boxesTip(name, serving, rd, idle, bands);
  return (
    <div
      className="gpuBoxes"
      role="img"
      aria-label={tip.replace(/\n/g, ", ")}
      data-tip={tip}
    >
      {cells.map((kind, i) => (
        <span
          key={i}
          className={kind === "empty" ? "gpuBox" : `gpuBox ${kind}`}
          style={{ "--i": i } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Pop({ gen, children }: { gen: number; children: ReactNode }) {
  return gen ? (
    <span key={gen} className="rentPop">
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}

export function GpuPanel() {
  const gpu = useGpu();
  const jobs = useServe()?.jobs ?? [];
  const [pop, setPop] = useState({ id: "", gen: 0 });
  const popOf = (id: string) => (pop.id === id ? pop.gen : 0);
  const rent = (id: string) => {
    const n = window.__board?.rentAsk(id) || 0;
    if (n > 0) setPop(p => ({ id, gen: p.gen + 1 }));
  };
  const blockRef = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const blk = blockRef.current;
    const table = blk?.querySelector("table");
    if (!blk || !table) return;
    const cs = getComputedStyle(blk);
    const room =
      blk.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    for (let lv = 0; lv <= 4; lv++) {
      for (let i = 1; i <= 4; i++) blk.classList.toggle(`fit${i}`, i <= lv);
      if (table.offsetWidth <= room) break;
    }
  }, []);
  useLayoutEffect(fit);
  useEffect(() => {
    const blk = blockRef.current;
    if (!blk) return;
    const ro = new ResizeObserver(fit);
    ro.observe(blk);
    return () => ro.disconnect();
  }, [fit]);
  const count = gpu?.countLabel ?? "–";
  const types = gpu?.types ?? [];
  const open = types.filter(row => row.unlocked);
  const total = sumRows(open);
  const buys = gpu?.buys ?? [];
  const layout = useLayout();
  /* the utilization bars ripple from 70% of the profit scale to 100% (board.css) */
  const ripple = useHypeRamp(BOX_RIPPLE_FROM, 1);
  const cls = [
    "panel",
    layout.collapsed.fleet ? "collapsed" : "",
    layout.h.fleet ? "hasH" : "",
    ripple.level > 0 ? "boxRippling" : "",
    ripple.frozen ? "rippleHold" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      id="gpusPanel"
      style={{ "--boxRipple": ripple.level.toFixed(3) } as CSSProperties}
    >
      <h2>
        <span className="panelTitle">
          <Fold id="fleet" />
          <FleetIco />
          Fleet
        </span>
      </h2>
      <RowSplit id="fleet" edge="below" />
      <div id="fleetBlock" ref={blockRef}>
        <div id="fleetHead">
          <span id="fleetCount" className={gpu?.tint || undefined}>
            {count}
          </span>
          <div className="usageKey">
            <span
              data-tip={
                "Serving\nGreen is high utilization, amber is partial, red is low."
              }
            >
              <i className="gpuSwatch hi" />
              <i className="gpuSwatch mid" />
              <i className="gpuSwatch low" />
              Serving
            </span>
            <span>
              <i className="gpuSwatch elise" />
              Elise
            </span>
            <span>
              <i className="gpuSwatch idle" />
              Idle
            </span>
          </div>
        </div>
        {gpu?.penalty ? <p id="fleetPenalty">{gpu.penalty}</p> : null}
        {types.length ? (
          <table id="fleetTable">
            <thead>
              <tr>
                <th>GPU</th>
                <th>Rented</th>
                <th colSpan={3} className="usageHead" />
                <th className="cost">Cost/day - $</th>
              </tr>
            </thead>
            <tbody>
              {types.map(row => {
                const buy = buys.find(b => b.id === row.id);
                return row.unlocked ? (
                  <tr key={row.id}>
                    <td>
                      {buy ? (
                        <button
                          className={["rentAdd", buy.aura ? "gpuAura" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          id={buy.first ? "buy" : `buy-${buy.id}`}
                          type="button"
                          disabled={buy.disabled}
                          data-tip={
                            buy.full
                              ? `You rent the most ${buy.name} providers allow: ${buy.max}`
                              : `${rentWhat(buy)} · ${buy.cost}`
                          }
                          aria-label={
                            buy.full
                              ? `${buy.name}, at the limit of ${buy.max}`
                              : `${rentWhat(buy)}, ${buy.cost}`
                          }
                          onClick={() => rent(buy.id)}
                        >
                          <CartIco />
                          <span className="rentBody">
                            <span className={row.aura ? "gpuName hi" : "gpuName"}>
                              <GpuLabel name={row.name} />
                            </span>
                            {buy.full ? (
                              <span className="rentLine">Max {buy.max}</span>
                            ) : (
                              <span className="rentLine">
                                <span className={buy.sizeFlash ? "hi" : undefined}>
                                  {buy.block}×{" "}
                                </span>
                                <span className="rentCost">
                                  {buy.cost.replace(/\/day$/, "")}
                                  <span className="rentHr">/day</span>
                                </span>
                              </span>
                            )}
                          </span>
                        </button>
                      ) : (
                        <span
                          className={row.aura ? "gpuName hi gpuTip" : "gpuName gpuTip"}
                          data-tip={row.tip}
                        >
                          <GpuLabel name={row.name} />
                        </span>
                      )}
                    </td>
                    <td className="n">
                      <Pop gen={popOf(row.id)}>{row.count ?? 0}</Pop>
                    </td>
                    <td colSpan={3} className="usage">
                      <GpuBoxes
                        name={row.name}
                        split={{
                          count: row.count ?? 0,
                          serving: row.serving ?? 0,
                          rd: row.rd ?? 0,
                          unused: row.unused ?? 0,
                        }}
                        jobs={jobs}
                        partId={row.id}
                      />
                    </td>
                    <td className="n">{fmt$(row.cost ?? 0)}</td>
                  </tr>
                ) : (
                  <tr key={row.id} className="locked">
                    <td colSpan={6} className="lockRow">
                      <span className="rentLock">
                        <LockIco />
                        <span>
                          <span className="lockMob">Unavailable GPU. </span>
                          {row.unlock}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>Total</td>
                <td className="n">
                  <Pop gen={pop.gen}>{total.count}</Pop>
                </td>
                <td colSpan={3} className="usage">
                  <GpuBoxes name="All GPUs" split={total} jobs={jobs} partId={null} />
                </td>
                <td className="n">{fmt$(total.cost)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
