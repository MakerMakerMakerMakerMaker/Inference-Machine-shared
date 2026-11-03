/*
  OVERCLOCK: bright 8-bit tunes, full speed ahead. Straight sixteenths at 116 bpm,
  on the four channels of an old games console: two pulse waves, a triangle and a
  noise channel.

    1  arpeggio  the chord's three notes cycled quickly on a thin pulse wave, the
                 classic chip way of playing a chord
    2  drums     the noise channel: a blip of a kick, a snare, ticking hats, a
                 roll of snares before a change and a crash on the new track
    3  bass      a bouncing triangle-wave bass
    4  lead      a catchy pulse-wave melody with the console's trick of an echo: a
                 two-bar motif and its answer, round and round, its strong notes
                 always on the bar's chord

  Like Late Shift it plays a set of TRACKS, each in its own key with its own
  chords, arpeggio, groove, bass line and lead tone, and morphs from one to another
  (music/song.ts): a snare roll into the change, the bass walking into the new
  key, a crash as it lands, and a fresh motif in the new key.

  Harmony is written in scale degrees (0 is the key's first note), so a track's
  chords, arpeggio, bass and melody all come out of its key and its list of chord
  roots. The melody is stored as degrees too, and its notes on the beats (one and
  three) are moved to the nearest note of whatever chord is under them, which is
  what lets one motif fit every bar of the loop. Every note fades in and out over a
  few milliseconds, so the square waves never click, and nothing slides in pitch.
*/
import { barClock } from "../bars";
import {
  hz,
  pickOf,
  rand,
  noiseHit,
  type Book,
  type Clock,
  type Kit,
  type Station,
} from "../kit";
import { chordIn, rootIn } from "../cues";
import { createSong, type Section } from "../song";

/* 116 bpm, straight sixteenths (music/bars.ts) */
const { STEP_S, BAR_S, bars, stepTime } = barClock(116);
/* how many times round its four-bar loop a track plays before the next one */
const LOOPS = [4, 4, 6, 8];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/* ---- the tracks ---- */

/* A bass line, in sixteenths: where each note starts, how long it lasts, and how
   far above the root it is (0 the root, 7 the fifth, 12 the octave). */
type BassLine = [step: number, len: number, up: number][];
const OCTAVES: BassLine = [
  [0, 2, 0],
  [2, 2, 12],
  [4, 2, 0],
  [6, 2, 12],
  [8, 2, 0],
  [10, 2, 12],
  [12, 2, 0],
  [14, 2, 12],
];
const ROOT_FIFTH: BassLine = [
  [0, 3, 0],
  [4, 2, 0],
  [6, 2, 7],
  [8, 3, 0],
  [12, 2, 7],
  [14, 2, 12],
];
const GALLOP: BassLine = [
  [0, 1, 0],
  [1, 1, 0],
  [2, 2, 0],
  [4, 1, 0],
  [5, 1, 0],
  [6, 2, 7],
  [8, 1, 0],
  [9, 1, 0],
  [10, 2, 0],
  [12, 1, 0],
  [13, 1, 0],
  [14, 2, 12],
];
const QUARTERS: BassLine = [
  [0, 4, 0],
  [4, 4, 7],
  [8, 4, 12],
  [12, 4, 7],
];

export type Track = {
  name: string;
  /* the key: its first note (any octave) and its scale */
  tonic: number;
  scale: number[];
  /* the root of each bar's chord, as a scale degree; each chord is that degree's
     triad (the root, the third and the fifth above it in the key) */
  chords: number[];
  /* arpeggio patterns, cycled through the bar: 0 1 2 are the chord's notes from
     the bottom, 3 the bottom one an octave up. A pattern need not fit the bar
     evenly; a six-note one against sixteen steps rolls round, as chip tunes do. */
  arps: number[][];
  /* the arpeggio's note length in sixteenths: 1 for a fast shimmer, 2 for eighths */
  arpStep: 1 | 2;
  kicks: number[][];
  snares: number[];
  /* a closed hat every this many sixteenths */
  hatEvery: number;
  bass: BassLine[];
  /* the lead's pulse width: 0.125 thin and nasal, 0.25 the classic, 0.5 hollow */
  duty: number;
};

export const TRACKS: Track[] = [
  {
    /* I V vi IV in C */
    name: "Start Screen",
    tonic: 60,
    scale: MAJOR,
    chords: [0, 4, 5, 3],
    arps: [
      [0, 1, 2, 1],
      [0, 1, 2, 3],
    ],
    arpStep: 2,
    kicks: [
      [0, 8],
      [0, 8, 10],
    ],
    snares: [4, 12],
    hatEvery: 2,
    bass: [OCTAVES],
    duty: 0.25,
  },
  {
    /* I vi IV V in G, four on the floor */
    name: "Level Up",
    tonic: 55,
    scale: MAJOR,
    chords: [0, 5, 3, 4],
    arps: [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
    ],
    arpStep: 1,
    kicks: [[0, 4, 8, 12]],
    snares: [4, 12],
    hatEvery: 2,
    bass: [ROOT_FIFTH, OCTAVES],
    duty: 0.5,
  },
  {
    /* I IV ii V in F, galloping */
    name: "Bonus Stage",
    tonic: 53,
    scale: MAJOR,
    chords: [0, 3, 1, 4],
    arps: [[0, 2, 1, 2]],
    arpStep: 1,
    kicks: [
      [0, 8],
      [0, 6, 8],
    ],
    snares: [4, 12],
    hatEvery: 2,
    bass: [GALLOP],
    duty: 0.125,
  },
  {
    /* I IV I V in D, with an arpeggio that rolls across the bar */
    name: "Overworld",
    tonic: 62,
    scale: MAJOR,
    chords: [0, 3, 0, 4],
    arps: [[0, 1, 2, 3, 2, 1]],
    arpStep: 1,
    kicks: [
      [0, 8],
      [0, 10],
    ],
    snares: [4, 12],
    hatEvery: 2,
    bass: [OCTAVES, ROOT_FIFTH],
    duty: 0.25,
  },
  {
    /* i VI III VII in A minor, a little calmer */
    name: "Night Level",
    tonic: 57,
    scale: MINOR,
    chords: [0, 5, 2, 6],
    arps: [
      [0, 1, 2, 1],
      [2, 1, 0, 1],
    ],
    arpStep: 2,
    kicks: [
      [0, 8],
      [0, 3, 8],
    ],
    snares: [4, 12],
    hatEvery: 4,
    bass: [QUARTERS, ROOT_FIFTH],
    duty: 0.5,
  },
];

/* ---- the key: degrees to notes ---- */

const mod = (a: number, n: number) => ((a % n) + n) % n;
/* scale degree `deg` of the track's key, counted up from note `base` (a tonic) */
export function degree(track: Track, deg: number, base: number) {
  return base + track.scale[mod(deg, 7)] + 12 * Math.floor(deg / 7);
}
/* the same note moved by octaves into [lo, hi] */
function placed(note: number, lo: number, hi: number) {
  let m = note;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}
/* the tonic in the lead's range, so every key's melody sits in the same place */
const leadBase = (track: Track) => placed(track.tonic, 65, 76);

/* bar n's chord root degree, and the triad on it as degrees */
export function rootAt(clock: Clock, n: number) {
  const s = sectionAt(clock, n);
  return s.track.chords[mod(n - s.start, s.track.chords.length)];
}
const triad = (root: number) => [root, root + 2, root + 4];
/* the chord's three notes close together around G4 to G5, low to high */
export function arpNotes(track: Track, root: number) {
  return triad(root)
    .map(d => placed(degree(track, d, track.tonic), 67, 78))
    .sort((a, b) => a - b);
}
/* the chord's root in the bass, C2 to B2 */
export function bassRoot(track: Track, root: number) {
  return placed(degree(track, root, track.tonic), 36, 47);
}
/* the degree nearest d that is in the chord on `root` */
export function snap(d: number, root: number) {
  const tones = triad(root).map(t => mod(t, 7));
  for (let off = 0; off < 4; off++) {
    if (tones.includes(mod(d - off, 7))) return d - off;
    if (tones.includes(mod(d + off, 7))) return d + off;
  }
  return d;
}

/* ---- the song (music/song.ts) ---- */

export const { sectionAt, barRole } = createSong(
  TRACKS,
  t => pickOf(LOOPS) * t.chords.length
);

/* ---- what each bar plays (pure, so it can be read and tested on its own) ---- */

export type Hit = {
  step: number;
  kind: "kick" | "snare" | "hat" | "open" | "crash";
  vel: number;
};
export function drumBar(track: Track, fill: boolean, lands: boolean): Hit[] {
  const hits: Hit[] = [];
  for (const step of pickOf(track.kicks)) {
    if (fill && step > 8) continue;
    hits.push({ step, kind: "kick", vel: step ? 0.85 : 1 });
  }
  if (lands) hits.push({ step: 0, kind: "crash", vel: 1 });
  if (fill) {
    /* a roll of sixteenth snares, getting louder, into the change */
    hits.push({ step: 4, kind: "snare", vel: 1 });
    for (let step = 10; step < 16; step++)
      hits.push({ step, kind: "snare", vel: 0.45 + 0.09 * (step - 10) });
  } else {
    for (const step of track.snares) hits.push({ step, kind: "snare", vel: 1 });
  }
  for (let step = 0; step < 16; step += track.hatEvery) {
    if (fill && step >= 10) break;
    const open = step === 14 && Math.random() < 0.2;
    hits.push({
      step,
      kind: open ? "open" : "hat",
      vel: (step % 4 === 0 ? 1 : 0.7) * rand(0.9, 1.1),
    });
  }
  return hits;
}

export type Note = { step: number; len: number; midi: number };
/* a bar of the track's bass line on this chord; into a new track the last note
   walks to a step next to the new root */
export function bassBar(track: Track, root: number, next: number | null): Note[] {
  const base = bassRoot(track, root);
  const notes: Note[] = pickOf(track.bass).map(([step, len, up]) => ({
    step,
    len,
    midi: base + up,
  }));
  if (next != null) {
    const last = notes[notes.length - 1];
    last.midi = next + pickOf([-1, 2]);
  }
  return notes;
}

/* a bar of arpeggio: the pattern cycled across the bar at the track's speed */
export function arpBar(track: Track, root: number): Note[] {
  const [a, b, c] = arpNotes(track, root);
  const pool = [a, b, c, a + 12];
  const pattern = pickOf(track.arps);
  const notes: Note[] = [];
  for (let i = 0, step = 0; step < 16; i++, step += track.arpStep)
    notes.push({ step, len: track.arpStep, midi: pool[pattern[i % pattern.length]] });
  return notes;
}

/* A two-bar motif: rhythms in eighths (where each note starts, how long it
   lasts), and a melody as scale degrees, mostly stepping, sometimes leaping a
   third. */
const RHYTHMS: [at: number, len: number][][] = [
  [
    [0, 1],
    [1, 1],
    [2, 2],
    [4, 1],
    [5, 1],
    [6, 2],
    [8, 2],
    [10, 1],
    [11, 1],
    [12, 4],
  ],
  [
    [0, 2],
    [2, 1],
    [3, 1],
    [4, 2],
    [6, 2],
    [8, 1],
    [9, 1],
    [10, 2],
    [12, 3],
  ],
  [
    [0, 1],
    [1, 2],
    [3, 1],
    [4, 3],
    [8, 1],
    [9, 2],
    [11, 1],
    [12, 4],
  ],
  [
    [0, 3],
    [3, 1],
    [4, 4],
    [8, 3],
    [11, 1],
    [12, 4],
  ],
];
/* the melody's span, in degrees of the key from its tonic, which sits between F4
   and E5: about an octave and a half, so it never gets shrill */
const LOW = -2;
const HIGH = 7;
export type Motif = { at: number; len: number; deg: number }[];
export function compose(): Motif {
  let deg = pickOf([2, 4, 7]);
  return pickOf(RHYTHMS).map(([at, len]) => {
    const note = { at, len, deg };
    const r = Math.random();
    const by = r < 0.1 ? 0 : r < 0.8 ? 1 : 2;
    deg = Math.max(LOW, Math.min(HIGH, deg + (Math.random() < 0.5 ? -by : by)));
    return note;
  });
}
/* the answer to a motif: the same first bar, a new second one */
export function answer(motif: Motif): Motif {
  return motif.map(n =>
    n.at < 8
      ? { ...n }
      : { ...n, deg: Math.max(LOW, Math.min(HIGH, n.deg + pickOf([-2, -1, 1, 2]))) }
  );
}
/* A motif played from bar n: notes on the beats (one and three of each bar) moved
   to the nearest note of the chord under them. */
export function realize(motif: Motif, roots: [number, number]): Motif {
  return motif.map(n => {
    const root = roots[n.at < 8 ? 0 : 1];
    return n.at % 4 === 0 ? { ...n, deg: snap(n.deg, root) } : { ...n };
  });
}

/* ---- sound ---- */

/* A pulse wave of the given width, from its Fourier series, cut off after 40
   harmonics so it stays bright without fizzing. One of each per context. */
const waves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
function pulse(ac: BaseAudioContext, duty: number) {
  let byDuty = waves.get(ac);
  if (!byDuty) waves.set(ac, (byDuty = new Map()));
  let wave = byDuty.get(duty);
  if (!wave) {
    const n = 40;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let i = 1; i <= n; i++)
      real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    wave = ac.createPeriodicWave(real, imag);
    byDuty.set(duty, wave);
  }
  return wave;
}

/* One chip note: an oscillator through its own envelope, in over 4 ms and out over
   about 20 ms after `len`, so the edges of the wave never click. */
function chipNote(
  k: Kit,
  into: AudioNode,
  shape: { duty: number } | { type: OscillatorType },
  midi: number,
  at: number,
  len: number,
  level: number
) {
  const { ac } = k;
  const o = ac.createOscillator();
  if ("duty" in shape) o.setPeriodicWave(pulse(ac, shape.duty));
  else o.type = shape.type;
  o.frequency.value = hz(midi);
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.004);
  env.gain.setValueAtTime(level, at + Math.max(0.005, len));
  env.gain.linearRampToValueAtTime(0, at + Math.max(0.005, len) + 0.02);
  o.connect(env).connect(into);
  k.once(o, at, at + len + 0.05, env);
}

/* a low-pass into the layer's output, to take the edge off the pulse waves */
function soft(k: Kit, cutoff: number) {
  const f = k.keep(k.ac.createBiquadFilter());
  f.type = "lowpass";
  f.frequency.value = cutoff;
  f.connect(k.out);
  return f;
}

/* 1  The arpeggio, on a thin pulse, kept quiet: it is the bed the rest sits on. */
function arpeggio(k: Kit): Book {
  const { clock } = k;
  const into = soft(k, 5000);
  return bars(k, (n, at) => {
    const track = barRole(clock, n).track;
    for (const note of arpBar(track, rootAt(clock, n)))
      chipNote(
        k,
        into,
        { duty: 0.125 },
        note.midi,
        stepTime(at, note.step),
        note.len * STEP_S * 0.7,
        0.018
      );
  });
}

/* 2  The drums. The noise sounds keep to bands under the drum bus's 10 kHz roll-off,
   so each comes through whole rather than as a bare click, and each eases in. */
function drums(k: Kit): Book {
  const { ac, clock } = k;
  const into = soft(k, 10000);

  const noise = (
    at: number,
    centre: number,
    q: number,
    level: number,
    decay: number
  ) => {
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = centre;
    band.Q.value = q;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    band.connect(env).connect(into);
    noiseHit(k, at, at + decay + 0.02, band, env);
  };
  /* the console's kick: a triangle blip falling fast */
  const kick = (at: number, vel: number) => {
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(180, at);
    o.frequency.exponentialRampToValueAtTime(55, at + 0.05);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.3 * vel, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    o.connect(env).connect(into);
    k.once(o, at, at + 0.18, env);
  };

  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    for (const h of drumBar(role.track, role.fill, role.lands)) {
      const t = stepTime(at, h.step);
      if (h.kind === "kick") kick(t, h.vel);
      else if (h.kind === "snare") noise(t, 1800, 0.5, 0.1 * h.vel, 0.14);
      else if (h.kind === "hat") noise(t, 8000, 1, 0.018 * h.vel, 0.035);
      else if (h.kind === "open") noise(t, 8000, 1, 0.016 * h.vel, 0.15);
      else noise(t, 6000, 0.5, 0.03, 0.8);
    }
  });
}

/* 3  The bass, on the console's triangle. */
function bass(k: Kit): Book {
  const { clock } = k;
  const into = soft(k, 3000);
  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    const next =
      role.left === 1
        ? bassRoot(barRole(clock, n + 1).track, rootAt(clock, n + 1))
        : null;
    for (const note of bassBar(role.track, rootAt(clock, n), next))
      chipNote(
        k,
        into,
        { type: "triangle" },
        note.midi,
        stepTime(at, note.step),
        note.len * STEP_S * 0.9,
        0.16
      );
  });
}

/* 4  The lead: a pulse at the track's width, and the console's echo (the same
   line again three sixteenths later, quieter and darker). Each track gets a motif
   and its answer, played on bars 1 and 3 of its loop. Now and then a loop rests,
   but never the first. */
function lead(k: Kit): Book {
  const { ac, clock } = k;
  const into = soft(k, 6000);
  const echo = k.keep(ac.createDelay(1));
  echo.delayTime.value = 3 * STEP_S;
  const dark = k.keep(ac.createBiquadFilter());
  dark.type = "lowpass";
  dark.frequency.value = 3000;
  const feedback = k.keep(ac.createGain());
  feedback.gain.value = 0.25;
  const echoLevel = k.keep(ac.createGain());
  echoLevel.gain.value = 0.4;
  into.connect(echo);
  echo.connect(dark).connect(feedback).connect(echo);
  dark.connect(echoLevel).connect(k.out);

  /* each track's motif and answer, and the loops it rests */
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
    if (pos === 0 && loop > 0 && !plan.rest.has(loop) && Math.random() < 0.2)
      plan.rest.add(loop);
    if (plan.rest.has(loop)) return;
    /* the motif covers this bar and the next; never past the end of the track */
    const room = Math.min(2, role.left) * 8;
    const motif = realize(pos === 0 ? plan.call : plan.reply, [
      rootAt(clock, n),
      rootAt(clock, n + 1),
    ]);
    const base = leadBase(role.track);
    for (const note of motif) {
      if (note.at >= room) break;
      chipNote(
        k,
        into,
        { duty: role.track.duty },
        degree(role.track, note.deg, base),
        stepTime(at, note.at * 2),
        Math.min(note.len, room - note.at) * 2 * STEP_S * 0.8,
        0.04
      );
    }
  });
}

/* ---- cues: the console's own jingles for the game's moments (music/cues.ts) ---- */

/* chip notes in a row, `each` seconds apart, each sounding `hold` of that */
function jingle(
  k: Kit,
  into: AudioNode,
  notes: number[],
  at: number,
  each: number,
  duty: number,
  level: number,
  hold = 0.8
) {
  notes.forEach((m, i) =>
    chipNote(k, into, { duty }, m, at + i * each, each * hold, level)
  );
}

/* the console's own voice for the commonest effects (music/sfx.ts) */
const CHIP_SFX: Station["sfx"] = {
  /* a click: a blip on a note of the chord */
  click: c => {
    chipNote(c.k, c.k.out, { duty: 0.5 }, pickOf(chordIn(c, 79)), c.at, 0.03, 0.045);
    return 0.1;
  },
  /* a ding: the coin */
  ding: c => {
    const top = rootIn(c, 81);
    chipNote(c.k, c.k.out, { duty: 0.25 }, top - 5, c.at, 0.055, 0.045);
    chipNote(c.k, c.k.out, { duty: 0.25 }, top, c.at + 0.06, 0.25, 0.045);
    return 0.4;
  },
  /* the news: a two-blip message */
  news: c => {
    const [a, , b] = chordIn(c, 79);
    chipNote(c.k, c.k.out, { duty: 0.5 }, a, c.at, 0.06, 0.04);
    chipNote(c.k, c.k.out, { duty: 0.5 }, b ?? a + 7, c.at + 0.08, 0.06, 0.04);
    return 0.25;
  },
};

const CHIP_CUES: Station["cues"] = {
  /* a news card: a two-blip "message" */
  news: c => {
    const into = soft(c.k, 6000);
    const [a, , b] = chordIn(c, 79);
    jingle(c.k, into, [a, b ?? a + 7], c.at, c.beat / 4, 0.5, 0.035);
    return c.beat / 2 + 0.2;
  },
  /* Elise found something: the coin, a fifth below the root and then the root,
     held */
  discovery: c => {
    const into = soft(c.k, 6000);
    const top = rootIn(c, 81);
    chipNote(c.k, into, { duty: 0.25 }, top - 5, c.at, (c.beat / 4) * 0.9, 0.04);
    chipNote(c.k, into, { duty: 0.25 }, top, c.at + c.beat / 4, 0.5, 0.04);
    return c.beat / 4 + 0.6;
  },
  /* a new model: a sparkle up the chord two octaves and back down, very fast */
  newModel: c => {
    const into = soft(c.k, 6000);
    const [a, b, t] = chordIn(c, 72);
    const run = [a, b, t, a + 12, b + 12, t + 12, a + 24, t + 12, b + 12, a + 12];
    jingle(c.k, into, run, c.at, c.beat / 8, 0.125, 0.03);
    return (run.length * c.beat) / 8 + 0.2;
  },
  /* a new GPU type: the 1-up, up the chord, with the console's echo after it */
  unlock: c => {
    const into = soft(c.k, 6000);
    const [a, b, t] = chordIn(c, 72);
    const up = [a, b, t, a + 12, b + 12, t + 12];
    jingle(c.k, into, up, c.at, c.beat / 4, 0.5, 0.035);
    jingle(c.k, into, up, c.at + (3 * c.beat) / 4, c.beat / 4, 0.5, 0.012);
    return (9 * c.beat) / 4 + 0.2;
  },
};

export const OVERCLOCK: Station = {
  id: "overclock",
  name: "Overclock",
  blurb: "bright 8-bit tunes, full speed ahead",
  beat: 4 * STEP_S,
  harmony: (clock, t) => {
    const n = Math.floor((t - clock.t0) / BAR_S + 1e-6);
    const track = barRole(clock, n).track;
    const root = rootAt(clock, n);
    return { root: bassRoot(track, root), notes: arpNotes(track, root) };
  },
  cues: CHIP_CUES,
  acoustics: "crunch",
  sfx: CHIP_SFX,
  layers: [
    { name: "arpeggio", wet: 0.2, build: arpeggio },
    { name: "drums", wet: 0.05, build: drums },
    { name: "bass", wet: 0, build: bass },
    { name: "lead", wet: 0.25, build: lead },
  ],
};
