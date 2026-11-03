/*
  What every radio station builds its music from. The engine (musicEngine.ts) owns
  the AudioContext's music graph, the scheduler and the switching between
  stations; a station (stations/) only says what its four layers play, using the
  kit below.

  A layer is built once when it joins and gets a Kit: its own output level (which
  the engine fades), helpers for held tones, slow wobbles and one-off notes, and
  the station's clock. It returns a Book, which the scheduler calls every tick with
  the context time to book notes up to, or null when the layer has nothing to
  schedule (a held drone).
*/

export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export const pickOf = <T>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)];

/* The music's shared nodes: the bus every station plays into (music level and
   mute), one reverb, and a buffer of white noise for washes and static. */
export type Graph = {
  ac: AudioContext;
  bus: GainNode;
  /* where a layer's reverb send goes */
  reverb: AudioNode;
  noise: AudioBuffer;
};

/* When the station started playing, in context time. Chords and bar lines count
   from here, so every layer of a station agrees on where it is, and a layer that
   joins later lands on the same chord and the same bar. A station gets a new clock
   each time it comes on air. */
export type Clock = { t0: number };

/* What a layer books ahead each scheduler tick, up to context time `until`. */
export type Book = ((until: number) => void) | null;

/* two parts sharing one layer */
export const both =
  (...books: Book[]): Book =>
  until =>
    books.forEach(b => b?.(until));

/* One layer's nodes: its own level, its reverb send, its sources. */
export type Kit = ReturnType<typeof kit>;
export function kit(g: Graph, wet: number, clock: Clock) {
  const { ac } = g;
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  const keep = <T extends AudioNode>(node: T) => {
    nodes.push(node);
    return node;
  };
  /* the layer's level, which the engine's fades move */
  const out = keep(ac.createGain());
  out.gain.value = 0;
  out.connect(g.bus);
  const send = keep(ac.createGain());
  send.gain.value = wet;
  out.connect(send).connect(g.reverb);

  /* a source that runs from now until the layer stops */
  const run = <T extends AudioScheduledSourceNode>(src: T) => {
    src.start();
    sources.push(src);
    nodes.push(src);
    return src;
  };
  /* a held tone at `level` into `to` */
  const osc = (
    type: OscillatorType,
    freq: number,
    level: number,
    to: AudioNode,
    detune = 0
  ) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const amp = keep(ac.createGain());
    amp.gain.value = level;
    o.connect(amp).connect(to);
    return run(o);
  };
  /* a slow sine wobble of +/- depth on param, around the value it already has */
  const lfo = (rate: number, depth: number, param: AudioParam) => {
    const o = ac.createOscillator();
    o.frequency.value = rate;
    const amt = keep(ac.createGain());
    amt.gain.value = depth;
    o.connect(amt).connect(param);
    run(o);
  };
  /* a one-off sound that cleans up after itself, along with any nodes that only
     carry it (its own level, say) */
  const once = (
    src: AudioScheduledSourceNode,
    at: number,
    until: number,
    ...carriers: AudioNode[]
  ) => {
    src.start(at);
    src.stop(until);
    src.onended = () => {
      src.disconnect();
      carriers.forEach(n => n.disconnect());
    };
  };
  const stop = (at: number) => sources.forEach(s => s.stop(at));
  const dispose = () => nodes.forEach(n => n.disconnect());
  return { ac, g, clock, out, keep, run, osc, lfo, once, stop, dispose };
}

/* A burst of the shared noise from `at` to `end`, starting somewhere random in it,
   into `first` and on through `rest`, all cleaned up once it ends. Drums are made
   of these. */
export function noiseHit(
  k: Kit,
  at: number,
  end: number,
  first: AudioNode,
  ...rest: AudioNode[]
) {
  const src = k.ac.createBufferSource();
  src.buffer = k.g.noise;
  /* looped, so a long hit (a cymbal, a swell) started late in the buffer never
     runs off its end and stops short */
  src.loop = true;
  src.connect(first);
  src.start(at, rand(0, 1.5));
  src.stop(end);
  src.onended = () => [src, first, ...rest].forEach(n => n.disconnect());
}

/* One of a station's four layers: what the /sound page calls it, how much of it
   goes to the reverb, and how to build it. */
export type LayerSpec = { name: string; wet: number; build: (k: Kit) => Book };

/* ---- cues and moods: the soundtrack answering the game (music/cues.ts) ---- */

/* One-off musical moments, each fired when something happens in a run. */
export type CueId = "news" | "discovery" | "newModel" | "unlock";
/* States that colour the whole mix for as long as they last. */
export type MoodId = "outage" | "danger" | "paused";

/* What is sounding at a moment: the chord's notes (any octave, low to high) and
   its root, so a cue can play in key. */
export type Harmony = { root: number; notes: number[] };

/* Where a cue plays: its own kit (level, reverb send, helpers), the time it lands
   on (the station's next beat), the harmony there, and the station's beat. */
export type CueContext = { k: Kit; at: number; harmony: Harmony; beat: number };
/* A cue's sound: plays from c.at, and returns how many seconds it lasts, so the
   engine can tidy up after it. */
export type CuePlay = (c: CueContext) => number;

/* A radio station: a kind of music, in four layers that join one by one as the
   run progresses (MusicDirector.tsx), quietest and sparsest first. */
export type Station = {
  id: string;
  name: string;
  /** a few words for the station's mood */
  blurb: string;
  layers: readonly [LayerSpec, LayerSpec, LayerSpec, LayerSpec];
  /* Seconds per beat, which cues land on, and the harmony at a time, which they
     play in. Both optional: without them a cue lands at once on a plain chord. */
  beat?: number;
  harmony?: (clock: Clock, t: number) => Harmony;
  /* The station's own sound for any cue; the rest use the defaults (cues.ts). */
  cues?: Partial<Record<CueId, CuePlay>>;
  /* The room every sound effect plays in while this station is on the dial, and
     the station's own voice for the commonest effects (music/sfx.ts). A CuePlay
     for an effect starts at once, not on the beat. */
  acoustics?: AcousticsId;
  sfx?: Partial<Record<SfxId, CuePlay>>;
};

/* the sound spaces the effects can play in (music/sfx.ts) */
export type AcousticsId = "underwater" | "tape" | "crunch" | "dream";
/* the effects a station can voice itself: the button click, the Serving card's
   ding, and the news chime */
export type SfxId = "click" | "ding" | "news";
