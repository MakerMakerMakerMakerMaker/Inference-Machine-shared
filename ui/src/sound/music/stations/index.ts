/*
  The radio's station list, in dial order. To add a station: write a file next to
  this one that exports a Station (see kit.ts, and tidePool.ts for a full example),
  then add it here. DEFAULT_STATION is what a new player hears; a player's pick is
  remembered (musicEngine.ts).

  Every station has the same four-layer shape, so the progression (MusicDirector)
  works the same on any of them: layer 1 alone after the tutorial, all four by
  the last quarter of the year.
*/
import type { Station } from "../kit";
import { IDLE_CYCLES } from "./idleCycles";
import { LATE_SHIFT } from "./lateShift";
import { OVERCLOCK } from "./overclock";
import { TIDE_POOL } from "./tidePool";

export const STATIONS: readonly Station[] = [
  TIDE_POOL,
  LATE_SHIFT,
  OVERCLOCK,
  IDLE_CYCLES,
];

/* what plays for a player who has never turned the dial: the lo-fi station */
export const DEFAULT_STATION: Station = LATE_SHIFT;
