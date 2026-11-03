/*
  CUES AND MOODS: the soundtrack answering what happens in a run, beyond the
  progression (MusicDirector.tsx) that adds layers as the business grows.

  A cue is a one-off musical moment: a news card opening, Elise finding an
  improvement, a new model coming out, a new GPU type unlocking. The engine
  (musicEngine.ts, musicCue) lands it on the station's next beat, in the chord
  that is sounding there, so it reads as part of the song rather than a sound
  effect on top of it. A station can give any cue a sound of its own (its `cues`
  in its Station); the rest use DEFAULT_CUES below: soft bells, in key, meant as
  neutral placeholders until a station has its own. Cues only play while music is
  on air, and each cue rests at least CUE_GAP_S before it can play again.

  A mood is a state that colours the whole mix for as long as it lasts: the music
  muffled during a cloud outage, thinner while capital runs low. Each is a few
  settings on filters and a level after the music bus (MOODS); several at once
  combine, and they ease in and out.

  What fires them lives in MusicCues.tsx, which watches the board.

  To add a cue: name it in CueId (kit.ts), give it a default here, and fire it
  from MusicCues.tsx. To add a mood: name it in MoodId, give it settings here, and
  set it from MusicCues.tsx.
*/
import { hz, type CueContext, type CueId, type CuePlay, type MoodId } from "./kit";

/* the least time between two plays of the same cue */
export const CUE_GAP_S = 3;
/* how much of a cue goes to the reverb */
export const CUE_WET = 0.6;

/* A soft bell: a sine and a quiet octave, struck and ringing away. */
export function bell(
  c: CueContext,
  midi: number,
  at: number,
  level: number,
  ring = 1.4
) {
  const { ac } = c.k;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + ring);
  env.connect(c.k.out);
  for (const [mul, amp] of [
    [1, 1],
    [2, 0.25],
  ]) {
    const o = ac.createOscillator();
    o.frequency.value = hz(midi) * mul;
    const g = ac.createGain();
    g.gain.value = amp;
    o.connect(g).connect(env);
    c.k.once(o, at, at + ring + 0.05, g);
  }
  window.setTimeout(() => env.disconnect(), (at - ac.currentTime + ring + 0.3) * 1000);
}

const mod12 = (a: number) => ((a % 12) + 12) % 12;
/* The chord's notes moved into the octave from `lo` up, low to high, each once:
   how a cue picks its notes in whatever register suits its sound. */
export function chordIn(c: CueContext, lo: number) {
  return [...new Set(c.harmony.notes.map(m => lo + mod12(m - lo)))].sort(
    (a, b) => a - b
  );
}
/* the chord's root in the octave from `lo` up */
export function rootIn(c: CueContext, lo: number) {
  return lo + mod12(c.harmony.root - lo);
}
/* the chord's notes moved up into the bells' range, C5 to B5, low to high */
export const high = (c: CueContext) => chordIn(c, 72);

export const DEFAULT_CUES: Record<CueId, CuePlay> = {
  /* a news card: two quiet notes of the chord, a beat apart */
  news: c => {
    const [a, , b] = high(c);
    bell(c, a, c.at, 0.022);
    bell(c, b ?? a + 7, c.at + c.beat, 0.018);
    return c.beat + 1.4;
  },
  /* Elise found something: the chord rising, note by note */
  discovery: c => {
    const notes = high(c);
    notes.forEach((m, i) => bell(c, m, c.at + (i * c.beat) / 2, 0.022));
    bell(c, notes[0] + 12, c.at + (notes.length * c.beat) / 2, 0.02, 2);
    return ((notes.length + 1) * c.beat) / 2 + 2;
  },
  /* a new model: the whole chord at once, blooming */
  newModel: c => {
    high(c).forEach((m, i) => bell(c, m, c.at + i * 0.02, 0.016, 2.2));
    return 2.4;
  },
  /* a new GPU type: the root, then its octave */
  unlock: c => {
    const root = 72 + (((c.harmony.root % 12) + 12) % 12);
    bell(c, root, c.at, 0.022);
    bell(c, root + 12, c.at + c.beat / 2, 0.022, 1.8);
    return c.beat / 2 + 1.8;
  },
};

/* What a mood does to the mix: a low-pass (muffled), a high-pass (thin), and a
   level. Moods that overlap take the lower low-pass, the higher high-pass, and
   both levels multiplied. */
export type MoodSpec = { lowpass?: number; highpass?: number; level?: number };
/* muffled and a little quieter, as if the power dipped */
const OUTAGE: MoodSpec = { lowpass: 650, level: 0.75 };
export const MOODS: Record<MoodId, MoodSpec> = {
  /* the cloud is down: the music muffled and a little quieter, as if the power
     dipped */
  outage: OUTAGE,
  /* capital is running out: the warmth drawn out of the bottom */
  danger: { highpass: 280, level: 0.9 },
  /* the game is paused: the same muffle as an outage, the board holding its breath */
  paused: OUTAGE,
};

/* the cues and moods by name, for the /sound page */
export const CUE_LIST = Object.keys(DEFAULT_CUES) as CueId[];
export const MOOD_LIST = Object.keys(MOODS) as MoodId[];
