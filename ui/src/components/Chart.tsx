import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { MONTH_NAMES } from "../engine/clock";
import { useChart } from "../game/store";
import { Fold, useLayout } from "./layout";
import { MonitorIco } from "./panelIcons";
import { TrendIcon, UtilIcon } from "./ServingPanel";
import type { ChartPoint, ChartView } from "../game/types";
import "./chart.css";

const CAPITAL = "var(--ours)";

/* Each band's key and current value. On a laptop the legends under the plots are
   hidden (board.css) and this is the band's hover tip instead; a phone, with no
   hover, keeps the legends and can still tap a band for the tip. */
const profitTip = (profit: string) =>
  `Profit\n${profit}/day now. The line is profit per day over the year so far.`;
const utilTip = (util: string) =>
  `GPU utilization\n${util} now. Share of the rented fleet that is busy. A serving job counts by how full it is. GPUs assigned to Elise count as fully busy. Idle GPUs count as empty.`;
const capitalTip = (withElise: string, without: string) =>
  `Capital\nWith Elise (solid line): ${withElise}\nWithout Elise (dashed line): ${without}\nWith Elise is the cash you have. Without Elise is what the same deployments would have earned with none of Elise's speedups.`;

/** A plot box that only mounts its chart while it has a size: a folded panel or a
    phone tab that is not on screen leaves it at 0×0, and recharts warns every frame. */
function Plot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setShown(el.clientWidth > 0 && el.clientHeight > 0);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="chartPlot" ref={ref}>
      {shown ? children : null}
    </div>
  );
}

function LineSwatch({ dashed }: { dashed?: boolean }) {
  return (
    <svg className="serveIco" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.2 8h13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray={dashed ? "2.4 2.2" : undefined}
      />
    </svg>
  );
}

function monthMarks(t1: number) {
  if (!(t1 > 0)) return [];
  return MONTH_NAMES.map((label, i) => ({ t: (i / 12) * t1, label }));
}

function signedRange(points: ChartPoint[], key: string) {
  let lo = 0,
    hi = 0;
  for (const p of points) {
    const v = Number((p as Record<string, number>)[key]) || 0;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === 0 && hi === 0) return { lo: -1, hi: 1 };
  return { lo, hi };
}

function bandExtent(
  points: ChartPoint[],
  keys: string[],
  signed: boolean,
  yDomain?: [number, number]
) {
  if (yDomain) return { lo: yDomain[0], hi: yDomain[1] };
  if (signed && keys[0]) return signedRange(points, keys[0]);
  let lo = Infinity,
    hi = -Infinity;
  for (const p of points) {
    for (const key of keys) {
      const v = Number((p as Record<string, number>)[key]) || 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
  return { lo, hi };
}

function niceNum(range: number, round: boolean) {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const exp = Math.floor(Math.log10(range));
  const frac = range / 10 ** exp;
  const nice = round
    ? frac < 1.5
      ? 1
      : frac < 3
        ? 2
        : frac < 7
          ? 5
          : 10
    : frac <= 1
      ? 1
      : frac <= 2
        ? 2
        : frac <= 5
          ? 5
          : 10;
  return nice * 10 ** exp;
}

function axisScale(min: number, max: number) {
  if (!(max > min)) {
    const pad = Math.abs(min) > 1e-9 ? Math.abs(min) : 1;
    min -= pad;
    max += pad;
  }
  const step = niceNum((max - min) / 2, true);
  const lo = Math.floor(min / step + 1e-10) * step;
  const hi = Math.ceil(max / step - 1e-10) * step;
  const mid = lo < 0 && hi > 0 ? 0 : (lo + hi) / 2;
  const raw = mid === lo || mid === hi ? [lo, hi] : [lo, mid, hi];
  const ticks = raw.map(v =>
    Math.abs(v) < 1e-8 * (Math.abs(hi) || 1) ? 0 : Number(v.toPrecision(12))
  );
  return {
    lo: ticks[0],
    hi: ticks[ticks.length - 1],
    step: ticks.length > 1 ? ticks[1] - ticks[0] : step,
    ticks,
  };
}

function trimFixed(v: number, digits: number) {
  const s = v.toFixed(digits);
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

function fmtMoneyTick(v: number, step: number) {
  const a = Math.abs(v);
  const unit =
    step >= 1e9 || a >= 1e9
      ? 1e9
      : step >= 1e6 || a >= 1e6
        ? 1e6
        : step >= 1e3 || a >= 1e3
          ? 1e3
          : 1;
  const suffix = unit === 1e9 ? "B" : unit === 1e6 ? "M" : unit === 1e3 ? "k" : "";
  const scaledStep = step / unit;
  const digits = Math.min(
    4,
    Math.max(0, -Math.floor(Math.log10(scaledStep > 0 ? scaledStep : 1)))
  );
  const body = trimFixed(a / unit, digits);
  return (body === "0" ? "" : v < 0 ? "-" : "") + "$" + body + suffix;
}

function fmtPctTick(v: number, step: number) {
  const digits = Math.min(2, Math.max(0, -Math.floor(Math.log10(Math.abs(step) || 1))));
  return trimFixed(v, digits) + "%";
}

type AxisKind = "money" | "percent";

type BandProps = {
  chart: ChartView | null;
  keys: { key: string; color: string; dash?: string }[];
  yDomain?: [number, number];
  signed?: boolean;
  months?: boolean;
  axis?: AxisKind;
  /** Fit the x axis to the time elapsed so far: the line spans the full width and
      the axis grows by one sample each time a new hour is recorded. */
  elapsed?: boolean;
};

function Band({
  chart,
  keys,
  yDomain,
  signed,
  months,
  axis = "money",
  elapsed,
}: BandProps) {
  const points = chart?.points ?? [];
  const t0 = chart?.t0 ?? 0;
  const t1 = chart?.t1 ?? 30;
  const tNow = points.length ? points[points.length - 1].t : t0;
  const x1 = elapsed ? Math.max(tNow, t0 + 1) : t1 + Math.max(t1 - t0, 1) * 0.012;
  const marks = elapsed ? monthMarks(t1).filter(m => m.t <= x1) : monthMarks(t1);
  const labels: Record<number, string> = {};
  marks.forEach(m => {
    labels[m.t] = m.label;
  });
  const signKey = signed ? keys[0]?.key : "";
  const extent = bandExtent(
    points,
    keys.map(k => k.key),
    !!signed,
    yDomain
  );
  const scale = axisScale(extent.lo, extent.hi);
  const format = (v: number) =>
    axis === "percent" ? fmtPctTick(v, scale.step) : fmtMoneyTick(v, scale.step);
  const offset =
    scale.hi <= 0 ? 0 : scale.lo >= 0 ? 1 : scale.hi / (scale.hi - scale.lo);
  const gradId = signKey ? `sign-${signKey}` : "";
  /* The sign gradient is sized to the line's own box, and a flat line has a box
     with no height, so SVG drops the stroke. A flat line takes one solid colour
     instead: green at or above $0, red below. */
  const signVals = signKey
    ? points.map(p => Number((p as Record<string, number>)[signKey]) || 0)
    : [];
  const signFlat = signVals.every(v => v === signVals[0]);
  const signSolid = (signVals[0] ?? 0) < 0 ? "var(--warn)" : "var(--tok)";
  /* Under two samples there is no line to draw yet, so the signed band shows a
     flat line across the plot at the latest value ($0/day before the first). */
  const data =
    signKey && points.length < 2
      ? [
          { ...points[0], t: t0, [signKey]: signVals[0] ?? 0 },
          { ...points[0], t: x1, [signKey]: signVals[0] ?? 0 },
        ]
      : points;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
        {signKey ? (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset={offset} stopColor="var(--tok)" />
              <stop offset={offset} stopColor="var(--warn)" />
            </linearGradient>
          </defs>
        ) : null}
        <XAxis
          dataKey="t"
          type="number"
          domain={[t0, x1]}
          height={months ? 22 : 0}
          hide={!months}
          ticks={marks.map(m => m.t)}
          tick={(props: {
            x?: string | number;
            y?: string | number;
            payload?: { value: number };
            index?: number;
            visibleTicksCount?: number;
          }) => {
            const i = props.index ?? 0;
            const n = props.visibleTicksCount ?? marks.length;
            const v = props.payload?.value ?? 0;
            const anchor =
              i === 0
                ? "start"
                : elapsed
                  ? v > x1 - (x1 - t0) * 0.06
                    ? "end"
                    : "middle"
                  : i === n - 1
                    ? "end"
                    : "middle";
            return (
              <text
                x={props.x}
                y={props.y}
                dy={12}
                textAnchor={anchor}
                fill="var(--faint)"
                style={{ fontSize: "calc(9 * var(--tpx))" }}
              >
                {labels[props.payload?.value ?? 0] ?? ""}
              </text>
            );
          }}
          axisLine={false}
          tickLine={false}
          interval={0}
          allowDataOverflow
        />
        <YAxis
          domain={[scale.lo, scale.hi]}
          ticks={scale.ticks}
          width={52}
          tick={(props: {
            x?: string | number;
            y?: string | number;
            payload?: { value: number };
          }) => (
            <text
              x={props.x}
              y={props.y}
              textAnchor="end"
              dominantBaseline="central"
              fill="var(--faint)"
              style={{ fontSize: "var(--fs-dense-1)" }}
            >
              {format(Number(props.payload?.value ?? 0))}
            </text>
          )}
          axisLine={false}
          tickLine={false}
          interval={0}
          allowDataOverflow
        />
        <ReferenceLine y={0} stroke="var(--hair)" strokeDasharray="2 3" />
        {marks.map(m => (
          <ReferenceLine
            key={m.label}
            x={m.t}
            stroke="var(--faint)"
            strokeWidth={1}
            strokeDasharray="0 4"
            strokeLinecap="round"
            ifOverflow="hidden"
          />
        ))}
        {elapsed ? null : (
          <ReferenceLine
            x={t1}
            stroke="var(--util-mid)"
            strokeWidth={1.5}
            ifOverflow="visible"
          />
        )}
        {keys.map(line => (
          <Line
            key={line.key}
            type="linear"
            dataKey={line.key}
            stroke={
              signed && line.key === signKey
                ? signFlat
                  ? signSolid
                  : `url(#${gradId})`
                : line.color
            }
            strokeWidth={1.5}
            strokeDasharray={line.dash}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** End-of-year capital curve; the Elise-free line and number only when they differ. */
export function ScoreCapital() {
  const chart = useChart();
  if (!chart?.points?.length) return null;
  const bare = chart.capital !== chart.capitalBare;
  return (
    <div className="scoreCap">
      {bare ? (
        <p className="sub scoreBare">
          Without Elise: <b>{chart.capitalBare}</b>
        </p>
      ) : null}
      <div className="chartBand">
        <Plot>
          <Band
            chart={chart}
            keys={[
              { key: "capital", color: CAPITAL },
              ...(bare ? [{ key: "capitalBare", color: CAPITAL, dash: "4 3" }] : []),
            ]}
            months
          />
        </Plot>
        {bare ? (
          <div className="chartLegend">
            <div className="chartLine chartUtil" style={{ color: CAPITAL }}>
              <LineSwatch />
              <span className="chartLabel">With Elise</span>
            </div>
            <div className="chartLine chartUtil" style={{ color: CAPITAL }}>
              <LineSwatch dashed />
              <span className="chartLabel">Without Elise</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Chart() {
  const chart = useChart();
  const layout = useLayout();
  const cls = layout.collapsed.chart ? "collapsed" : "";

  return (
    <div id="chartwrap" className={cls || undefined}>
      <h2 id="chartHd">
        <span className="panelTitle">
          <Fold id="chart" />
          <MonitorIco />
          Monitoring
        </span>
      </h2>
      <div className="chartBand" data-tip={profitTip(chart?.profit ?? "$0")}>
        <Plot>
          <Band
            chart={chart}
            keys={[{ key: "profit", color: "var(--tok)" }]}
            signed
            elapsed
          />
        </Plot>
        <div className="chartLegend">
          <div
            className="chartLine chartUtil"
            style={{
              color:
                (chart?.points?.at(-1)?.profit ?? 0) >= 0
                  ? "var(--tok)"
                  : "var(--warn)",
            }}
          >
            <TrendIcon down={(chart?.points?.at(-1)?.profit ?? 0) < 0} />
            <b>{chart?.profit ?? "$0"}/day</b>
            <span className="chartLabel">profit</span>
          </div>
        </div>
      </div>
      <div className="chartBand" data-tip={utilTip(chart?.util ?? "0%")}>
        <Plot>
          <Band
            chart={chart}
            keys={[{ key: "util", color: "var(--mem)" }]}
            yDomain={[0, 100]}
            axis="percent"
            elapsed
          />
        </Plot>
        <div className="chartLegend">
          <div className="chartLine chartUtil" style={{ color: "var(--mem)" }}>
            <UtilIcon />
            <b>{chart?.util ?? "0%"}</b>
            <span className="chartLabel">GPU utilization</span>
          </div>
        </div>
      </div>
      <div
        className="chartBand"
        data-tip={capitalTip(chart?.capital ?? "$0", chart?.capitalBare ?? "$0")}
      >
        <Plot>
          <Band
            chart={chart}
            keys={[
              { key: "capital", color: CAPITAL },
              { key: "capitalBare", color: CAPITAL, dash: "4 3" },
            ]}
            months
            elapsed
          />
        </Plot>
        <div className="chartLegend">
          <div className="chartLine chartUtil" style={{ color: CAPITAL }}>
            <LineSwatch />
            <b>{chart?.capital ?? "$0"}</b>
            <span className="chartLabel">With Elise</span>
          </div>
          <div className="chartLine chartUtil" style={{ color: CAPITAL }}>
            <LineSwatch dashed />
            <b>{chart?.capitalBare ?? "$0"}</b>
            <span className="chartLabel">Without Elise</span>
          </div>
        </div>
      </div>
    </div>
  );
}
