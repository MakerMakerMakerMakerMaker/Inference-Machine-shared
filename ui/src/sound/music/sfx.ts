/*
  STATION SOUND FOR THE EFFECTS: the sound effects take on the radio station's
  world, so a click on Overclock sounds like it belongs in an 8-bit game and the
  same click on Tide Pool sounds like it happened under water.

  Two parts, both installed into soundEngine.ts through its hooks:

  The room. Every effect, recorded or synthesized, goes from the effects bus
  (its level and mute) through the station's acoustics (ACOUSTICS below, chosen
  by the station's `acoustics`), then a gentle limiter that holds back the
  loudest peaks, then to the speakers. Changing station crossfades from one room
  to the next over XFADE_S, so nothing clicks.

  The voice. The three commonest effects (VOICED: the button click, the Serving
  card's ding, the news chime) are played by the station itself when it has a
  sound for them (its `sfx`), synthesized in the chord the station is playing, so
  even clicking around the board stays in key. They play at once, not on the
  beat: they answer a press. With no music on air, the chord comes from the
  station's own progression running on a clock of its own (IDLE_CLOCK), so the
  effects still move through its chords. Everything else keeps its recording.

  This file knows nothing of the engine's state; musicEngine.ts hands it a getter
  for the station on the dial and its clock (installStationSfx), and tells it
  when the dial moves (retuneSfx).
*/
import { setSfxStage, setSfxVoice } from "../soundEngine";
import type { SoundEvent } from "../soundMap";
import {
  kit,
  type AcousticsId,
  type Clock,
  type Graph,
  type Harmony,
  type SfxId,
  type Station,
} from "./kit";

/* how long the room takes to change with the station */
const XFADE_S = 0.4;
/* a reverb tail for the effects' rooms, shorter than the music's */
const ROOM_S = 2.5;

const VOICED: Partial<Record<SoundEvent, SfxId>> = {
  "button.click": "click",
  "serve.ding": "ding",
  "news.open": "news",
};

/* ---- the rooms ---- */

type Keep = <T extends AudioNode>(n: T) => T;
type Run = (s: OscillatorNode) => void;
/* A room's wiring: from `entry` through whatever it likes; returns its last node. */
type Wire = (
  ac: AudioContext,
  entry: AudioNode,
  keep: Keep,
  run: Run,
  ir: AudioBuffer
) => AudioNode;
/* a built room: the gain the crossfade moves, and how to take it apart */
type Room = { fade: GainNode; stop(): void };

function build(
  ac: AudioContext,
  input: AudioNode,
  output: AudioNode,
  ir: AudioBuffer,
  wire: Wire
): Room {
  const nodes: AudioNode[] = [];
  const sources: OscillatorNode[] = [];
  const keep: Keep = n => {
    nodes.push(n);
    return n;
  };
  const run: Run = s => {
    s.start();
    sources.push(s);
    nodes.push(s);
  };
  const entry = keep(ac.createGain());
  const fade = keep(ac.createGain());
  fade.gain.value = 0;
  input.connect(entry);
  wire(ac, entry, keep, run, ir).connect(fade);
  fade.connect(output);
  return {
    fade,
    stop() {
      input.disconnect(entry);
      sources.forEach(s => s.stop());
      nodes.forEach(n => n.disconnect());
    },
  };
}

const filter = (ac: AudioContext, type: BiquadFilterType, hz: number, q = 0.7) => {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
};
const level = (ac: AudioContext, v: number) => {
  const g = ac.createGain();
  g.gain.value = v;
  return g;
};
/* a slow wobble of +/- depth on param */
function wobble(
  ac: AudioContext,
  keep: Keep,
  run: Run,
  rate: number,
  depth: number,
  param: AudioParam
) {
  const o = ac.createOscillator();
  o.frequency.value = rate;
  const amt = keep(level(ac, depth));
  o.connect(amt).connect(param);
  run(o);
}
/* tanh, divided by its drive so quiet sounds pass at their level */
function softClip(drive: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / drive;
  }
  return curve;
}
/* rounds every sample to one of `steps` levels: the bit-crush of an old console */
function quantize(steps: number) {
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * (steps / 2)) / (steps / 2);
  }
  return curve;
}

/* no room: straight through */
const STRAIGHT: Wire = (_ac, entry) => entry;

export const ACOUSTICS: Record<AcousticsId, Wire> = {
  /* Tide Pool: under water. Muffled above 1.5 kHz, a slow watery chorus beside it,
     and a reverb. */
  underwater: (ac, entry, keep, run, ir) => {
    const muffle = keep(filter(ac, "lowpass", 1500));
    const sum = keep(level(ac, 1));
    entry.connect(muffle);
    muffle.connect(keep(level(ac, 0.85))).connect(sum);
    const chorus = keep(ac.createDelay(0.05));
    chorus.delayTime.value = 0.012;
    wobble(ac, keep, run, 0.7, 0.002, chorus.delayTime);
    muffle
      .connect(chorus)
      .connect(keep(level(ac, 0.35)))
      .connect(sum);
    const verb = keep(ac.createConvolver());
    verb.buffer = ir;
    muffle
      .connect(verb)
      .connect(keep(level(ac, 0.35)))
      .connect(sum);
    return sum;
  },
  /* Late Shift: an old tape. Lows and highs rolled off, a warm soft saturation,
     and the faintest wobble of a worn transport. */
  tape: (ac, entry, keep, run) => {
    const warm = keep(ac.createWaveShaper());
    warm.curve = softClip(2.2);
    const drift = keep(ac.createDelay(0.05));
    drift.delayTime.value = 0.01;
    wobble(ac, keep, run, 0.5, 0.0004, drift.delayTime);
    return entry
      .connect(keep(filter(ac, "highpass", 120, 0.5)))
      .connect(keep(filter(ac, "lowpass", 3800, 0.5)))
      .connect(warm)
      .connect(drift);
  },
  /* Overclock: an 8-bit console. A copy rounded to sixteen levels (bit-crushed)
     under the clean sound, with the lows thinned like a small speaker. */
  crunch: (ac, entry, keep) => {
    const thin = keep(filter(ac, "highpass", 150, 0.5));
    const top = keep(filter(ac, "lowpass", 7000, 0.5));
    const crush = keep(ac.createWaveShaper());
    crush.curve = quantize(16);
    entry.connect(thin);
    thin.connect(keep(level(ac, 0.6))).connect(top);
    thin
      .connect(crush)
      .connect(keep(level(ac, 0.45)))
      .connect(top);
    return top;
  },
  /* Idle Cycles: a dreamy space. An echo answering left and right, and a reverb. */
  dream: (ac, entry, keep, _run, ir) => {
    const sum = keep(level(ac, 1));
    entry.connect(keep(level(ac, 0.85))).connect(sum);
    const a = keep(ac.createDelay(1));
    a.delayTime.value = 0.42;
    const b = keep(ac.createDelay(1));
    b.delayTime.value = 0.42;
    const left = keep(ac.createStereoPanner());
    left.pan.value = -0.6;
    const right = keep(ac.createStereoPanner());
    right.pan.value = 0.6;
    entry
      .connect(keep(level(ac, 0.3)))
      .connect(keep(filter(ac, "lowpass", 3000)))
      .connect(a);
    a.connect(left).connect(sum);
    a.connect(b);
    b.connect(right).connect(sum);
    b.connect(keep(level(ac, 0.3))).connect(a);
    const verb = keep(ac.createConvolver());
    verb.buffer = ir;
    entry
      .connect(verb)
      .connect(keep(level(ac, 0.4)))
      .connect(sum);
    return sum;
  },
};

/* ---- the stage: bus, room, limiter, speakers ---- */

type Now = { station: Station; clock: Clock | null };
let now: (() => Now) | null = null;
let ctx: AudioContext | null = null;
let stageIn: AudioNode | null = null;
let stageOut: AudioNode | null = null;
let ir: AudioBuffer | null = null;
let current: Room | null = null;

/* a short, soft reverb tail */
function roomTail(ac: AudioContext) {
  const n = Math.floor(ac.sampleRate * ROOM_S);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += 0.3 * (Math.random() * 2 - 1 - y);
      data[i] = y * Math.exp((-6.9 * i) / n);
    }
  }
  return buf;
}

/** Puts the room of the station on the dial in, crossfading from the old one. */
export function retuneSfx() {
  if (!ctx || !stageIn || !stageOut || !now || !ir) return;
  const t = ctx.currentTime;
  const old = current;
  if (old) {
    old.fade.gain.cancelScheduledValues(t);
    old.fade.gain.setValueAtTime(old.fade.gain.value, t);
    old.fade.gain.linearRampToValueAtTime(0, t + XFADE_S);
    window.setTimeout(() => old.stop(), (XFADE_S + 0.2) * 1000);
  }
  const id = now().station.acoustics;
  current = build(ctx, stageIn, stageOut, ir, id ? ACOUSTICS[id] : STRAIGHT);
  current.fade.gain.setValueAtTime(0, t);
  current.fade.gain.linearRampToValueAtTime(1, t + (old ? XFADE_S : 0.01));
}

/* the effects' stage: the bus into the room, the room into a gentle limiter, the
   limiter to the speakers */
function stage(ac: AudioContext, bus: GainNode) {
  ctx = ac;
  ir ??= roomTail(ac);
  const input = ac.createGain();
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 10;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  bus.connect(input);
  limiter.connect(ac.destination);
  stageIn = input;
  stageOut = limiter;
  current = null;
  retuneSfx();
}

/* ---- the voice ---- */

/* the station's own progression, running on a clock of its own, for effects
   played with no music on air */
const IDLE_CLOCK: Clock = { t0: 0 };
/* a plain chord for a station that does not say its harmony */
const PLAIN: Harmony = { root: 60, notes: [60, 64, 67] };

let noise: AudioBuffer | null = null;
function noiseFor(ac: AudioContext) {
  if (noise) return noise;
  const n = ac.sampleRate * 2;
  noise = ac.createBuffer(1, n, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}
/* a reverb send with nowhere to go: a voiced effect's space comes from the room */
let sink: GainNode | null = null;

function voice(event: SoundEvent, ac: AudioContext, bus: GainNode) {
  const id = VOICED[event];
  if (!id || !now) return false;
  const { station, clock } = now();
  const play = station.sfx?.[id];
  if (!play) return false;
  if (!sink) {
    sink = ac.createGain();
    sink.gain.value = 0;
  }
  const g: Graph = {
    ac,
    bus,
    reverb: sink,
    noise: noiseFor(ac),
  };
  const c = clock ?? IDLE_CLOCK;
  const at = ac.currentTime + 0.005;
  const k = kit(g, 0, c);
  k.out.gain.value = 1;
  const lasts = play({
    k,
    at,
    harmony: station.harmony?.(c, at) ?? PLAIN,
    beat: station.beat ?? 0.5,
  });
  k.stop(at + lasts + 0.1);
  window.setTimeout(() => k.dispose(), (lasts + 0.6) * 1000);
  return true;
}

/** Hooks the station's room and voice into the effects (soundEngine.ts). `get`
    tells it, whenever it asks, the station on the dial and its clock (null with no
    music on air). */
export function installStationSfx(get: () => Now) {
  now = get;
  setSfxStage(stage);
  setSfxVoice(voice);
}
