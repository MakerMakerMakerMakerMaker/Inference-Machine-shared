/*
  A song made of tracks, for stations that morph (Late Shift, Overclock). It plays
  one track for as many bars as `length` says, then moves to another, never one of
  the last two played, so it keeps changing without bouncing between two. Each time
  a station comes on air (a new Clock) its song starts on a track at random, and it
  is laid out bar by bar as the layers ask, so all four layers follow the same one.

  barRole() tells a layer where a bar sits: the track, whether it is the first bar
  of a new track (lands), whether it should fill (the last bar before a change, and
  every eighth bar of a long track), and how many bars the track has left.
*/
import { pickOf, type Clock } from "./kit";

export type Section<T> = { start: number; bars: number; track: T };
export type BarRole<T> = {
  track: T;
  /* the bar's place in its track, from 0 */
  at: number;
  lands: boolean;
  fill: boolean;
  /* bars left in the track, this one included */
  left: number;
};

export function createSong<T>(tracks: readonly T[], length: (track: T) => number) {
  const songs = new WeakMap<Clock, Section<T>[]>();
  const make = (start: number, track: T): Section<T> => ({
    start,
    bars: length(track),
    track,
  });
  /* a track other than the last two played (or the last one, with only two) */
  const nextTrack = (recent: T[]) => {
    const fresh = tracks.filter(t => !recent.includes(t));
    if (fresh.length) return pickOf(fresh);
    const other = tracks.filter(t => t !== recent[recent.length - 1]);
    return pickOf(other.length ? other : tracks);
  };

  /* The section bar n falls in, laying the song out as far as it needs to go. */
  function sectionAt(clock: Clock, n: number): Section<T> {
    let song = songs.get(clock);
    if (!song) {
      song = [make(0, pickOf(tracks))];
      songs.set(clock, song);
    }
    for (;;) {
      const last = song[song.length - 1];
      if (n < last.start + last.bars) break;
      song.push(
        make(last.start + last.bars, nextTrack(song.slice(-2).map(s => s.track)))
      );
    }
    /* sections long finished are not needed again */
    while (song.length > 3 && song[1].start + song[1].bars < n - 8) song.shift();
    for (let i = song.length - 1; i >= 0; i--) if (song[i].start <= n) return song[i];
    return song[0];
  }

  function barRole(clock: Clock, n: number): BarRole<T> {
    const s = sectionAt(clock, n);
    const at = n - s.start;
    return {
      track: s.track,
      at,
      lands: at === 0,
      fill: at === s.bars - 1 || at % 8 === 7,
      left: s.bars - at,
    };
  }

  return { sectionAt, barRole };
}
