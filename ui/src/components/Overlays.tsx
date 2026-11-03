import { useEvent } from "../game/store";
import { GameOverOverlay } from "./GameOverOverlay";
import { HoverTip } from "./HoverTip";
import { BeatPulse } from "./BeatPulse";
import { FleetFx } from "./FleetFx";
import { BoardOverlay, ScoreOverlay } from "./Leaderboard";
import { LuxuryPopcorn } from "./LuxuryPopcorn";
import { MusicCues } from "./MusicCues";
import { MusicDirector } from "./MusicDirector";
import { RdRevealOverlay } from "./RdReveal";
import { Tutorial } from "./Tutorial";

/* Always mounted, so the popup sound's watcher sees the same element; only
   "show" and the content change. */
function EventOverlay() {
  const ev = useEvent();
  return (
    <div className={ev ? "ov show" : "ov"} id="ovEvent">
      <div className="ovcard">
        <div className="evHead">
          <svg className="newsIco" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2" y="3" width="12" height="11" fill="currentColor" />
            <rect x="1" y="4" width="2" height="10" fill="currentColor" />
            <rect x="4" y="5" width="4" height="3" fill="var(--card)" />
            <rect x="9" y="5" width="4" height="1" fill="var(--card)" />
            <rect x="9" y="7" width="4" height="1" fill="var(--card)" />
            <rect x="4" y="10" width="9" height="1" fill="var(--card)" />
            <rect x="4" y="12" width="7" height="1" fill="var(--card)" />
          </svg>
          <p className="kicker" id="evMonth">
            {ev?.month}
          </p>
          {ev?.art ? (
            <span id="evSeason" dangerouslySetInnerHTML={{ __html: ev.art }} />
          ) : null}
        </div>
        {ev?.title ? <h2 id="evTitle">{ev.title}</h2> : null}
        {ev?.ask ? <p id="evAsk">{ev.ask}</p> : null}
        {ev?.choices ? (
          <div className="row" id="evChoices">
            {ev.choices.map((label, i) => (
              <button
                key={i}
                className="big"
                id={i === 0 ? "evA" : "evB"}
                type="button"
                onClick={() => window.__board?.pickEvent(i)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {ev?.result != null ? (
          <div id="evResult">
            <p id="evConseq" dangerouslySetInnerHTML={{ __html: ev.result }} />
            <div className="row">
              <button
                className="big primary"
                id="evClose"
                type="button"
                onClick={() => window.__board?.closeEvent()}
              >
                OK ▸
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Overlays() {
  return (
    <>
      <HoverTip />
      <Tutorial />
      <GameOverOverlay />
      <EventOverlay />
      <BoardOverlay />
      <ScoreOverlay />
      <RdRevealOverlay />
      <MusicDirector />
      <MusicCues />
      <LuxuryPopcorn />
      <FleetFx />
      <BeatPulse />
    </>
  );
}
