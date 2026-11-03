import { useEffect, useState, useSyncExternalStore } from "react";
import "../art/art.css";
import "./sound.css";
import { SoundControl } from "./SoundControl";
import { StationTuner } from "./StationTuner";
import { CUE_LIST, MOOD_LIST } from "./music/cues";
import type { MoodId } from "./music/kit";
import {
  STATION_LIST,
  musicCue,
  setMusicLevel,
  setMusicMood,
  stationId,
  subscribeStation,
} from "./musicEngine";
import { SOUND_MAP, type SoundSpec } from "./soundMap";

/* What fires each cue and mood in a run (MusicCues.tsx). */
const CUE_WHEN: Record<string, string> = {
  news: "a news card opens",
  discovery: "Elise finds an improvement",
  newModel: "a new model comes out",
  unlock: "a new GPU type unlocks",
  outage: "the cloud is down",
  danger: "capital is running out",
  paused: "the game is paused",
};

const SOUNDS = Object.entries(SOUND_MAP) as [string, SoundSpec][];

/* What the game's progression plays at each level (MusicDirector.tsx). */
const MUSIC_WHEN = [
  "after the tutorial",
  "$3.2k/hr profit, or week 13",
  "$10k/hr profit, or week 26",
  "$31.6k/hr profit, or week 39",
];

export function SoundPage() {
  const [music, setMusic] = useState(0);
  const [moods, setMoods] = useState<MoodId[]>([]);
  const id = useSyncExternalStore(subscribeStation, stationId);
  const station = STATION_LIST.find(s => s.id === id) ?? STATION_LIST[0];
  useEffect(() => {
    const prev = document.title;
    document.title = "Sounds";
    return () => {
      document.title = prev;
      setMusicLevel(0);
      MOOD_LIST.forEach(m => setMusicMood(m, false));
    };
  }, []);
  const toggleMood = (m: MoodId) => {
    const on = !moods.includes(m);
    setMusicMood(m, on);
    setMoods(on ? [...moods, m] : moods.filter(x => x !== m));
  };
  const playMusic = (n: number) => {
    setMusicLevel(n);
    setMusic(n);
  };

  return (
    <div id="art">
      <header className="artHead">
        <p className="artKicker">soundMap.ts</p>
        <h1>
          Sounds <SoundControl className="soundMute" />
        </h1>
        <p>
          Every sound in the game. Press one to hear it.{" "}
          <a href="/">Back to the machine</a>
        </p>
      </header>
      <ul className="soundList">
        {SOUNDS.map(([event, spec]) => (
          <li key={event}>
            {/* the page-wide click sound plays whatever data-sound names */}
            <button type="button" data-sound={event} aria-label={`Play ${event}`}>
              ▶
            </button>
            <b>{event}</b>
            <span>
              {typeof spec.file === "string" ? spec.file : spec.file.join(", ")}
            </span>
            <span>
              volume {spec.volume ?? 1}
              {spec.pitchJitter ? `, pitch ±${spec.pitchJitter * 100}%` : ""}
            </span>
          </li>
        ))}
      </ul>
      <h2 className="soundHead">Music</h2>
      <p className="soundNote">
        The music is a radio: each station is its own kind of music in four layers, and
        each level adds one layer on top of the ones before it, the way a run does.
        Press the one playing to stop. Changing station while one plays crosses over
        through static.
      </p>
      <div className="soundStation">
        <StationTuner />
        <span>{station.blurb}</span>
      </div>
      <ul className="soundList">
        {station.layers.map((name, i) => (
          <li key={i}>
            <button
              type="button"
              data-sound="none"
              className={music === i + 1 ? "on" : undefined}
              aria-label={
                music === i + 1 ? "Stop the music" : `Play music level ${i + 1}`
              }
              aria-pressed={music === i + 1}
              onClick={() => playMusic(music === i + 1 ? 0 : i + 1)}
            >
              {music === i + 1 ? "■" : "▶"}
            </button>
            <b>level {i + 1}</b>
            <span>+ {name}</span>
            <span>{MUSIC_WHEN[i]}</span>
          </li>
        ))}
      </ul>
      <h2 className="soundHead">Cues and moods</h2>
      <p className="soundNote">
        The soundtrack answering the game. A cue is a short moment that lands on the
        station&apos;s next beat, in its chord; it only plays while music does, so start
        a level first. A mood colours the whole mix while it is on.
      </p>
      <ul className="soundList">
        {CUE_LIST.map(cue => (
          <li key={cue}>
            <button
              type="button"
              data-sound="none"
              aria-label={`Play the ${cue} cue`}
              onClick={() => musicCue(cue)}
            >
              ▶
            </button>
            <b>{cue}</b>
            <span>cue</span>
            <span>{CUE_WHEN[cue]}</span>
          </li>
        ))}
        {MOOD_LIST.map(mood => (
          <li key={mood}>
            <button
              type="button"
              data-sound="none"
              className={moods.includes(mood) ? "on" : undefined}
              aria-label={`${moods.includes(mood) ? "End" : "Start"} the ${mood} mood`}
              aria-pressed={moods.includes(mood)}
              onClick={() => toggleMood(mood)}
            >
              {moods.includes(mood) ? "■" : "▶"}
            </button>
            <b>{mood}</b>
            <span>mood</span>
            <span>{CUE_WHEN[mood]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
