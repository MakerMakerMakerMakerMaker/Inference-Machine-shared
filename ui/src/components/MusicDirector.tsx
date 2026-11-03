/* Decides how many of the radio station's four layers play (musicEngine.ts), the
   same on every station. Nothing plays until the tutorial is done (or skipped).
   Then:

     layer 1   as soon as the tutorial ends
     layer 2   at 25% of either the profit hype (CapitalFx: ~$12.6k/day) or the year (week 13)
     layer 3   at 50% of either (~$40k/day, or week 26)
     layer 4   at 75% of either (~$126k/day, or week 39)

   A layer that has joined stays for the rest of the run, even if profit dips. It
   all fades out when the run ends (bankrupt, or the year is over) and starts again
   from layer 1 on the next run. Changing station keeps the level. */
import { useEffect, useRef } from "react";
import { useControls } from "../game/store";
import { setMusicLevel } from "../sound/musicEngine";
import { hypeOf, useProfitDay } from "./CapitalFx";

const LAYER_AT = [0.25, 0.5, 0.75];

export function MusicDirector() {
  const music = useControls()?.music;
  const hype = hypeOf(useProfitDay());
  const latched = useRef({ run: -1, level: 0 });

  let level = 0;
  if (music && music.ready && !music.over) {
    const progress = Math.max(hype, music.year);
    level = 1 + LAYER_AT.filter(at => progress >= at).length;
  }
  if (music && latched.current.run !== music.run)
    latched.current = { run: music.run, level: 0 };
  /* replaying the tutorial mid-run leaves the music alone; only the run ending stops it */
  if (!music || music.over) latched.current.level = 0;
  else latched.current.level = Math.max(latched.current.level, level);
  const target = latched.current.level;

  useEffect(() => {
    setMusicLevel(target);
  }, [target]);

  return null;
}
