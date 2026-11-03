import { useId, useSyncExternalStore } from "react";
import { usePopMenu } from "../components/popMenu";
import { SpeakerIcon } from "./MuteButton";
import { StationTuner } from "./StationTuner";
import {
  isMuted,
  musicVolume,
  playerSetMuted,
  playSound,
  setMusicVolume,
  setSfxVolume,
  sfxVolume,
  subscribeSound,
} from "./soundEngine";

/* The speaker button with its levels menu. A click or tap on the speaker opens a
   small menu under it (components/popMenu.ts) with a mute switch, two sliders,
   sound effects and music, each 0 to 100%, saved like the mute switch
   (soundEngine.ts), and the radio dial that picks the music's station
   (StationTuner.tsx). Raising a level while muted unmutes, since that is what the
   player is after. Opening it closes the font menu, and the other way round. */

function Level({
  label,
  value,
  onChange,
  onDone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onDone?: () => void;
}) {
  const id = useId();
  const pct = Math.round(value * 100);
  return (
    <div className="soundLevel">
      <label htmlFor={id}>{label}</label>
      <span className="soundPct">{pct}%</span>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-valuetext={`${pct}%`}
        onChange={e => onChange(Number(e.target.value) / 100)}
        onPointerUp={onDone}
        onKeyUp={e => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End")
            onDone?.();
        }}
      />
    </div>
  );
}

export function SoundControl({ className }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeSound, isMuted);
  const sfx = useSyncExternalStore(subscribeSound, sfxVolume);
  const music = useSyncExternalStore(subscribeSound, musicVolume);
  const menu = usePopMenu([muted]);

  const raise = (set: (v: number) => void) => (v: number) => {
    set(v);
    if (v > 0 && isMuted()) playerSetMuted(false);
  };

  return (
    <span className="soundCtl" ref={menu.wrap} onKeyDown={menu.onKeyDown}>
      <button
        type="button"
        className={className}
        aria-label={muted ? "Sound (muted)" : "Sound"}
        aria-haspopup="true"
        aria-expanded={menu.open}
        onClick={menu.toggle}
      >
        <SpeakerIcon muted={muted} />
      </button>
      {menu.open ? (
        <div
          ref={menu.panel}
          className={muted ? "soundPanel muted" : "soundPanel"}
          style={menu.place}
          role="group"
          aria-label="Sound levels"
        >
          <button
            type="button"
            className="soundMuteToggle"
            data-sound="none"
            aria-pressed={muted}
            onClick={() => {
              const next = !muted;
              playerSetMuted(next);
              if (!next) playSound("button.click");
            }}
          >
            <SpeakerIcon muted={muted} />
            {muted ? "Unmute" : "Mute"}
          </button>
          <Level
            label="Sound effects"
            value={sfx}
            onChange={raise(setSfxVolume)}
            /* a click at the new level, so the player hears where it landed */
            onDone={() => playSound("button.click")}
          />
          <Level label="Music" value={music} onChange={raise(setMusicVolume)} />
          <StationTuner />
          {muted ? <p className="soundHint">Muted. Raise a level to unmute.</p> : null}
        </div>
      ) : null}
    </span>
  );
}
