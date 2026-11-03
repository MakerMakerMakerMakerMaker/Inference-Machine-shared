/*
  TIDE POOL: one slow, underwater drone in D, in the spirit of a Nintendo water
  level.

    1  deep     a low D under its fifth, breathing very slowly: the floor of the pool
    2  current  a soft, filtered pad that drifts between two chords, D add9 and
                G major 7 over the same D, gliding from one to the other, and a
                tune: a few short, plucked notes now and then, often repeated
    3  glass    one chord tone at a time, swelling in and fading out a few seconds
                apart, with a watery echo
    4  surface  a faint high shimmer, a wash of filtered noise that rises and falls
                like waves, and the odd bubble
*/
import {
  both,
  hz,
  pickOf,
  rand,
  type Book,
  type Clock,
  type Kit,
  type Station,
} from "../kit";
import { chordIn, rootIn } from "../cues";

/* seconds on each chord, and the time constant of the glide between them */
const CHORD_S = 20;
const GLIDE_S = 1.6;
/* the tune's tempo, a slow 80 bpm, counted in eighth notes and four-beat bars */
const EIGHTH_S = 60 / 80 / 2;
const BAR_S = 8 * EIGHTH_S;

/* The pad's four voices and the glass layer's notes, for each chord. Over the D
   drone the second one reads as the IV chord, floating. */
const CHORDS = [
  /* D add9: F#3 A3 D4 E4, and D5 E5 F#5 A5 above */
  { pad: [54, 57, 62, 64], glass: [74, 76, 78, 81] },
  /* G major 7 over D: G3 B3 D4 F#4, and D5 F#5 G5 B5 above */
  { pad: [55, 59, 62, 66], glass: [74, 78, 79, 83] },
];

/* The tune keeps to D major pentatonic, D5 E5 F#5 A5 B5 D6, which sits well over
   both chords. A phrase ends on one of REST_ON (D5, F#5, A5, D6), so it always
   sounds settled. */
const SCALE = [74, 76, 78, 81, 83, 86];
const REST_ON = [0, 2, 3, 5];

function chordAt(clock: Clock, t: number) {
  const i = Math.floor((t - clock.t0) / CHORD_S);
  return CHORDS[((i % CHORDS.length) + CHORDS.length) % CHORDS.length];
}
/* the first chord change after t */
function nextChange(clock: Clock, t: number) {
  return clock.t0 + (Math.floor((t - clock.t0) / CHORD_S) + 1) * CHORD_S;
}
/* the first bar line at or after t */
function nextBar(clock: Clock, t: number) {
  return clock.t0 + Math.ceil((t - clock.t0) / BAR_S) * BAR_S;
}

/* 1  The floor: a low D and its fifth, with a D an octave up split into two
   slightly detuned voices so it slowly beats, all breathing in and out. */
function deep(k: Kit): Book {
  const { ac } = k;
  const tone = k.keep(ac.createBiquadFilter());
  tone.type = "lowpass";
  tone.frequency.value = 420;
  tone.Q.value = 0.3;
  const breath = k.keep(ac.createGain());
  breath.gain.value = 0.75;
  tone.connect(breath).connect(k.out);
  k.lfo(0.045, 0.25, breath.gain);
  k.osc("sine", hz(38), 0.3, tone);
  k.osc("sine", hz(45), 0.09, tone);
  k.osc("triangle", hz(50), 0.06, tone, 4);
  k.osc("triangle", hz(50), 0.06, tone, -4);
  return null;
}

/* 2a  The current: four pad voices, each two soft detuned triangles, under a
   low-pass that slowly opens and closes. Every CHORD_S the voices glide to the
   other chord; only the ones that change move. */
function current(k: Kit): Book {
  const { ac, clock } = k;
  const now = ac.currentTime;
  const filter = k.keep(ac.createBiquadFilter());
  filter.type = "lowpass";
  filter.frequency.value = 650;
  filter.Q.value = 0.7;
  filter.connect(k.out);
  k.lfo(0.035, 260, filter.frequency);
  const voices = chordAt(clock, now).pad.map(m => [
    k.osc("triangle", hz(m), 0.03, filter, -7),
    k.osc("triangle", hz(m), 0.03, filter, 7),
  ]);
  let change = nextChange(clock, now);
  return until => {
    while (change <= until) {
      const pad = chordAt(clock, change).pad;
      voices.forEach((pair, i) =>
        pair.forEach(o => o.frequency.setTargetAtTime(hz(pad[i]), change, GLIDE_S))
      );
      change += CHORD_S;
    }
  };
}

/* 2b  The tune: a short phrase of three to five plucked notes on the eighth-note
   grid, mostly stepping to a neighbouring note of the scale, then two to four bars
   of rest. Like a game tune it likes to repeat itself: the next phrase is often
   the same one again, or the same with a different ending, and only sometimes a
   new one. Every note is short and dry, so it sits on top of the drones as a few
   bright drops. */
type Phrase = { step: number; note: number }[];

/* a new phrase: index into SCALE, walking mostly by step, ending on REST_ON */
function compose(): Phrase {
  const n = 3 + Math.floor(Math.random() * 3);
  let at = 0;
  let i = pickOf([1, 2, 3]);
  const phrase: Phrase = [];
  for (let j = 0; j < n; j++) {
    phrase.push({ step: at, note: i });
    at += Math.random() < 0.75 ? 1 : 2;
    const leap = Math.random() < 0.2 ? 2 : 1;
    i = Math.max(
      0,
      Math.min(SCALE.length - 1, i + (Math.random() < 0.5 ? -leap : leap))
    );
  }
  settle(phrase);
  return phrase;
}

/* the last note moved to the nearest resting note */
function settle(phrase: Phrase) {
  const end = phrase[phrase.length - 1];
  end.note = REST_ON.reduce((best, r) =>
    Math.abs(r - end.note) < Math.abs(best - end.note) ? r : best
  );
}

/* the same phrase with a different ending */
function vary(phrase: Phrase): Phrase {
  const next = phrase.map(p => ({ ...p }));
  const end = next[next.length - 1];
  const others = REST_ON.filter(r => r !== end.note && Math.abs(r - end.note) <= 2);
  if (others.length) end.note = pickOf(others);
  return next;
}

function tune(k: Kit): Book {
  const { ac, clock } = k;
  const input = k.keep(ac.createGain());
  input.connect(k.out);
  /* a quiet echo three eighths later, a little darker each time */
  const echo = k.keep(ac.createDelay(2));
  echo.delayTime.value = 3 * EIGHTH_S;
  const dark = k.keep(ac.createBiquadFilter());
  dark.type = "lowpass";
  dark.frequency.value = 1800;
  const feedback = k.keep(ac.createGain());
  feedback.gain.value = 0.25;
  const echoLevel = k.keep(ac.createGain());
  echoLevel.gain.value = 0.5;
  input.connect(echo);
  echo.connect(dark).connect(feedback).connect(echo);
  dark.connect(echoLevel).connect(k.out);

  /* a plucked note: an instant start and gone in about a fifth of a second */
  const pluck = (midi: number, at: number, level: number) => {
    const freq = hz(midi);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    env.connect(input);
    for (const [type, mul, amp] of [
      ["triangle", 1, 1],
      ["sine", 2, 0.15],
    ] as const) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const g = ac.createGain();
      g.gain.value = amp;
      o.connect(g).connect(env);
      k.once(o, at, at + 0.25, g);
    }
    window.setTimeout(() => env.disconnect(), (at - ac.currentTime + 0.5) * 1000);
  };

  let phrase: Phrase = [];
  let next = nextBar(clock, ac.currentTime + 2 * BAR_S);
  return until => {
    /* a phrase whose time passed while the page slept is skipped, not played late */
    if (next < ac.currentTime) next = nextBar(clock, ac.currentTime + BAR_S);
    while (next < until) {
      const r = Math.random();
      if (!phrase.length || r < 0.25) phrase = compose();
      else if (r < 0.55) phrase = vary(phrase);
      phrase.forEach((p, j) =>
        pluck(
          SCALE[p.note],
          next + p.step * EIGHTH_S,
          (j ? 0.055 : 0.065) * rand(0.9, 1.1)
        )
      );
      next += pickOf([2, 2, 3, 3, 4]) * BAR_S;
    }
  };
}

/* 3  Glass: one note of the current chord at a time, never the same twice in a
   row, swelling in over most of a second and fading over six, with a faint
   octave above it and a soft echo that repeats a little darker each time. */
function glass(k: Kit): Book {
  const { ac, clock } = k;
  const input = k.keep(ac.createGain());
  input.connect(k.out);
  const echo = k.keep(ac.createDelay(2));
  echo.delayTime.value = 0.55;
  const dark = k.keep(ac.createBiquadFilter());
  dark.type = "lowpass";
  dark.frequency.value = 2200;
  const feedback = k.keep(ac.createGain());
  feedback.gain.value = 0.38;
  input.connect(echo);
  echo.connect(dark).connect(feedback).connect(echo);
  dark.connect(k.out);

  const ping = (freq: number, at: number) => {
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.05, at + 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 6);
    env.connect(input);
    for (const [mul, level] of [
      [1, 1],
      [2.002, 0.2],
    ]) {
      const o = ac.createOscillator();
      o.frequency.value = freq * mul;
      const amp = ac.createGain();
      amp.gain.value = level;
      o.connect(amp).connect(env);
      k.once(o, at, at + 6.1, amp);
    }
    window.setTimeout(() => env.disconnect(), (at - ac.currentTime + 6.5) * 1000);
  };

  let next = ac.currentTime + 1.5;
  let last = -1;
  return until => {
    while (next < until) {
      const notes = chordAt(clock, next).glass;
      let i = Math.floor(Math.random() * notes.length);
      if (i === last) i = (i + 1) % notes.length;
      last = i;
      ping(hz(notes[i]), next);
      next += rand(3.5, 7.5);
    }
  };
}

/* 4  The surface: two very quiet high tones with their own slow tremolos (light
   on the water), filtered noise that swells and recedes like waves, and now and
   then a little run of bubbles. */
function surface(k: Kit): Book {
  const { ac, g } = k;
  for (const [midi, level, rate] of [
    [86, 0.012, 0.13],
    [93, 0.008, 0.17],
  ]) {
    const trem = k.keep(ac.createGain());
    trem.gain.value = 0.5;
    trem.connect(k.out);
    k.lfo(rate, 0.5, trem.gain);
    k.osc("sine", hz(midi), level, trem);
  }

  const noise = ac.createBufferSource();
  noise.buffer = g.noise;
  noise.loop = true;
  const band = k.keep(ac.createBiquadFilter());
  band.type = "bandpass";
  band.frequency.value = 700;
  band.Q.value = 0.8;
  k.lfo(0.025, 350, band.frequency);
  const waves = k.keep(ac.createGain());
  waves.gain.value = 0.6;
  k.lfo(0.07, 0.4, waves.gain);
  const wash = k.keep(ac.createGain());
  wash.gain.value = 0.035;
  noise.connect(band).connect(waves).connect(wash).connect(k.out);
  k.run(noise);

  const bubble = (at: number) => {
    const o = ac.createOscillator();
    const from = rand(320, 480);
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(from * rand(2.2, 2.8), at + 0.07);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.018, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    o.connect(env).connect(k.out);
    k.once(o, at, at + 0.12);
    window.setTimeout(() => env.disconnect(), (at - ac.currentTime + 0.5) * 1000);
  };

  let next = ac.currentTime + rand(4, 10);
  return until => {
    while (next < until) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bubble(next + i * rand(0.09, 0.16));
      next += rand(7, 16);
    }
  };
}

/* ---- cues: the pool's own voice for the game's moments (music/cues.ts) ---- */

/* A glass note, like the glass layer's: a sine and a faint octave, swelling in
   and ringing a long way out. */
function glassPing(
  k: Kit,
  midi: number,
  at: number,
  level: number,
  swell = 0.12,
  ring = 3
) {
  const { ac } = k;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + swell);
  env.gain.exponentialRampToValueAtTime(0.0001, at + swell + ring);
  env.connect(k.out);
  [1, 2.002].forEach((mul, i) => {
    const o = ac.createOscillator();
    o.frequency.value = hz(midi) * mul;
    const amp = ac.createGain();
    amp.gain.value = i ? 0.2 : 1;
    o.connect(amp).connect(env);
    k.once(o, at, at + swell + ring + 0.05, amp, ...(i ? [] : [env]));
  });
}
/* a bubble, like the surface's: a little blip rising */
function bubble(k: Kit, at: number, level: number) {
  const { ac } = k;
  const o = ac.createOscillator();
  const from = rand(320, 480);
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(from * rand(2.2, 2.8), at + 0.07);
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
  o.connect(env).connect(k.out);
  k.once(o, at, at + 0.12, env);
}
/* a plucked note, like the tune's */
function pluck(k: Kit, midi: number, at: number, level: number) {
  const { ac } = k;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  env.connect(k.out);
  (["triangle", "sine"] as const).forEach((type, i) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi) * (i ? 2 : 1);
    const amp = ac.createGain();
    amp.gain.value = i ? 0.15 : 1;
    o.connect(amp).connect(env);
    k.once(o, at, at + 0.35, amp, ...(i ? [] : [env]));
  });
}

/* a drip: a bubble rising quickly onto a note */
function drip(k: Kit, midi: number, at: number, level: number) {
  const { ac } = k;
  const f = hz(midi);
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(f / 2.5, at);
  o.frequency.exponentialRampToValueAtTime(f, at + 0.04);
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  o.connect(env).connect(k.out);
  k.once(o, at, at + 0.14, env);
}

/* the pool's own voice for the commonest effects (music/sfx.ts) */
const TIDE_SFX: Station["sfx"] = {
  /* a click: a drip onto a note of the chord */
  click: c => {
    drip(c.k, pickOf(chordIn(c, 79)), c.at, 0.06);
    return 0.15;
  },
  /* a ding: a glass note, the chord's top */
  ding: c => {
    const notes = chordIn(c, 79);
    glassPing(c.k, notes[notes.length - 1], c.at, 0.05, 0.01, 1.6);
    return 1.7;
  },
  /* the news: two glass notes, quickly */
  news: c => {
    const [a, , b] = chordIn(c, 74);
    glassPing(c.k, a, c.at, 0.045, 0.01, 1.8);
    glassPing(c.k, b ?? a + 7, c.at + 0.12, 0.04, 0.01, 1.8);
    return 2;
  },
};

const TIDE_CUES: Station["cues"] = {
  /* a news card: two glass notes of the chord, a beat apart */
  news: c => {
    const [a, , b] = chordIn(c, 74);
    glassPing(c.k, a, c.at, 0.03);
    glassPing(c.k, b ?? a + 7, c.at + c.beat, 0.025);
    return c.beat + 3.2;
  },
  /* Elise found something: a run of bubbles, then the chord's top note in glass */
  discovery: c => {
    for (let i = 0; i < 4; i++) bubble(c.k, c.at + i * rand(0.09, 0.13), 0.022);
    const notes = chordIn(c, 74);
    glassPing(c.k, notes[notes.length - 1], c.at + c.beat, 0.03, 0.12, 3.5);
    return c.beat + 3.7;
  },
  /* a new model: the chord swelling in slowly from under the water, like a tide */
  newModel: c => {
    chordIn(c, 62).forEach((m, i) => glassPing(c.k, m, c.at + i * 0.05, 0.016, 0.9, 4));
    return 5.2;
  },
  /* a new GPU type: the tune's pluck on the root, its fifth and its octave */
  unlock: c => {
    const r = rootIn(c, 74);
    [r, r + 7, r + 12].forEach((m, i) => pluck(c.k, m, c.at + (i * c.beat) / 2, 0.06));
    return c.beat + 0.5;
  },
};

export const TIDE_POOL: Station = {
  id: "tide-pool",
  name: "Tide Pool",
  blurb: "an underwater drone, calm and slow",
  /* cues land on the tune's beat, over the pad's chord on its D */
  beat: 2 * EIGHTH_S,
  harmony: (clock, t) => ({ root: 38, notes: chordAt(clock, t).pad }),
  cues: TIDE_CUES,
  acoustics: "underwater",
  sfx: TIDE_SFX,
  layers: [
    { name: "deep", wet: 0.25, build: deep },
    { name: "current & tune", wet: 0.5, build: k => both(current(k), tune(k)) },
    { name: "glass", wet: 0.9, build: glass },
    { name: "surface", wet: 0.7, build: surface },
  ],
};
