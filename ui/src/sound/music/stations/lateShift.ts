/*
  LATE SHIFT: lo-fi beats for the night shift in the server room, at a slow, swung
  80 bpm, one chord a bar.

    1  keys & vinyl  a soft electric piano, its chords gently rolled and struck in
                     a few different rhythms, through a warbling old tape, over the
                     crackle and hiss of a record
    2  beat          a lazy boom-bap: a soft kick, a snare a hair behind the beat,
                     swung hats, and a little fill before every change
    3  bass          a round bass on each chord's root, now and then walking into
                     the next chord
    4  melody        a few mellow notes now and then, from the track's pentatonic
                     scale, often repeated

  The station plays a set of TRACKS, each its own four-chord loop in its own key
  with its own groove: which kicks, where the snare falls, how the piano comps, how
  often the bass walks, how much the melody rests. It stays on one for three to six
  times round its loop (about half a minute to a minute and a quarter), then morphs
  into another, never one of the last two: the bar before the change is a drum fill,
  the bass walks into the new track's first chord, the new track lands with a kick
  and an open hat, and the melody starts a fresh phrase in the new scale. Each time
  the station comes on air it starts on a track at random. The song (which track
  plays when) is kept per Clock, so all four layers follow the same one.

  Every layer lines up on the station's bar lines, so a layer that joins waits for
  the next bar and comes in on the downbeat. What each bar plays is decided by the
  pure functions under "the song" and "what each bar plays"; the rest turns those
  plans into sound. Nothing slides in pitch.
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
import { createSong } from "../song";

/* every second sixteenth is pushed this share of a step late: the lazy swing */
const SWING = 0.22;
/* 80 bpm, in swung sixteenths (music/bars.ts) */
const { STEP_S, BAR_S, stepTime, bars } = barClock(80, SWING);
/* the snare sits this far behind the beat */
const SNARE_LATE_S = 0.012;
/* how many times round its loop a track plays before the next one */
const LOOPS = [3, 4, 4, 5, 6];

/* ---- the tracks ---- */

/* root is the bass note; keys are the piano's four notes, rootless and close, so
   they sit soft in the middle */
export type Chord = { name: string; root: number; keys: number[] };
export type Track = {
  name: string;
  chords: Chord[];
  /* the melody's pentatonic scale, and the indices into it a phrase may end on */
  scale: number[];
  restOn: number[];
  /* kick patterns and the snare's steps, in sixteenths */
  kicks: number[][];
  snares: number[];
  /* where the piano strikes in a bar: the first strike full, any later softer */
  comps: number[][];
  /* the chance the bass walks into the next chord */
  walk: number;
  /* bars of rest between melody phrases */
  rests: number[];
};

const BOOM_BAP = [
  [0, 10],
  [0, 10],
  [0, 7, 10],
  [0, 3, 10],
  [0, 10, 13],
];
const BACKBEAT = [4, 12];

export const TRACKS: Track[] = [
  {
    /* IV iii ii I in C, falling */
    name: "Falling",
    chords: [
      { name: "Fmaj9", root: 41, keys: [57, 60, 64, 67] },
      { name: "Em7", root: 40, keys: [55, 59, 62, 64] },
      { name: "Dm9", root: 38, keys: [53, 57, 60, 64] },
      { name: "Cmaj9", root: 36, keys: [52, 55, 59, 62] },
    ],
    /* C major pentatonic, C5 D5 E5 G5 A5 C6; anything but the D */
    scale: [72, 74, 76, 79, 81, 84],
    restOn: [0, 2, 3, 4, 5],
    kicks: BOOM_BAP,
    snares: BACKBEAT,
    comps: [[0], [0], [0, 10], [0, 6], [0, 14], [0, 7, 10]],
    walk: 0.35,
    rests: [1, 2, 2, 3],
  },
  {
    /* ii V I vi in F, a little bouncier */
    name: "Rain Check",
    chords: [
      { name: "Gm9", root: 43, keys: [57, 58, 62, 65] },
      { name: "C9", root: 36, keys: [52, 55, 58, 62] },
      { name: "Fmaj9", root: 41, keys: [57, 60, 64, 67] },
      { name: "Dm9", root: 38, keys: [53, 57, 60, 64] },
    ],
    /* F major pentatonic, C5 D5 F5 G5 A5 C6; settles on C, F or A */
    scale: [72, 74, 77, 79, 81, 84],
    restOn: [0, 2, 4, 5],
    kicks: [
      [0, 7, 10],
      [0, 6, 10],
      [0, 10, 11],
      [0, 10],
    ],
    snares: BACKBEAT,
    comps: [
      [0, 6, 10],
      [0, 3, 10],
      [0, 10],
      [0, 10, 14],
    ],
    walk: 0.5,
    rests: [1, 1, 2, 2],
  },
  {
    /* i VI iv v in A minor, half time: the snare once a bar, on three */
    name: "Overcast",
    chords: [
      { name: "Am9", root: 45, keys: [52, 55, 59, 60] },
      { name: "Fmaj9", root: 41, keys: [52, 55, 57, 60] },
      { name: "Dm9", root: 38, keys: [53, 57, 60, 64] },
      { name: "Em7", root: 40, keys: [55, 59, 62, 64] },
    ],
    /* A minor pentatonic (the same notes as C's); settles on C, E or A */
    scale: [72, 74, 76, 79, 81, 84],
    restOn: [0, 2, 4, 5],
    kicks: [[0], [0, 11], [0, 14], [0, 3]],
    snares: [8],
    comps: [[0], [0, 8], [0]],
    walk: 0.2,
    rests: [2, 3, 3],
  },
  {
    /* I vi ii V in C, the classic turnaround */
    name: "Back Booth",
    chords: [
      { name: "Cmaj9", root: 36, keys: [52, 55, 59, 62] },
      { name: "Am9", root: 45, keys: [52, 55, 59, 60] },
      { name: "Dm9", root: 38, keys: [53, 57, 60, 64] },
      { name: "G13", root: 43, keys: [53, 57, 59, 64] },
    ],
    scale: [72, 74, 76, 79, 81, 84],
    restOn: [0, 2, 3, 4, 5],
    kicks: BOOM_BAP,
    snares: BACKBEAT,
    comps: [[0, 10], [0, 7, 10], [0, 2, 10], [0]],
    walk: 0.45,
    rests: [1, 2, 2, 3],
  },
  {
    /* IV iii ii I in B flat, a step down from C and a shade warmer */
    name: "Last Train",
    chords: [
      { name: "Ebmaj9", root: 39, keys: [55, 58, 62, 65] },
      { name: "Dm7", root: 38, keys: [53, 57, 60, 62] },
      { name: "Cm9", root: 36, keys: [51, 55, 58, 62] },
      { name: "Bbmaj9", root: 46, keys: [50, 53, 57, 60] },
    ],
    /* B flat major pentatonic, Bb4 C5 D5 F5 G5 Bb5; settles on Bb, D or F */
    scale: [70, 72, 74, 77, 79, 82],
    restOn: [0, 2, 3, 5],
    kicks: [
      [0, 10],
      [0, 8, 10],
      [0, 3, 10],
      [0, 10],
    ],
    snares: BACKBEAT,
    comps: [[0], [0, 14], [0, 6], [0, 10]],
    walk: 0.3,
    rests: [1, 2, 2, 3],
  },
];

/* ---- the song: which track plays at which bar (music/song.ts) ---- */

export const { sectionAt, barRole } = createSong(
  TRACKS,
  t => pickOf(LOOPS) * t.chords.length
);
export function chordAt(clock: Clock, n: number): Chord {
  const s = sectionAt(clock, n);
  return s.track.chords[(n - s.start) % s.track.chords.length];
}

/* ---- what each bar plays (pure, so it can be read and tested on its own) ---- */

export function keysBar(track: Track): number[] {
  return pickOf(track.comps);
}

export type Hit = {
  step: number;
  kind: "kick" | "snare" | "hat" | "open";
  vel: number;
};
/* A bar of drums on `track`. A fill bar drops the kick in its second half for a
   run of snares; the first bar of a new track lands with a full kick and an open
   hat on the one. */
export function drumBar(track: Track, fill: boolean, lands: boolean): Hit[] {
  const hits: Hit[] = [];
  for (const step of pickOf(track.kicks)) {
    if (fill && step > 8) continue;
    hits.push({ step, kind: "kick", vel: step ? 0.8 : 1 });
  }
  for (const step of track.snares) hits.push({ step, kind: "snare", vel: 1 });
  if (fill) {
    hits.push(
      { step: 13, kind: "snare", vel: 0.35 },
      { step: 14, kind: "snare", vel: 0.5 },
      { step: 15, kind: "snare", vel: 0.65 }
    );
  } else if (Math.random() < 0.2) {
    hits.push({ step: 15, kind: "snare", vel: 0.3 });
  }
  for (let step = 0; step < 16; step++) {
    if (step % 2 === 0) {
      const open =
        (step === 0 && lands) || (step === 14 && !fill && Math.random() < 0.25);
      hits.push({
        step,
        kind: open ? "open" : "hat",
        vel: (step % 4 === 0 ? 0.8 : 0.55) * rand(0.85, 1.1),
      });
    } else if (Math.random() < 0.06) {
      hits.push({ step, kind: "hat", vel: 0.35 * rand(0.85, 1.1) });
    }
  }
  return hits;
}

export type Note = { step: number; len: number; midi: number; vel: number };
/* The root on the one, the root, fifth or octave on the and-of-three, and now and
   then a walk-up note into the next chord's root. Into a new track it always
   walks, so the bass leads the way across. */
export function bassBar(
  chord: Chord,
  next: Chord,
  walkChance: number,
  changing: boolean
): Note[] {
  const root = chord.root;
  const walk = changing || Math.random() < walkChance;
  const notes: Note[] = [
    { step: 0, len: 6, midi: root, vel: 1 },
    {
      step: 10,
      len: walk ? 3 : 5,
      midi: pickOf([root, root, root + 7, root + 12]),
      vel: 0.8,
    },
  ];
  if (walk)
    notes.push({ step: 14, len: 2, midi: next.root + pickOf([-1, 1, 2]), vel: 0.7 });
  return notes;
}

/* A melody phrase: notes counted in eighths from its start, each one to three
   eighths long, mostly stepping to a neighbouring note of the track's scale,
   ending on a resting note, and never longer than two bars. `note` indexes the
   track's scale. */
export type Phrase = { at: number; len: number; note: number }[];
function settle(phrase: Phrase, track: Track) {
  const end = phrase[phrase.length - 1];
  end.note = track.restOn.reduce((best, r) =>
    Math.abs(r - end.note) < Math.abs(best - end.note) ? r : best
  );
}
export function compose(track: Track): Phrase {
  const top = track.scale.length - 1;
  const n = 2 + Math.floor(Math.random() * 4);
  const phrase: Phrase = [];
  let at = pickOf([0, 0, 2]);
  let i = pickOf([2, 3, 4]);
  for (let j = 0; j < n && at < 15; j++) {
    const len = Math.min(pickOf([1, 1, 2, 2, 3]), 16 - at);
    phrase.push({ at, len, note: i });
    at += len + (Math.random() < 0.2 ? 1 : 0);
    const leap = Math.random() < 0.2 ? 2 : 1;
    i = Math.max(0, Math.min(top, i + (Math.random() < 0.5 ? -leap : leap)));
  }
  settle(phrase, track);
  return phrase;
}
/* the same phrase with a different last note */
export function vary(phrase: Phrase, track: Track): Phrase {
  const next = phrase.map(p => ({ ...p }));
  const end = next[next.length - 1];
  const others = track.restOn.filter(
    r => r !== end.note && Math.abs(r - end.note) <= 2
  );
  if (others.length) end.note = pickOf(others);
  return next;
}

/* ---- sound ---- */

/* A gentle tanh curve: rounds off peaks the way an old tape does. Divided by the
   drive, so quiet signals pass at the same level and only loud ones are squeezed. */
const DRIVE = 1.6;
const SOFT_CLIP = (() => {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(DRIVE * x) / DRIVE;
  }
  return curve;
})();

/* An old tape machine: pitch that slowly wanders (a short delay whose time
   drifts), rolled-off highs above `tone` Hz, and a little soft saturation.
   Returns the node to play into. */
function tape(k: Kit, tone: number, wow: number): AudioNode {
  const { ac } = k;
  const input = k.keep(ac.createGain());
  const drift = k.keep(ac.createDelay(0.1));
  drift.delayTime.value = 0.012;
  k.lfo(0.45, wow, drift.delayTime);
  const roll = k.keep(ac.createBiquadFilter());
  roll.type = "lowpass";
  roll.frequency.value = tone;
  roll.Q.value = 0.5;
  const warm = k.keep(ac.createWaveShaper());
  warm.curve = SOFT_CLIP;
  input.connect(drift).connect(roll).connect(warm).connect(k.out);
  return input;
}

/* A record's surface: sparse pops of random size over a faint hiss, on a loop
   three seconds long. About five pops a second, mostly small. */
function crackleBuffer(ac: AudioContext) {
  const n = ac.sampleRate * 3;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    data[i] += (Math.random() * 2 - 1) * 0.02;
    if (Math.random() < 0.0001) {
      const size = 0.35 * Math.random() ** 3 + 0.03;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const len = 20 + Math.floor(Math.random() * 60);
      for (let j = 0; j < len && i + j < n; j++)
        data[i + j] +=
          sign * size * Math.exp((-4 * j) / len) * (Math.random() * 0.6 + 0.4);
    }
  }
  return buf;
}

/* 1  Keys and vinyl. Each piano note is a little FM electric piano: a sine whose
   brightness (the modulation) fades fast, so it starts with a soft bell and
   settles into a round tone, with a faint high tine on the attack. */
function keys(k: Kit): Book {
  const { ac, clock } = k;
  const into = tape(k, 2400, 0.0012);

  const vinyl = ac.createBufferSource();
  vinyl.buffer = crackleBuffer(ac);
  vinyl.loop = true;
  /* the crackle kept between 800 Hz and 3.5 kHz, so its pops are soft and dull
     rather than sharp ticks */
  const surface = k.keep(ac.createBiquadFilter());
  surface.type = "highpass";
  surface.frequency.value = 800;
  const dull = k.keep(ac.createBiquadFilter());
  dull.type = "lowpass";
  dull.frequency.value = 3500;
  const level = k.keep(ac.createGain());
  level.gain.value = 0.3;
  vinyl.connect(surface).connect(dull).connect(level).connect(k.out);
  k.run(vinyl);

  const note = (midi: number, at: number, len: number, vel: number) => {
    const f = hz(midi);
    const end = at + len + 0.8;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vel, at + 0.006);
    env.gain.setTargetAtTime(vel * 0.4, at + 0.006, 0.5);
    env.gain.setTargetAtTime(0, at + len, 0.12);
    env.connect(into);
    const body = ac.createOscillator();
    body.frequency.value = f;
    const mod = ac.createOscillator();
    mod.frequency.value = f;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(f * 1.1, at);
    depth.gain.setTargetAtTime(f * 0.15, at, 0.25);
    mod.connect(depth).connect(body.frequency);
    /* the tine is only a hint of bell: quiet, and fading slowly enough to ring
       rather than tick, since every chord rolls four of them */
    const tine = ac.createOscillator();
    tine.frequency.value = f * 4;
    const tineLevel = ac.createGain();
    tineLevel.gain.setValueAtTime(0.03, at);
    tineLevel.gain.setTargetAtTime(0, at, 0.15);
    body.connect(env);
    tine.connect(tineLevel).connect(env);
    k.once(body, at, end, env);
    k.once(mod, at, end, depth);
    k.once(tine, at, end, tineLevel);
  };

  return bars(k, (n, at) => {
    const chord = chordAt(clock, n);
    const strikes = keysBar(barRole(clock, n).track);
    strikes.forEach((step, s) => {
      const t = stepTime(at, step);
      const next = s + 1 < strikes.length ? stepTime(at, strikes[s + 1]) : at + BAR_S;
      const len = Math.max(0.15, next - t - 0.03);
      const vel = (s ? 0.028 : 0.04) * rand(0.85, 1.1);
      /* rolled: each note a few milliseconds after the one under it */
      let roll = t;
      for (const m of chord.keys) {
        note(m, roll, len, vel);
        roll += rand(0.012, 0.022);
      }
    });
  });
}

/* 2  The beat: kick, snare and hats, all synthesized, through a darker, slightly
   saturated drum bus. */
function beat(k: Kit): Book {
  const { ac, clock } = k;
  const roll = k.keep(ac.createBiquadFilter());
  roll.type = "lowpass";
  roll.frequency.value = 5500;
  const warm = k.keep(ac.createWaveShaper());
  warm.curve = SOFT_CLIP;
  roll.connect(warm).connect(k.out);

  const kick = (at: number, vel: number) => {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(46, at + 0.11);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.42 * vel, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    o.connect(env).connect(roll);
    k.once(o, at, at + 0.45, env);
  };
  const snare = (at: number, vel: number) => {
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1900;
    band.Q.value = 0.7;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.16 * vel, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    band.connect(env).connect(roll);
    noiseHit(k, at, at + 0.22, band, env);
    const body = ac.createOscillator();
    body.type = "triangle";
    body.frequency.value = 185;
    const thump = ac.createGain();
    thump.gain.setValueAtTime(0, at);
    thump.gain.linearRampToValueAtTime(0.09 * vel, at + 0.002);
    thump.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    body.connect(thump).connect(roll);
    k.once(body, at, at + 0.12, thump);
  };
  /* A soft "tss": noise in a band around 5 kHz, under the drum bus's roll-off, so
     the hat's body comes through rather than only its attack (a band above the
     roll-off left little but a click), eased in over 2 ms. */
  const hat = (at: number, vel: number, open: boolean) => {
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 5000;
    band.Q.value = 0.9;
    const env = ac.createGain();
    const decay = open ? 0.28 : 0.06;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.03 * vel, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    band.connect(env).connect(roll);
    noiseHit(k, at, at + decay + 0.02, band, env);
  };

  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    for (const h of drumBar(role.track, role.fill, role.lands)) {
      const t = stepTime(at, h.step);
      if (h.kind === "kick") kick(t, h.vel);
      else if (h.kind === "snare") snare(t + SNARE_LATE_S, h.vel);
      else hat(t + rand(-0.006, 0.006), h.vel, h.kind === "open");
    }
  });
}

/* 3  The bass: a sine with a little triangle on top for its edge, low-passed
   round. */
function bass(k: Kit): Book {
  const { ac, clock } = k;
  const tone = k.keep(ac.createBiquadFilter());
  tone.type = "lowpass";
  tone.frequency.value = 520;
  tone.Q.value = 0.7;
  tone.connect(k.out);

  const note = (midi: number, at: number, len: number, vel: number) => {
    const f = hz(midi);
    const peak = 0.26 * vel;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.008);
    env.gain.setTargetAtTime(peak * 0.7, at + 0.008, 0.3);
    env.gain.setTargetAtTime(0, at + len, 0.04);
    env.connect(tone);
    const end = at + len + 0.3;
    const sub = ac.createOscillator();
    sub.frequency.value = f;
    sub.connect(env);
    k.once(sub, at, end, env);
    const edge = ac.createOscillator();
    edge.type = "triangle";
    edge.frequency.value = f;
    const edgeLevel = ac.createGain();
    edgeLevel.gain.value = 0.25;
    edge.connect(edgeLevel).connect(env);
    k.once(edge, at, end, edgeLevel);
  };

  return bars(k, (n, at) => {
    const role = barRole(clock, n);
    const plan = bassBar(
      chordAt(clock, n),
      chordAt(clock, n + 1),
      role.track.walk,
      role.left === 1
    );
    for (const b of plan)
      note(b.midi, stepTime(at, b.step), b.len * STEP_S - 0.02, b.vel);
  });
}

/* 4  The melody: a soft triangle with a quiet octave, through its own warbly tape
   and a dotted-eighth echo. A phrase, then a track's worth of rest; like the Tide
   Pool tune it likes to repeat itself, or come back with a new ending. A phrase
   never runs over into a new track: it is cut at the change, and the new track
   starts its own. */
function melody(k: Kit): Book {
  const { ac, clock } = k;
  const into = tape(k, 1900, 0.0015);
  const echo = k.keep(ac.createDelay(2));
  echo.delayTime.value = 3 * STEP_S;
  const dark = k.keep(ac.createBiquadFilter());
  dark.type = "lowpass";
  dark.frequency.value = 1500;
  const feedback = k.keep(ac.createGain());
  feedback.gain.value = 0.3;
  const echoLevel = k.keep(ac.createGain());
  echoLevel.gain.value = 0.45;
  into.connect(echo);
  echo.connect(dark).connect(feedback).connect(echo);
  dark.connect(echoLevel).connect(k.out);

  const note = (midi: number, at: number, len: number, vel: number) => {
    const f = hz(midi);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vel, at + 0.03);
    env.gain.setTargetAtTime(vel * 0.6, at + 0.03, 0.3);
    env.gain.setTargetAtTime(0, at + len, 0.08);
    env.connect(into);
    const end = at + len + 0.6;
    const lead = ac.createOscillator();
    lead.type = "triangle";
    lead.frequency.value = f;
    lead.connect(env);
    k.once(lead, at, end, env);
    const air = ac.createOscillator();
    air.frequency.value = f * 2;
    const airLevel = ac.createGain();
    airLevel.gain.value = 0.12;
    air.connect(airLevel).connect(env);
    k.once(air, at, end, airLevel);
  };

  let phrase: Phrase = [];
  let phraseTrack: Track | null = null;
  /* the first phrase waits two bars after the melody joins */
  let wait = -1;
  return bars(k, (n, at) => {
    if (wait < 0) wait = n + 2;
    const role = barRole(clock, n);
    /* a new track brings a new phrase on its first bar */
    if (n < wait && !(role.lands && phraseTrack && phraseTrack !== role.track)) return;
    const track = role.track;
    const r = Math.random();
    if (!phrase.length || phraseTrack !== track || r < 0.3) phrase = compose(track);
    else if (r < 0.6) phrase = vary(phrase, track);
    phraseTrack = track;
    /* only as many eighths as the track has left */
    const room = role.left * 8;
    for (const p of phrase) {
      if (p.at >= room) break;
      const len = Math.min(p.len, room - p.at);
      /* eighths are two sixteenths; the off-beat ones lean late too */
      const t = stepTime(at, p.at * 2) + (p.at % 2 ? SWING * STEP_S : 0);
      note(track.scale[p.note], t, len * 2 * STEP_S - 0.04, 0.05 * rand(0.9, 1.1));
    }
    const used = Math.ceil((phrase[phrase.length - 1].at + 1) / 8);
    wait = n + Math.max(1, used) + pickOf(track.rests);
  });
}

/* ---- cues: the station's own voice for the game's moments (music/cues.ts) ---- */

/* The keys layer's electric piano, on its own: a sine whose brightness fades
   fast, with a faint tine, through its own dark, slightly warbling tape. */
function rhodes(
  k: Kit,
  into: AudioNode,
  midi: number,
  at: number,
  len: number,
  vel: number
) {
  const { ac } = k;
  const f = hz(midi);
  const end = at + len + 0.8;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(vel, at + 0.006);
  env.gain.setTargetAtTime(vel * 0.4, at + 0.006, 0.5);
  env.gain.setTargetAtTime(0, at + len, 0.12);
  env.connect(into);
  const body = ac.createOscillator();
  body.frequency.value = f;
  const mod = ac.createOscillator();
  mod.frequency.value = f;
  const depth = ac.createGain();
  depth.gain.setValueAtTime(f * 1.1, at);
  depth.gain.setTargetAtTime(f * 0.15, at, 0.25);
  mod.connect(depth).connect(body.frequency);
  const tine = ac.createOscillator();
  tine.frequency.value = f * 4;
  const tineLevel = ac.createGain();
  tineLevel.gain.setValueAtTime(0.03, at);
  tineLevel.gain.setTargetAtTime(0, at, 0.15);
  body.connect(env);
  tine.connect(tineLevel).connect(env);
  k.once(body, at, end, env);
  k.once(mod, at, end, depth);
  k.once(tine, at, end, tineLevel);
}
/* a chord rolled from the bottom, a few milliseconds a note */
function rolled(
  k: Kit,
  into: AudioNode,
  notes: number[],
  at: number,
  len: number,
  vel: number
) {
  notes.forEach((m, i) => rhodes(k, into, m, at + i * rand(0.014, 0.022), len, vel));
}

/* the station's own voice for the commonest effects (music/sfx.ts) */
const LATE_SFX: Station["sfx"] = {
  /* a click: a short, soft tap of a key in the chord */
  click: c => {
    rhodes(c.k, c.k.out, pickOf(chordIn(c, 67)), c.at, 0.08, 0.05);
    return 0.95;
  },
  /* a ding: the chord's top note, left to ring a little */
  ding: c => {
    const notes = chordIn(c, 72);
    rhodes(c.k, c.k.out, notes[notes.length - 1], c.at, 0.45, 0.065);
    return 1.3;
  },
  /* the news: two notes of the chord, rolled */
  news: c => {
    const [a, , b] = chordIn(c, 67);
    rolled(c.k, c.k.out, [a, b ?? a + 7], c.at, 0.6, 0.055);
    return 1.5;
  },
};

const LATE_CUES: Station["cues"] = {
  /* a news card: two notes of the chord, rolled, ringing a beat and a half */
  news: c => {
    const into = tape(c.k, 2400, 0.0012);
    const [a, , b] = chordIn(c, 64);
    rolled(c.k, into, [a, b ?? a + 7], c.at, c.beat * 1.5, 0.05);
    return c.beat * 1.5 + 1;
  },
  /* Elise found something: a little lick up the chord, ending on the octave */
  discovery: c => {
    const into = tape(c.k, 2400, 0.0012);
    const notes = chordIn(c, 67);
    [...notes.slice(0, 3), notes[0] + 12].forEach((m, i) =>
      rhodes(
        c.k,
        into,
        m,
        c.at + (i * c.beat) / 2,
        c.beat * (i === 3 ? 1.5 : 0.45),
        0.045
      )
    );
    return c.beat * 3 + 1;
  },
  /* a new model: the whole chord, an octave up, rolled and left to ring */
  newModel: c => {
    const into = tape(c.k, 2400, 0.0012);
    const notes = chordIn(c, 60);
    rolled(c.k, into, [...notes, notes[0] + 12], c.at, c.beat * 2, 0.04);
    return c.beat * 2 + 1.2;
  },
  /* a new GPU type: the root and its octave, then the chord on the and */
  unlock: c => {
    const into = tape(c.k, 2400, 0.0012);
    const r = rootIn(c, 60);
    rolled(c.k, into, [r, r + 12], c.at, c.beat * 0.45, 0.05);
    rolled(c.k, into, chordIn(c, 64), c.at + c.beat / 2, c.beat * 1.5, 0.042);
    return c.beat * 2 + 1;
  },
};

export const LATE_SHIFT: Station = {
  id: "late-shift",
  name: "Late Shift",
  blurb: "lo-fi beats to rent GPUs to",
  beat: 4 * STEP_S,
  harmony: (clock, t) => {
    const c = chordAt(clock, Math.floor((t - clock.t0) / BAR_S + 1e-6));
    return { root: c.root, notes: c.keys };
  },
  cues: LATE_CUES,
  acoustics: "tape",
  sfx: LATE_SFX,
  layers: [
    { name: "keys & vinyl", wet: 0.35, build: keys },
    { name: "beat", wet: 0.12, build: beat },
    { name: "bass", wet: 0, build: bass },
    { name: "melody", wet: 0.5, build: melody },
  ],
};
