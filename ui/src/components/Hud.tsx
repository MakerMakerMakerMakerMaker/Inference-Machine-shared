import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useHud } from "../game/store";
import type { HudTile } from "../game/types";
import { CapitalFx } from "./CapitalFx";
import { RippleText } from "./RippleText";
import "./hud.css";

const DIGIT_WINDOW_MS = 900;

function parseMoney(s: string): number {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Digits that differ from the value a moment ago, tinted by the direction of that move. */
function MoneyText({ text }: { text: string }) {
  const hist = useRef<{ text: string; at: number }[]>([
    { text, at: performance.now() },
  ]);
  const [tick, setTick] = useState(0);

  const now = performance.now();
  const last = hist.current[hist.current.length - 1];
  if (last.text !== text) hist.current.push({ text, at: now });
  // Baseline is the newest sample at least DIGIT_WINDOW_MS old, or the oldest
  // sample if the move just started. Dropping older rows before the compare
  // would hide a change that arrives after the number has sat still.
  const cutoff = now - DIGIT_WINDOW_MS;
  let baseIdx = 0;
  for (let i = 0; i < hist.current.length; i++) {
    if (hist.current[i].at <= cutoff) baseIdx = i;
    else break;
  }
  const base = hist.current[baseIdx].text;
  if (baseIdx > 0) hist.current.splice(0, baseIdx);

  const delta = parseMoney(text) - parseMoney(base);
  const cls = delta > 0 ? "up" : delta < 0 ? "dn" : "";

  useEffect(() => {
    const nxt = hist.current[1];
    if (!nxt) return;
    const wait = nxt.at + DIGIT_WINDOW_MS - performance.now() + 30;
    const id = window.setTimeout(() => setTick(n => n + 1), Math.max(0, wait));
    return () => window.clearTimeout(id);
  }, [text, tick]);

  if (!cls) return <>{text}</>;
  const n = text.length;
  const m = base.length;
  let start = n;
  for (let i = 0; i < n; i++) {
    const fromEnd = n - 1 - i;
    const prev = fromEnd < m ? base[m - 1 - fromEnd] : "";
    const ch = text[i];
    if (ch >= "0" && ch <= "9" && ch !== prev) {
      start = i;
      break;
    }
  }
  if (start >= n) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <span className={"dg " + cls}>{text.slice(start)}</span>
    </>
  );
}

function CapitalArrow({ down }: { down: boolean }) {
  return (
    <svg
      className={down ? "capArrow dn" : "capArrow up"}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d={down ? "M2.4 4.1h11.2L8 12.7z" : "M2.4 11.9h11.2L8 3.3z"}
      />
    </svg>
  );
}

function CapitalAmount({ text }: { text: string }) {
  return <span className="capAmt" children={<MoneyText text={text} />} />;
}

function Coin() {
  return (
    <svg className="hanim coin" viewBox="0 0 32 32" aria-hidden="true">
      <g className="coin-body">
        <rect x="10" y="5" width="12" height="22" fill="currentColor" />
        <rect x="6" y="9" width="20" height="14" fill="currentColor" />
        <rect x="15" y="8" width="2" height="16" fill="var(--card)" />
        <rect x="12" y="11" width="8" height="2" fill="var(--card)" />
        <rect x="12" y="15" width="8" height="2" fill="var(--card)" />
        <rect x="12" y="19" width="8" height="2" fill="var(--card)" />
      </g>
    </svg>
  );
}

function Clock() {
  return (
    <svg className="hanim clock" viewBox="0 0 32 32" aria-hidden="true">
      <g className="clock-body">
        <rect x="10" y="3" width="12" height="2" fill="currentColor" />
        <rect x="6" y="5" width="20" height="2" fill="currentColor" />
        <rect x="4" y="7" width="24" height="18" fill="currentColor" />
        <rect x="6" y="25" width="20" height="2" fill="currentColor" />
        <rect x="10" y="27" width="12" height="2" fill="currentColor" />
        <rect x="15" y="1" width="2" height="2" fill="currentColor" />
        <g fill="var(--clock-face)">
          <rect x="10" y="5" width="12" height="2" />
          <rect x="6" y="7" width="20" height="18" />
          <rect x="10" y="25" width="12" height="2" />
        </g>
        <g fill="var(--clock-hand)">
          <rect x="15" y="8" width="2" height="9" />
          <rect x="16" y="15" width="6" height="2" />
        </g>
      </g>
    </svg>
  );
}

function Trophy() {
  return <TrophyIcon className="hanim trophy" />;
}

/* `still` leaves out the bob, for a trophy that sits in a heading. */
export function TrophyIcon({
  className,
  still,
}: {
  className: string;
  still?: boolean;
}) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <g className={still ? undefined : "trophy-body"}>
        <rect x="10" y="5" width="12" height="2" fill="currentColor" />
        <rect x="8" y="7" width="16" height="9" fill="currentColor" />
        <rect x="10" y="16" width="12" height="2" fill="currentColor" />
        <rect x="12" y="18" width="8" height="2" fill="currentColor" />
        <rect x="14" y="20" width="4" height="4" fill="currentColor" />
        <rect x="10" y="24" width="12" height="2" fill="currentColor" />
        <rect x="8" y="26" width="16" height="2" fill="currentColor" />
        <rect x="4" y="9" width="4" height="2" fill="currentColor" />
        <rect x="4" y="11" width="2" height="5" fill="currentColor" />
        <rect x="24" y="9" width="4" height="2" fill="currentColor" />
        <rect x="26" y="11" width="2" height="5" fill="currentColor" />
        <rect x="11" y="8" width="2" height="5" fill="var(--card)" />
      </g>
    </svg>
  );
}

function Tile({ tile }: { tile: HudTile }) {
  const openBoard = tile.id === "hPlace";
  const tileRef = useRef<HTMLDivElement>(null);
  const cls = [
    "stat",
    tile.money ? "money hasanim" : "",
    tile.anim && tile.anim !== "coin" && !openBoard ? "hasanim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <div className="l">
        <RippleText text={tile.label} />
      </div>
      <div className={["v", tile.valueClass].filter(Boolean).join(" ")} id={tile.id}>
        {tile.money && (tile.trend === "up" || tile.trend === "down") ? (
          <CapitalArrow down={tile.trend === "down"} />
        ) : null}
        {tile.money ? <CapitalAmount text={tile.value} /> : tile.value}
      </div>
      {tile.anim === "coin" ? <Coin /> : null}
      {tile.anim === "trophy" && !openBoard ? <Trophy /> : null}
      {tile.anim === "clock" ? <Clock /> : null}
      {openBoard ? (
        <button
          className="big"
          id="boardOpen"
          type="button"
          aria-label="Open leaderboard"
          onClick={() => window.__board?.openBoard()}
        >
          <Trophy />
        </button>
      ) : null}
    </>
  );

  return (
    <div className={cls} id={tile.wrap} hidden={tile.hidden} ref={tileRef}>
      {inner}
      {tile.money ? <CapitalFx tileRef={tileRef} value={tile.value} /> : null}
    </div>
  );
}

export function Hud({
  afterMoney,
  afterClock,
}: {
  afterMoney?: ReactNode;
  afterClock?: ReactNode;
}) {
  const hud = useHud();
  const tiles = hud?.tiles ?? [];
  const clockAt = tiles.findIndex(t => t.id === "hClock");
  const insertAt =
    clockAt >= 0
      ? clockAt + 1
      : Math.max(0, tiles.findIndex(t => t.id === "hMoney") + 1);

  return (
    <div id="hud" className={hud?.frozen ? "frozen" : undefined}>
      {tiles.map((tile, i) => (
        <Fragment key={tile.id}>
          {i === insertAt ? afterClock : null}
          <Tile tile={tile} />
          {tile.id === "hMoney" ? afterMoney : null}
        </Fragment>
      ))}
      {insertAt >= tiles.length ? afterClock : null}
    </div>
  );
}
