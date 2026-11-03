/*
  IDLE CYCLES: airy synths for the small hours. An unhurried 92 bpm, one chord a
  bar, all soft edges.

    1  pads         lush chords of detuned saws, warm and wide, each one swelling
                    in over the last as the bar changes
    2  arpeggio     soft plucks cycling through the chord, into an echo that
                    answers left and right
    3  beat & bass  a gentle drum machine (a round kick, a roomy clap, a soft
                    shaker) and a warm bass under it
    4  lead         an airy melody of long notes with a slow attack and an echo: a
                    two-bar motif and its answer, its notes on the beat always on
                    the chord

  Like Late Shift and Overclock it plays a set of TRACKS, each its own chords in
  its own key with its own arpeggio, groove and bass, and morphs from one to the
  next (music/song.ts): a soft swell of noise into the change, and a quiet cymbal
  as the new track lands.

  Chords change by fading the new notes in over the old ones, never by bending
  them; every note eases in and out, and the shaker and cymbals sit in bands under
  the drum bus's roll-off, so nothing clicks or slides.
*/
import { barClock } from "../bars";
import {
  both,
  hz,
  noiseHit,
  pickOf,
  rand,
  type Book,
  type Clock,
  type Kit,
  type Station,
} from "../kit";
import { chordIn, rootIn } from "../cues";
import { createSong, type Section } from "../song";

/* 92 bpm, the faintest swing (music/bars.ts) */
const { STEP_S, BAR_S, bars, stepTime } = barClock(92, 0.06);
/* how many times round its four-bar loop a track plays before the next one */
const LOOPS = [3, 4, 4, 6];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/* ---- the tracks ---- */

/* root is the bass note; pad is the chord's four notes, close, around G3 to E4;
   tones is the chord as pitch classes, for the melody to land on */
export type Chord = { name: string; root: number; pad: number[]; tones: number[] };
const chord = (name: string, root: number, pad: number[]): Chord => ({
  name,
  root,
  pad,
  tones: [...new Set([root, ...pad].map(m => m % 12))],
});

export type Track = {
  name: string;
  /* the key: its first note (any octave) and scale, for the melody's passing notes */
  tonic: number;
  scale: number[];
  chords: Chord[];
  /* the arpeggio: indices into the pad's four notes an octave up (4 is the
     lowest one a further octave up), cycled through the bar */
  arp: number[];
  arpStep: 1 | 2;
  /* the beat, in sixteenths */
  kicks: number[];
  claps: number[];
  shakers: number[];
  /* how the bass plays the root: pulsing eighths, off-beat eighths, or held */
  bass: "pulse" | "offbeat" | "held";
};

const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const SIXTEENTHS = [...Array(16).keys()];

export const TRACKS: Track[] = [
  {
    /* IV V iii vi in C, the city-pop "royal road" */
    name: "Standby",
    tonic: 60,
    scale: MAJOR,
    chords: [
      chord("Fmaj7", 41, [53, 57, 60, 64]),
      chord("G6", 43, [55, 59, 62, 64]),
      chord("Em7", 40, [52, 55, 59, 62]),
      chord("Am7", 45, [55, 57, 60, 64]),
    ],
    arp: [0, 1, 2, 3, 4, 3, 2, 1],
    arpStep: 2,
    kicks: [0, 8],
    claps: [4, 12],
    shakers: EIGHTHS,
    bass: "pulse",
  },
  {
    /* vi IV I V in A minor, with a soft four on the floor */
    name: "Screen Saver",
    tonic: 57,
    scale: MINOR,
    chords: [
      chord("Am9", 45, [55, 59, 60, 64]),
      chord("Fmaj9", 41, [55, 57, 60, 64]),
      chord("Cmaj9", 36, [52, 55, 59, 62]),
      chord("G6", 43, [55, 59, 62, 64]),
    ],
    arp: [0, 2, 1, 3, 2, 4, 3, 1],
    arpStep: 1,
    kicks: [0, 4, 8, 12],
    claps: [4, 12],
    shakers: [2, 6, 10, 14],
    bass: "offbeat",
  },
  {
    /* the royal road again, a half step up in D flat, at half time */
    name: "Night Mode",
    tonic: 61,
    scale: MAJOR,
    chords: [
      chord("Gbmaj7", 42, [53, 54, 58, 61]),
      chord("Ab6", 44, [53, 56, 60, 63]),
      chord("Fm7", 41, [51, 53, 56, 60]),
      chord("Bbm7", 46, [53, 56, 58, 61]),
    ],
    arp: [0, 2, 4, 2],
    arpStep: 2,
    kicks: [0, 10],
    claps: [8],
    shakers: SIXTEENTHS,
    bass: "held",
  },
  {
    /* i VI III VII in E minor, driving a little more */
    name: "Afterglow",
    tonic: 52,
    scale: MINOR,
    chords: [
      chord("Em9", 40, [54, 55, 59, 62]),
      chord("Cmaj7", 36, [52, 55, 59, 60]),
      chord("Gmaj7", 43, [55, 59, 62, 66]),
      chord("D6", 38, [54, 57, 59, 62]),
    ],
    arp: [0, 1, 2, 3],
    arpStep: 1,
    kicks: [0, 6, 8],
    claps: [4, 12],
    shakers: EIGHTHS,
    bass: "pulse",
  },
  {
    /* I vi IV V in D, slow and spacious */
    name: "Sleep Timer",
    tonic: 62,
    scale: MAJOR,
    chords: [
      chord("Dmaj9", 38, [54, 57, 61, 64]),
      chord("Bm9", 47, [54, 57, 61, 62]),
      chord("Gmaj9", 43, [54, 57, 59, 62]),
      chord("Asus2", 45, [52, 57, 59, 64]),
    ],
    arp: [0, 4, 2, 4, 1, 4, 3, 4],
    arpStep: 2,
    kicks: [0, 8],
    claps: [12],
    shakers: [2, 6, 10, 14],
    bass: "held",
  },
];

/* ---- the song (music/song.ts) ---- */

export const { sectionAt, barRole } = createSong(
  TRACKS,
  t => pickOf(LOOPS) * t.chords.length
);
export function chordAt(clock: Clock, n: number): Chord {
  const s = sectionAt(clock, n);
  return s.track.chords[(n - s.start) % s.track.chords.length];
}

/* ---- what each bar plays (pure, so it can be read and tested on its own) ---- */

export type Note = { step: number; len: number; midi: number };

export function arpBar(track: Track, c: Chord): Note[] {
  const pool = [...c.pad.map(m => m + 12), c.pad[0] + 24];
  const notes: Note[] = [];
  for (let i = 0, step = 0; step < 16; i++, step += track.arpStep)
    notes.push({
      step,
      len: track.arpStep,
      midi: pool[track.arp[i % track.arp.length]],
    });
  return notes;
}

/* a bar of bass on this chord; into a new track the last beat moves to the new
   root a beat early, so the bass leads across */
export function bassBar(track: Track, c: Chord, next: Chord | null): Note[] {
  const notes: Note[] =
    track.bass === "held"
      ? [{ step: 0, len: 14, midi: c.root }]
      : track.bass === "offbeat"
        ? [2, 6, 10, 14].map(step => ({ step, len: 2, midi: c.root }))
        : EIGHTHS.map(step => ({
            step,
            len: 2,
            midi: c.root + (step === 6 || step === 14 ? 12 : 0),
          }));
  if (next) {
    const kept = notes.filter(n => n.step < 12);
    if (kept.length && track.bass === "held") kept[0].len = 12;
    kept.push({ step: 12, len: 4, midi: next.root });
    return kept;
  }
  return notes;
}

export type Hit = {
  step: number;
  kind: "kick" | "clap" | "shaker" | "swell" | "cymbal";
  vel: number;
};
/* a bar of the beat; a fill bar gives the second half to a soft swell of noise,
   and the first bar of a new track lands with a quiet cymbal */
export function beatBar(track: Track, fill: boolean, lands: boolean): Hit[] {
  const hits: Hit[] = [];
  for (const step of track.kicks)
    if (!fill || step < 8) hits.push({ step, kind: "kick", vel: 1 });
  for (const step of track.claps)
    if (!fill || step < 8) hits.push({ step, kind: "clap", vel: 1 });
  for (const step of track.shakers)
    if (!fill || step < 8)
      hits.push({
        step,
        kind: "shaker",
        vel: (step % 4 === 0 ? 1 : 0.7) * rand(0.85, 1.1),
      });
  if (fill) hits.push({ step: 8, kind: "swell", vel: 1 });
  if (lands) hits.push({ step: 0, kind: "cymbal", vel: 1 });
  return hits;
}

/* The lead: rhythms in eighths over two bars, mostly long notes; the melody as
   steps of the track's scale. */
const RHYTHMS: [at: number, len: number][][] = [
  [
    [0, 3],
    [3, 1],
    [4, 4],
    [8, 2],
    [10, 2],
    [12, 4],
  ],
  [
    [0, 2],
    [2, 2],
    [4, 2],
    [6, 2],
    [8, 6],
    [14, 2],
  ],
  [
    [2, 2],
    [4, 1],
    [5, 1],
    [6, 4],
    [10, 2],
    [12, 4],
  ],
  [
    [0, 6],
    [6, 2],
    [8, 4],
    [12, 4],
  ],
];
/* the lead's span, in scale steps from the tonic (which sits between F4 and E5) */
const LOW = -2;
const HIGH = 7;
export type Motif = { at: number; len: number; deg: number }[];
export function compose(): Motif {
  let deg = pickOf([0, 2, 4]);
  return pickOf(RHYTHMS).map(([at, len]) => {
    const note = { at, len, deg };
    const by = Math.random() < 0.8 ? 1 : 2;
    deg = Math.max(LOW, Math.min(HIGH, deg + (Math.random() < 0.5 ? -by : by)));
    return note;
  });
}
/* the same first bar, a new second one */
export function answer(motif: Motif): Motif {
  return motif.map(n =>
    n.at < 8
      ? { ...n }
      : { ...n, deg: Math.max(LOW, Math.min(HIGH, n.deg + pickOf([-2, -1, 1, 2]))) }
  );
}
const mod = (a: number, n: number) => ((a % n) + n) % n;
function placed(note: number, lo: number, hi: number) {
  let m = note;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}
export const leadBase = (track: Track) => placed(track.tonic, 65, 76);
/* scale step `deg` of the track's key, up from `base` */
export const scaleNote = (track: Track, base: number, deg: number) =>
  base + track.scale[mod(deg, 7)] + 12 * Math.floor(deg / 7);
/* The motif from bar n: notes on one and three moved to the nearest scale step
   that is in the chord under them, staying within a step of the lead's span. */
export function realize(track: Track, motif: Motif, chords: [Chord, Chord]): Motif {
  const base = leadBase(track);
  return motif.map(n => {
    if (n.at % 4) return { ...n };
    const tones = chords[n.at < 8 ? 0 : 1].tones;
    for (let off = 0; off < 5; off++)
      for (const d of [n.deg - off, n.deg + off])
        if (
          d >= LOW - 1 &&
          d <= HIGH + 1 &&
          tones.includes(mod(scaleNote(track, base, d), 12))
        )
          return { ...n, deg: d };
    return { ...n };
  });
}

/* ---- sound ---- */

/* The same sound left and, a few milliseconds later, right: wide without any
   change of pitch. Returns the node to play into. */
function wide(k: Kit, ms: number): AudioNode {
  const { ac } = k;
  const input = k.keep(ac.createGain());
  const left = k.keep(ac.createStereoPanner());
  left.pan.value = -0.5;
  const late = k.keep(ac.createDelay(0.1));
  late.delayTime.value = ms / 1000;
  const right = k.keep(ac.createStereoPanner());
  right.pan.value = 0.5;
  input.connect(left).connect(k.out);
  input.connect(late).connect(right).connect(k.out);
  return input;
}

/* An echo that answers left then right: a repeat `steps` sixteenths later on one
   side, then later again on the other, each a little darker and quieter. */
function pingPong(k: Kit, from: AudioNode, steps: number, level: number) {
  const { ac } = k;
  const dark = k.keep(ac.createBiquadFilter());
  dark.type = "lowpass";
  dark.frequency.value = 2400;
  const a = k.keep(ac.createDelay(2));
  a.delayTime.value = steps * STEP_S;
  const b = k.keep(ac.createDelay(2));
  b.delayTime.value = steps * STEP_S;
  const back = k.keep(ac.createGain());
  back.gain.value = 0.35;
  const send = k.keep(ac.createGain());
  send.gain.value = level;
  const left = k.keep(ac.createStereoPanner());
  left.pan.value = -0.7;
  const right = k.keep(ac.createStereoPanner());
  right.pan.value = 0.7;
  from.connect(send).connect(dark).connect(a);
  a.connect(left).connect(k.out);
  a.connect(b);
  b.connect(right).connect(k.out);
  b.connect(back).connect(a);
}

/* 1  The pads: each chord's four notes, each two saws detuned apart, under a
   low-pass that slowly breathes open and shut. A chord swells in over a second
   and a quarter and fades over a second and a half after its bar, so each one
   melts into the next. */
function pads(k: Kit): Book {
  const { ac, clock } = k;
  const filter = k.keep(ac.createBiquadFilter());
  filter.type = "lowpass";
  filter.frequency.value = 1300;
  filter.Q.value = 0.4;
  k.lfo(0.05, 450, filter.frequency);
  filter.connect(wide(k, 18));

  const voice = (midi: number, at: number, len: number) => {
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.012, at + 1.25);
    env.gain.setValueAtTime(0.012, at + len);
    env.gain.linearRampToValueAtTime(0, at + len + 1.5);
    env.connect(filter);
    let first = true;
    for (const cents of [-9, 9]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(midi);
      o.detune.value = cents;
      o.connect(env);
      if (first) k.once(o, at, at + len + 1.6, env);
      else k.once(o, at, at + len + 1.6);
      first = false;
    }
  };

  return bars(k, (n, at) => {
    for (const m of chordAt(clock, n).pad) voice(m, at, BAR_S);
  });
}

/* 2  The arpeggio: a saw whose brightness falls away fast, like a plucked string,
   into its own wide echo. */
function arpeggio(k: Kit): Book {
  const { ac, clock } = k;
  const into = wide(k, 9);
  pingPong(k, into, 3, 0.6);
  const pluck = (midi: number, at: number) => {
    const tone = ac.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(2800, at);
    tone.frequency.setTargetAtTime(500, at, 0.08);
    tone.Q.value = 0.8;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.028, at + 0.004);
    env.gain.setTargetAtTime(0, at + 0.004, 0.12);
    tone.connect(env).connect(into);
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz(midi);
    o.connect(tone);
    k.once(o, at, at + 0.7, tone, env);
  };
  return bars(k, (n, at) => {
    const track = barRole(clock, n).track;
    for (const note of arpBar(track, chordAt(clock, n)))
      pluck(note.midi, stepTime(at, note.step));
  });
}

/* 3a  The beat, through a bus rolled off above 10 kHz. */
function beat(k: Kit): Book {
  const { ac, clock } = k;
  const into = k.keep(ac.createBiquadFilter());
  into.type = "lowpass";
  into.frequency.value = 10000;
  into.connect(k.out);

  const noise = (
    at: number,
    centre: number,
    q: number,
    level: number,
    attack: number,
    decay: number
  ) => {
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = centre;
    band.Q.value = q;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    band.connect(env).connect(into);
    noiseHit(k, at, at + attack + decay + 0.02, band, env);
  };
  const kick = (at: number) => {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(110, at);
    o.frequency.exponentialRampToValueAtTime(44, at + 0.09);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.32, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
    o.connect(env).connect(into);
    k.once(o, at, at + 0.4, env);
  };
  /* a clap: three quick soft bursts and a tail, the way a drum machine's is */
  const clap = (at: number) => {
    for (const d of [0, 0.011, 0.022]) noise(at + d, 1400, 0.7, 0.06, 0.002, 0.03);
    noise(at + 0.03, 1400, 0.6, 0.05, 0.003, 0.22);
  };

  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    for (const h of beatBar(role.track, role.fill, role.lands)) {
      const t = stepTime(at, h.step);
      if (h.kind === "kick") kick(t);
      else if (h.kind === "clap") clap(t);
      else if (h.kind === "shaker") noise(t, 7000, 1.2, 0.014 * h.vel, 0.006, 0.05);
      /* half a bar of noise easing up into the change, then gone */
      else if (h.kind === "swell") noise(t, 4500, 0.6, 0.02, 8 * STEP_S, 0.15);
      else noise(t, 6500, 0.5, 0.022, 0.01, 1.6);
    }
  });
}

/* 3b  The bass: a warm saw, rounded right down, with a soft start and end. */
function bass(k: Kit): Book {
  const { ac, clock } = k;
  const tone = k.keep(ac.createBiquadFilter());
  tone.type = "lowpass";
  tone.frequency.value = 420;
  tone.Q.value = 0.6;
  tone.connect(k.out);
  const note = (midi: number, at: number, len: number) => {
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz(midi);
    const env = ac.createGain();
    const hold = Math.max(0.02, len);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.14, at + 0.008);
    env.gain.setTargetAtTime(0.1, at + 0.008, 0.25);
    env.gain.setTargetAtTime(0, at + hold, 0.03);
    o.connect(env).connect(tone);
    k.once(o, at, at + hold + 0.2, env);
  };
  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    const next = role.left === 1 ? chordAt(clock, n + 1) : null;
    for (const b of bassBar(role.track, chordAt(clock, n), next))
      note(b.midi, stepTime(at, b.step), b.len * STEP_S * 0.85);
  });
}

/* 4  The lead: a soft saw and a triangle a hair apart, low-passed and slow to
   speak, into a wide echo. A motif on bar 1 of each loop and its answer on bar 3;
   now and then a loop rests, but never the first. */
function lead(k: Kit): Book {
  const { ac, clock } = k;
  const tone = k.keep(ac.createBiquadFilter());
  tone.type = "lowpass";
  tone.frequency.value = 1900;
  tone.Q.value = 0.5;
  const into = wide(k, 12);
  tone.connect(into);
  pingPong(k, tone, 6, 0.5);

  const note = (midi: number, at: number, len: number) => {
    const env = ac.createGain();
    const hold = Math.max(0.1, len);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.03, at + 0.08);
    env.gain.setValueAtTime(0.03, at + hold);
    env.gain.linearRampToValueAtTime(0, at + hold + 0.4);
    env.connect(tone);
    let first = true;
    for (const [type, cents, level] of [
      ["sawtooth", -4, 0.6],
      ["triangle", 4, 1],
    ] as const) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = hz(midi);
      o.detune.value = cents;
      const g = ac.createGain();
      g.gain.value = level;
      o.connect(g).connect(env);
      if (first) k.once(o, at, at + hold + 0.45, g, env);
      else k.once(o, at, at + hold + 0.45, g);
      first = false;
    }
  };

  const plans = new WeakMap<
    Section<Track>,
    { call: Motif; reply: Motif; rest: Set<number> }
  >();
  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    const pos = role.at % 4;
    if (pos !== 0 && pos !== 2) return;
    const section = sectionAt(clock, n);
    let plan = plans.get(section);
    if (!plan) {
      const call = compose();
      plan = { call, reply: answer(call), rest: new Set() };
      plans.set(section, plan);
    }
    const loop = Math.floor(role.at / 4);
    if (pos === 0 && loop > 0 && !plan.rest.has(loop) && Math.random() < 0.3)
      plan.rest.add(loop);
    if (plan.rest.has(loop)) return;
    const room = Math.min(2, role.left) * 8;
    const motif = realize(role.track, pos === 0 ? plan.call : plan.reply, [
      chordAt(clock, n),
      chordAt(clock, n + 1),
    ]);
    const base = leadBase(role.track);
    for (const m of motif) {
      if (m.at >= room) break;
      const len = Math.min(m.len, room - m.at) * 2 * STEP_S - 0.05;
      note(scaleNote(role.track, base, m.deg), stepTime(at, m.at * 2), len);
    }
  });
}

/* ---- cues: the station's own voice for the game's moments (music/cues.ts) ---- */

/* a node placed `pan` across the stereo field (-1 left, 1 right), into the cue */
function side(k: Kit, pan: number) {
  const p = k.ac.createStereoPanner();
  p.pan.value = pan;
  p.connect(k.out);
  return p;
}
/* The arpeggio's pluck, on its own: a saw whose brightness falls away fast. */
function cuePluck(k: Kit, midi: number, at: number, level: number, pan: number) {
  const { ac } = k;
  const into = side(k, pan);
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(2800, at);
  tone.frequency.setTargetAtTime(500, at, 0.08);
  tone.Q.value = 0.8;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.004);
  env.gain.setTargetAtTime(0, at + 0.004, 0.12);
  tone.connect(env).connect(into);
  const o = ac.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = hz(midi);
  o.connect(tone);
  k.once(o, at, at + 0.7, tone, env, into);
}
/* The lead's airy voice, on its own: a soft saw and a triangle, slow to speak. */
function cueAir(k: Kit, midi: number, at: number, len: number, level: number) {
  const { ac } = k;
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1900;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.08);
  env.gain.setValueAtTime(level, at + len);
  env.gain.linearRampToValueAtTime(0, at + len + 0.5);
  env.connect(tone).connect(k.out);
  (["sawtooth", "triangle"] as const).forEach((type, i) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    o.detune.value = i ? 4 : -4;
    const amp = ac.createGain();
    amp.gain.value = i ? 1 : 0.6;
    o.connect(amp).connect(env);
    k.once(o, at, at + len + 0.55, amp, ...(i ? [] : [env, tone]));
  });
}
/* A shimmer: high, detuned saws swelling in over a second and fading slowly, wide. */
function shimmer(k: Kit, notes: number[], at: number, hold: number, level: number) {
  const { ac } = k;
  const end = at + 1 + hold + 2.5;
  notes.forEach((m, i) => {
    const into = side(k, i % 2 ? 0.6 : -0.6);
    const tone = ac.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 1);
    env.gain.setValueAtTime(level, at + 1 + hold);
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(tone).connect(into);
    [-12, 12].forEach((cents, j) => {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      o.detune.value = cents;
      o.connect(env);
      k.once(o, at, end + 0.05, ...(j ? [] : [env, tone, into]));
    });
  });
  return end - at;
}

/* the station's own voice for the commonest effects (music/sfx.ts) */
const SYNTH_SFX: Station["sfx"] = {
  /* a click: a soft pluck of a note of the chord, somewhere across the stereo */
  click: c => {
    cuePluck(c.k, pickOf(chordIn(c, 72)), c.at, 0.04, rand(-0.4, 0.4));
    return 0.75;
  },
  /* a ding: the chord's top note, with a quiet chime an octave above */
  ding: c => {
    const notes = chordIn(c, 72);
    const top = notes[notes.length - 1];
    cuePluck(c.k, top, c.at, 0.04, -0.3);
    cuePluck(c.k, top + 12, c.at + 0.06, 0.018, 0.3);
    return 0.8;
  },
  /* the news: one pluck echoing left, right, left */
  news: c => {
    const m = chordIn(c, 72)[1];
    [0, 0.18, 0.36].forEach((d, i) =>
      cuePluck(c.k, m, c.at + d, 0.035 * [1, 0.55, 0.3][i], i % 2 ? 0.6 : -0.6)
    );
    return 1.1;
  },
};

const SYNTH_CUES: Station["cues"] = {
  /* a news card: one pluck of the chord, echoing left, right, left */
  news: c => {
    const m = chordIn(c, 72)[1];
    [0, 0.75, 1.5].forEach((d, i) =>
      cuePluck(c.k, m, c.at + d * c.beat, 0.03 * [1, 0.55, 0.3][i], i % 2 ? 0.6 : -0.6)
    );
    return c.beat * 1.5 + 0.8;
  },
  /* Elise found something: plucks climbing the chord, side to side, then its top */
  discovery: c => {
    const notes = chordIn(c, 72);
    [...notes, notes[0] + 12].forEach((m, i) =>
      cuePluck(c.k, m, c.at + (i * c.beat) / 4, 0.03, i % 2 ? 0.5 : -0.5)
    );
    return ((notes.length + 1) * c.beat) / 4 + 0.8;
  },
  /* a new model: the chord up high, shimmering in and slowly away */
  newModel: c => shimmer(c.k, chordIn(c, 72), c.at, c.beat, 0.006),
  /* a new GPU type: the lead's voice on the root, then its octave, held */
  unlock: c => {
    const r = rootIn(c, 72);
    cueAir(c.k, r, c.at, c.beat * 0.9, 0.032);
    cueAir(c.k, r + 12, c.at + c.beat, c.beat * 2, 0.032);
    return c.beat * 3 + 0.6;
  },
};

export const IDLE_CYCLES: Station = {
  id: "idle-cycles",
  name: "Idle Cycles",
  blurb: "airy synths for the small hours",
  beat: 4 * STEP_S,
  harmony: (clock, t) => {
    const c = chordAt(clock, Math.floor((t - clock.t0) / BAR_S + 1e-6));
    return { root: c.root, notes: c.pad };
  },
  cues: SYNTH_CUES,
  acoustics: "dream",
  sfx: SYNTH_SFX,
  layers: [
    { name: "pads", wet: 0.45, build: pads },
    { name: "arpeggio", wet: 0.35, build: arpeggio },
    { name: "beat & bass", wet: 0.18, build: k => both(beat(k), bass(k)) },
    { name: "lead", wet: 0.5, build: lead },
  ],
};
