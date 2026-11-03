/*
  THE RADIO: the game's music, as a set of stations (music/stations/) the player
  can tune between. Each station is its own kind of music in four layers, and
  MusicDirector.tsx decides how many layers play, the same way on every station;
  this file makes it so, and changes the station.

  Nothing is a recording: every station is synthesized live with Web Audio, so
  there is nothing to download. All of them play through one music bus (the music
  level and mute, soundEngine.ts) and one shared reverb.

  A layer joining the progression fades in over FADE_IN_S. Changing station while
  music plays sounds like turning a radio dial: the old station drops away under a
  short burst of static and the new one comes up behind it, at the same level, on
  a fresh clock. Changing station in silence (the start screen, the tutorial) only
  sets what will play. The pick is saved, so a reload keeps it.

  Notes are booked ahead on the audio clock by a small scheduler (book()), so a busy
  frame cannot make them late.

  The game can also nudge the music as things happen (music/cues.ts): musicCue()
  plays a short moment in key on the next beat, and setMusicMood() colours the
  whole mix while a state lasts. MusicCues.tsx decides when.
*/
import { CUE_GAP_S, CUE_WET, DEFAULT_CUES, MOODS } from "./music/cues";
import {
  kit,
  rand,
  type Book,
  type Clock,
  type CueId,
  type Graph,
  type Harmony,
  type Kit,
  type MoodId,
  type Station,
} from "./music/kit";
import { installStationSfx, retuneSfx } from "./music/sfx";
import { DEFAULT_STATION, STATIONS } from "./music/stations";
import { audioContext, isMuted, musicVolume, subscribeSound } from "./soundEngine";

/* overall music level at the music slider's 100%; the effects sit under it (soundEngine.ts, SFX_UNDER) */
const MUSIC_VOL = 0.5;
const busLevel = () => (isMuted() ? 0 : MUSIC_VOL * musicVolume());
/* a layer joining slowly swells in; the end of a run is a gentler exit */
const FADE_IN_S = 8;
const FADE_OUT_S = 3;
const MUTE_FADE_S = 0.3;
/* changing station: the old one drops out fast, the new one comes up behind the
   static, which lasts STATIC_S */
const TUNE_OUT_S = 0.5;
const TUNE_IN_S = 1.8;
const STATIC_S = 0.7;
/* a mood eases in and out with this time constant */
const MOOD_TC_S = 0.5;
/* resume only: pause itself cuts the music with no fade */
const PAUSE_FADE_S = 0.4;
/* how far ahead the scheduler books notes, and how often it wakes */
const LOOKAHEAD_S = 1.5;
const TICK_MS = 250;
const REVERB_S = 5;

/* ---- the shared graph: music bus, reverb, a noise buffer ---- */

let graph: Graph | null = null;

/* A long, dark tail: stereo noise, low-passed and decaying to silence over
   REVERB_S, so everything sounds a little under water. */
function impulse(ac: AudioContext) {
  const n = Math.floor(ac.sampleRate * REVERB_S);
  const ir = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += 0.2 * (Math.random() * 2 - 1 - y);
      data[i] = y * Math.exp((-6.9 * i) / n);
    }
  }
  return ir;
}

function whiteNoise(ac: AudioContext) {
  const n = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/* After the bus, the moods' stage (music/cues.ts): a high-pass, a low-pass and a
   level, wide open until a mood closes them in. */
let moodStage: {
  high: BiquadFilterNode;
  low: BiquadFilterNode;
  level: GainNode;
} | null = null;
/* After the mood, so a pause silences the mix without touching mute or the slider. */
let pauseGain: GainNode | null = null;
let musicPaused = false;

function ensureGraph(ac: AudioContext): Graph {
  if (graph) return graph;
  const bus = ac.createGain();
  bus.gain.value = busLevel();
  const mood = moodNow();
  const high = ac.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = mood.highpass;
  high.Q.value = 0.5;
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = mood.lowpass;
  low.Q.value = 0.5;
  const level = ac.createGain();
  level.gain.value = mood.level;
  const pause = ac.createGain();
  pause.gain.value = musicPaused ? 0 : 1;
  bus.connect(high).connect(low).connect(level).connect(pause).connect(ac.destination);
  moodStage = { high, low, level };
  pauseGain = pause;
  const reverb = ac.createConvolver();
  reverb.buffer = impulse(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.7;
  reverb.connect(wet).connect(bus);
  /* mute and the music slider both land here, eased so a drag never clicks */
  subscribeSound(() => {
    const now = ac.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(busLevel(), now, MUTE_FADE_S / 4);
  });
  graph = { ac, bus, reverb, noise: whiteNoise(ac) };
  return graph;
}

/* Turning the dial: noise through a band-pass that sweeps up and back down, with
   a faint whistle drifting through it, straight into the bus (dry, like a real
   radio's speaker), so it follows the music level and mute. */
function playStatic(g: Graph) {
  const { ac } = g;
  const now = ac.currentTime;
  const end = now + STATIC_S;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.15, now + 0.04);
  env.gain.setValueAtTime(0.15, now + STATIC_S * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(g.bus);

  const noise = ac.createBufferSource();
  noise.buffer = g.noise;
  noise.loop = true;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(rand(600, 800), now);
  band.frequency.exponentialRampToValueAtTime(rand(2200, 3000), now + STATIC_S * 0.45);
  band.frequency.exponentialRampToValueAtTime(rand(800, 1100), end);
  noise.connect(band).connect(env);
  noise.start(now, rand(0, 1.5));
  noise.stop(end + 0.05);

  const whistle = ac.createOscillator();
  whistle.frequency.setValueAtTime(rand(1500, 1900), now);
  whistle.frequency.exponentialRampToValueAtTime(rand(1000, 1300), end);
  const faint = ac.createGain();
  faint.gain.value = 0.08;
  whistle.connect(faint).connect(env);
  whistle.start(now);
  whistle.stop(end + 0.05);

  whistle.onended = () =>
    [noise, band, whistle, faint, env].forEach(node => node.disconnect());
}

/* ---- the dial ---- */

const STATION_KEY = "mm-music-station";
let station: Station = (() => {
  try {
    const id = localStorage.getItem(STATION_KEY);
    return STATIONS.find(s => s.id === id) ?? DEFAULT_STATION;
  } catch {
    return DEFAULT_STATION;
  }
})();
const stationListeners = new Set<() => void>();

/** Every station, in dial order, as the panel and the /sound page show it. */
export const STATION_LIST = STATIONS.map(s => ({
  id: s.id,
  name: s.name,
  blurb: s.blurb,
  layers: s.layers.map(l => l.name),
}));

/** The station on the dial, playing or not. */
export function stationId() {
  return station.id;
}

/* for React's useSyncExternalStore: every tuner reads the one dial */
export function subscribeStation(listener: () => void) {
  stationListeners.add(listener);
  return () => {
    stationListeners.delete(listener);
  };
}

export function setStation(id: string) {
  const next = STATIONS.find(s => s.id === id);
  if (!next || next === station) return;
  station = next;
  try {
    localStorage.setItem(STATION_KEY, id);
  } catch {
    /* private mode: the pick still holds for this page */
  }
  retune();
  retuneSfx();
  stationListeners.forEach(listener => listener());
}

/** One station along the dial, wrapping round: +1 the next, -1 the one before. */
export function tuneStation(step: number) {
  const n = STATIONS.length;
  const i = STATIONS.indexOf(station);
  setStation(STATIONS[(((i + step) % n) + n) % n].id);
}

/* ---- turning layers on and off ---- */

type Voice = { kit: Kit; book: Book };
const playing: (Voice | null)[] = [null, null, null, null];
/* the clock of the station on air; null while nothing plays */
let clock: Clock | null = null;
/* voices fading out, until their sources stop */
let fading = 0;
let level = 0;
let ticker = 0;

function book() {
  const ac = audioContext();
  if (!ac) return;
  const until = ac.currentTime + LOOKAHEAD_S;
  playing.forEach(v => v?.book?.(until));
}

function fade(g: GainNode, to: number, secs: number, ac: AudioContext) {
  const now = ac.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(to, now + secs);
}

function startLayer(i: number, fadeIn: number) {
  const ac = audioContext();
  if (!ac || playing[i]) return;
  const g = ensureGraph(ac);
  clock ??= { t0: ac.currentTime };
  const spec = station.layers[i];
  const k = kit(g, spec.wet, clock);
  const voice = { kit: k, book: spec.build(k) };
  playing[i] = voice;
  fade(k.out, 1, fadeIn, ac);
  voice.book?.(ac.currentTime + LOOKAHEAD_S);
  if (!ticker) ticker = window.setInterval(book, TICK_MS);
}

function stopLayer(i: number, fadeOut: number) {
  const ac = audioContext();
  const voice = playing[i];
  if (!ac || !voice) return;
  playing[i] = null;
  fade(voice.kit.out, 0, fadeOut, ac);
  voice.kit.stop(ac.currentTime + fadeOut + 0.05);
  fading++;
  window.setTimeout(
    () => {
      voice.kit.dispose();
      fading--;
      /* once everything has faded out, the next start begins on a fresh clock */
      if (!fading && playing.every(v => !v)) {
        clock = null;
        window.clearInterval(ticker);
        ticker = 0;
      }
    },
    fadeOut * 1000 + 200
  );
}

/* The dial moved while music plays: the layers on air drop out under the static,
   and the new station's come up to the same level on a clock of their own. */
function retune() {
  const ac = audioContext();
  if (!ac || !playing.some(Boolean)) return;
  playStatic(ensureGraph(ac));
  playing.forEach((v, i) => {
    if (v) stopLayer(i, TUNE_OUT_S);
  });
  clock = null;
  for (let i = 0; i < level; i++) startLayer(i, TUNE_IN_S);
}

/** How many layers play, 0 to 4, in the station's order. */
export function setMusicLevel(n: number) {
  const want = Math.max(0, Math.min(playing.length, Math.floor(n)));
  if (want === level) return;
  level = want;
  playing.forEach((_, i) => {
    if (i < want) startLayer(i, FADE_IN_S);
    else stopLayer(i, FADE_OUT_S);
  });
}

/* ---- the beat, for things on screen that move in time ---- */

/** Beats since the station's clock started, as a fraction (2.5 is halfway through
    the third beat), at the moment the speakers are playing, so a pulse on screen
    lands with the beat the player hears. With no music on air it counts the
    station's tempo from an arbitrary start, so anything in time keeps its pace. */
export function musicBeats(): number {
  const beat = station.beat || 0.5;
  if (clock && playing.some(Boolean)) {
    const ac = audioContext();
    if (ac) {
      const heard = ac.currentTime - (ac.outputLatency || 0) - (ac.baseLatency || 0);
      return (heard - clock.t0) / beat;
    }
  }
  return performance.now() / 1000 / beat;
}

/* ---- cues and moods (music/cues.ts) ---- */

/* the plain chord a cue plays over on a station that does not say its harmony */
const PLAIN: Harmony = { root: 60, notes: [60, 64, 67] };
const lastCue = new Map<CueId, number>();
/* the cues ride on the music bus, so the effects slider never reaches them; a news
   card or a find opens a popup at the same moment, so they are kept at half */
const CUE_LEVEL = 0.5;

/** A one-off musical moment, on the station's next beat and in its chord. Only
    while music is on air, and each cue rests CUE_GAP_S between plays. */
export function musicCue(id: CueId) {
  const ac = audioContext();
  if (!ac || !clock || !playing.some(Boolean)) return;
  const now = ac.currentTime;
  if (now - (lastCue.get(id) ?? -Infinity) < CUE_GAP_S) return;
  lastCue.set(id, now);
  const g = ensureGraph(ac);
  const beat = station.beat ?? 0;
  const at =
    beat > 0 ? clock.t0 + Math.ceil((now + 0.05 - clock.t0) / beat) * beat : now + 0.05;
  const k = kit(g, CUE_WET, clock);
  k.out.gain.value = CUE_LEVEL;
  const play = station.cues?.[id] ?? DEFAULT_CUES[id];
  const lasts = play({
    k,
    at,
    harmony: station.harmony?.(clock, at) ?? PLAIN,
    beat: beat || 0.5,
  });
  /* anything the cue left running (an effect's wobble, say) stops when it ends */
  k.stop(at + lasts + 0.1);
  window.setTimeout(() => k.dispose(), (at - now + lasts + 0.5) * 1000);
}

const moods = new Set<MoodId>();
/* every mood on now, combined: the lowest low-pass, the highest high-pass, and
   their levels multiplied */
function moodNow() {
  let lowpass = 20000,
    highpass = 10,
    level = 1;
  for (const id of moods) {
    const m = MOODS[id];
    if (m.lowpass) lowpass = Math.min(lowpass, m.lowpass);
    if (m.highpass) highpass = Math.max(highpass, m.highpass);
    if (m.level != null) level *= m.level;
  }
  return { lowpass, highpass, level };
}

/** The player's pause. The music stops at once and keeps its place; resume fades it
    back. A news card or the tutorial only muffles the mix (the paused mood), so
    their cues still play. */
export function setMusicPaused(on: boolean) {
  if (on === musicPaused) return;
  musicPaused = on;
  if (!pauseGain || !graph) return;
  const now = graph.ac.currentTime;
  const g = pauseGain.gain;
  g.cancelScheduledValues(now);
  if (musicPaused) {
    g.setValueAtTime(0, now);
    return;
  }
  g.setValueAtTime(0, now);
  g.linearRampToValueAtTime(1, now + PAUSE_FADE_S);
}

/** A state that colours the whole mix while it lasts, easing in and out over about
    a second and a half. */
export function setMusicMood(id: MoodId, on: boolean) {
  if (on === moods.has(id)) return;
  if (on) moods.add(id);
  else moods.delete(id);
  if (!graph || !moodStage) return;
  const now = graph.ac.currentTime;
  const m = moodNow();
  for (const [param, to] of [
    [moodStage.low.frequency, m.lowpass],
    [moodStage.high.frequency, m.highpass],
    [moodStage.level.gain, m.level],
  ] as const) {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(to, now, MOOD_TC_S);
  }
}

/** The moods on now, for the /sound page. */
export function musicMoods(): ReadonlySet<MoodId> {
  return moods;
}

/* The sound effects take on the station too (music/sfx.ts): its room around every
   effect, and its own voice for the commonest ones, in its chord. They read the
   station on the dial, and its clock while music is on air. */
installStationSfx(() => ({ station, clock: playing.some(Boolean) ? clock : null }));
