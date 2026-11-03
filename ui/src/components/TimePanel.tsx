import { useEffect, useRef, type CSSProperties } from "react";
import { useControls } from "../game/store";
import { Hud } from "./Hud";
import { IncomeStats } from "./IncomePanel";
import { Fold, useLayout } from "./layout";
import { ProgressIco } from "./panelIcons";
import { RippleText, useRipple } from "./RippleText";

function PlayIco() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIco() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  );
}

function ForwardIco() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 6v12l8-6-8-6zm10 0v12l8-6-8-6z" />
    </svg>
  );
}

const SKIPS = [
  { span: "day", label: "1 day" },
  { span: "week", label: "1 week" },
  { span: "month", label: "1 month" },
] as const;

export function TimePanel() {
  const c = useControls();
  const collapsed = !!useLayout().collapsed.time;
  const paused = c?.paused !== false;
  const canSkip = !!c?.canSkip;
  const toggles = c?.toggles ?? 0;
  const pauseBtn = useRef<HTMLButtonElement>(null);
  const ripple = useRipple();
  useEffect(() => {
    const btn = pauseBtn.current;
    if (!btn || !toggles) return;
    btn.classList.remove("smash");
    void btn.getBoundingClientRect();
    btn.classList.add("smash");
  }, [toggles]);

  return (
    <div
      className={[
        "panel",
        collapsed ? "collapsed" : "",
        ripple.level > 0 ? "rippling" : "",
        ripple.frozen ? "rippleHold" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      id="timePanel"
      style={{ "--ripple": ripple.level.toFixed(3) } as CSSProperties}
    >
      <h2>
        <span className="panelTitle">
          <Fold id="time" />
          <ProgressIco />
          Progress
        </span>
      </h2>
      <Hud
        afterMoney={<IncomeStats />}
        afterClock={
          <div className="stat" id="tscl">
            <div className="l">
              <RippleText text="time" />
            </div>
            <div className="clockActs">
              <button
                className={["big", "clockCtl", paused ? "paused" : ""]
                  .filter(Boolean)
                  .join(" ")}
                id="pauseBtn"
                ref={pauseBtn}
                type="button"
                data-tip={paused ? "Resume" : "Pause"}
                aria-label={paused ? "Resume" : "Pause"}
                onClick={() => window.__board?.togglePause()}
              >
                {paused ? <PlayIco /> : <PauseIco />}
                {paused ? "Resume" : "Pause"}
              </button>
              {SKIPS.map(s => (
                <button
                  key={s.span}
                  className="big clockCtl skip"
                  type="button"
                  hidden={!canSkip}
                  data-tip={`Skip ${s.label}`}
                  aria-label={`Skip ${s.label}`}
                  onClick={() => window.__board?.skipTime(s.span)}
                >
                  <ForwardIco />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        }
      />
    </div>
  );
}
