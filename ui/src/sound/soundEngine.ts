import {
  DEFAULT_BUTTON_EVENT,
  DEFAULT_POPUP_EVENT,
  SOUND_MAP,
  type SoundEvent,
  type SoundSpec,
} from "./soundMap";
/* Every audio file in files/, bundled by Vite. Importing them (instead of serving a
   public/ folder) puts them under /assets, which is the one path the production
   server exposes. Keyed by bare file name so soundMap.ts can say "click.wav". */
const AUDIO_GLOB = import.meta.glob("./files/*.{wav,mp3,ogg,m4a,flac}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const urlByFile = new Map(
  Object.entries(AUDIO_GLOB).map(([path, url]) => [path.split("/").pop() ?? path, url])
);

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
/* Sound is on until the start popup or the brand bar mutes it. The choice is saved,
   so a reload keeps it. Browsers still hold audio back until the first click or key
   press. */
const MUTE_KEY = "mm-muted";
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();
/* The sound effects and the music each have their own level, 0 to 1, set from the
   panel that opens over the mute button (SoundControl.tsx) and saved the same way.
   Mute sits on top of both: muted is silent whatever the levels say. A player who
   has never moved a slider starts at its default; the effects start at half (of
   their already scaled-down range, SFX_MASTER below).

   The effects level's key carries a version: changing the default for everyone,
   players who already moved the slider included, means bumping it, so every saved
   effects level is set aside once and everyone starts again at the new default
   (v2: the effects scaled down to SFX_MASTER, starting at 50% of that). */
const SFX_KEY = "mm-sfx-volume-v2";
const MUSIC_KEY = "mm-music-volume";
const SFX_DEFAULT = 0.5;
const MUSIC_DEFAULT = 1;
function savedLevel(key: string, fallback: number) {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? "");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  } catch {
    return fallback;
  }
}
let sfxLevel = savedLevel(SFX_KEY, SFX_DEFAULT);
let musicLevel = savedLevel(MUSIC_KEY, MUSIC_DEFAULT);
const soundListeners = new Set<() => void>();

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("[sound] " + message);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));

/* A random playback rate within +/- jitter of normal (0.1 -> 0.9x to 1.1x), so a sound
   heard over and over does not sound identical every time. 0 or unset plays as-is. */
function randomRate(jitter: number | undefined) {
  const j = Math.min(0.5, Math.max(0, Number.isFinite(jitter) ? (jitter ?? 0) : 0));
  return j ? 1 + (Math.random() * 2 - 1) * j : 1;
}

/* The bytes need no AudioContext, so they are fetched as soon as the module loads and
   a first click does not wait on the network. */
const bytes = new Map<string, Promise<ArrayBuffer | null>>();
function fetchBytes(file: string) {
  let found = bytes.get(file);
  if (found) return found;
  const url = urlByFile.get(file);
  if (!url) {
    warnOnce(
      "missing:" + file,
      `"${file}" is in soundMap.ts but not in src/sound/files/, so it stays silent.`
    );
    found = Promise.resolve(null);
  } else {
    found = fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    void found.then(buf => {
      if (!buf) warnOnce("fetch:" + file, `could not load "${file}".`);
    });
  }
  bytes.set(file, found);
  return found;
}

/* Decoding needs no gesture either when it runs on an OfflineAudioContext, and the
   buffers it makes play in the real context, so every file is ready before the first
   press. Browsers without one decode in the real context once it exists. */
type WebkitOfflineWindow = Window & {
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};
let offline: BaseAudioContext | null = null;
function decoder(): BaseAudioContext | null {
  if (offline) return offline;
  const Ctor =
    window.OfflineAudioContext ??
    (window as WebkitOfflineWindow).webkitOfflineAudioContext;
  if (Ctor) offline = new Ctor(1, 1, 44100);
  return offline ?? ctx;
}

const decoded = new Map<string, Promise<AudioBuffer | null>>();
function decode(file: string) {
  let found = decoded.get(file);
  if (!found) {
    const dc = decoder();
    if (!dc) return Promise.resolve(null);
    /* decodeAudioData detaches its input, so give it a copy and keep the original */
    found = fetchBytes(file)
      .then(buf => (buf ? dc.decodeAudioData(buf.slice(0)) : null))
      .catch(() => {
        warnOnce("decode:" + file, `"${file}" is not audio this browser can decode.`);
        return null;
      });
    decoded.set(file, found);
  }
  return found;
}

/* Every sound effect plays through this one gain, so the effects level (and mute)
   reaches sounds that are already playing, like the R&D register's loop.

   SFX_MASTER scales every effect under the slider. The recordings are mastered
   close to full scale (game-win.wav peaks at -1.4 dB) while the music is
   synthesized far quieter, and the effects stage's compressor (music/sfx.ts) adds
   Web Audio's automatic makeup gain on top, so at the slider's face value the
   effects jumped out of the mix even at 5%. 0.06 brings them down to sit with the
   music; the slider still runs 0 to 100% of that. */
const SFX_MASTER = 0.06;
let sfxBus: GainNode | null = null;
function sfxGain() {
  return muted ? 0 : sfxLevel * SFX_MASTER;
}
function updateSfxBus() {
  if (!ctx || !sfxBus) return;
  const now = ctx.currentTime;
  sfxBus.gain.cancelScheduledValues(now);
  sfxBus.gain.setTargetAtTime(sfxGain(), now, 0.03);
}

/* shared with the music (musicEngine.ts), so both follow one unlock and one clock */
export function audioContext(): AudioContext | null {
  return context();
}
function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxGain();
  if (stage) stage(ctx, sfxBus);
  else sfxBus.connect(ctx.destination);
  return ctx;
}

/* The radio colours the effects to match its station (music/sfx.ts). Two hooks
   let it, so this file needs no knowledge of stations:

   A stage takes the effects bus and connects it on to the speakers through
   whatever it likes (the station's acoustics). Without one the bus goes straight
   to the speakers.

   A voice may play an event itself instead of its recording (a station's own
   click, say); it returns true when it did. */
type Stage = (ac: AudioContext, bus: GainNode) => void;
type Voice = (event: SoundEvent, ac: AudioContext, bus: GainNode) => boolean;
let stage: Stage | null = null;
let voice: Voice | null = null;
export function setSfxStage(next: Stage) {
  stage = next;
  if (ctx && sfxBus) {
    sfxBus.disconnect();
    next(ctx, sfxBus);
  }
}
export function setSfxVoice(next: Voice | null) {
  voice = next;
}

/* Browsers keep audio locked until the page has had a real gesture. The context is
   made at load, so it starts out suspended, and a press or key only has to wake it
   rather than build it. A touch's pointerdown is not a gesture that unlocks audio
   (its touchend and click are), and iOS suspends ("interrupted") the context again
   after a call or a trip to the background, so this runs on every gesture. */
function prime() {
  const ac = context();
  if (ac && ac.state !== "running") void ac.resume();
}

const FADE_S = 0.08;

/* A spec's file, or one of its files at random when it lists several. */
function specFiles(spec: SoundSpec): readonly string[] {
  return typeof spec.file === "string" ? [spec.file] : spec.file;
}
function pickFile(spec: SoundSpec): string {
  const files = specFiles(spec);
  return files[Math.floor(Math.random() * files.length)] ?? "";
}
const silent = () => {};

/* Returns a stop function that fades the sound out, for sounds tied to a held press;
   calling it before the file has decoded keeps the sound from starting at all. */
export function playSound(event: SoundEvent): () => void {
  if (muted || !(sfxLevel > 0)) return silent;
  const spec: SoundSpec | undefined = SOUND_MAP[event];
  if (!spec) {
    warnOnce("event:" + event, `no sound mapped to "${event}" in soundMap.ts.`);
    return silent;
  }
  const ac = context();
  if (!ac) return silent;
  if (ac.state !== "running") void ac.resume();
  /* the station may play this one itself, in its own voice */
  if (voice && sfxBus && voice(event, ac, sfxBus)) return silent;
  let stopped = false;
  let stopNow: (() => void) | null = null;
  const asked = performance.now();
  const file = pickFile(spec);
  void decode(file).then(buffer => {
    if (!buffer || stopped) return;
    const source = ac.createBufferSource();
    const gain = ac.createGain();
    source.buffer = buffer;
    source.loop = !!spec.loop;
    const rate = randomRate(spec.pitchJitter);
    source.playbackRate.value = rate;
    /* the sound's level, and the file's own trim when it has one */
    gain.gain.value = clamp01(spec.volume ?? 1) * clamp01(spec.trim?.[file] ?? 1);
    source.connect(gain);
    gain.connect(sfxBus ?? ac.destination);
    /* a synced sound keeps to the moment it was asked for: whatever time went to
       decoding, waking the context and the device's output latency is skipped */
    const late = spec.sync
      ? ((performance.now() - asked) / 1000 +
          (ac.outputLatency || ac.baseLatency || 0)) *
        rate
      : 0;
    source.start(0, Math.min(late, buffer.duration));
    stopNow = () => {
      const now = ac.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_S);
      source.stop(now + FADE_S);
    };
  });
  return () => {
    if (stopped) return;
    stopped = true;
    stopNow?.();
  };
}

export function isMuted() {
  return muted;
}

export function sfxVolume() {
  return sfxLevel;
}

export function musicVolume() {
  return musicLevel;
}

/* For React's useSyncExternalStore and the music: hears every change to mute and to
   either level, so every mute button and level panel reads the same settings. */
export function subscribeSound(listener: () => void) {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

function changed() {
  updateSfxBus();
  soundListeners.forEach(listener => listener());
}

export function setMuted(value: boolean) {
  if (muted === value) return;
  muted = value;
  try {
    if (value) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* private mode: the switch still holds for this page */
  }
  changed();
}

/* The player muting or unmuting, from a mute button or by raising a level in the
   sound panel: the game engine logs each one as play analytics. */
export function playerSetMuted(next: boolean) {
  setMuted(next);
  window.dispatchEvent(new CustomEvent("mkmk:mute", { detail: { muted: next } }));
}

function saveLevel(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* private mode: the level still holds for this page */
  }
}

export function setSfxVolume(value: number) {
  const v = Math.min(1, Math.max(0, value));
  if (v === sfxLevel) return;
  sfxLevel = v;
  saveLevel(SFX_KEY, v);
  changed();
}

export function setMusicVolume(value: number) {
  const v = Math.min(1, Math.max(0, value));
  if (v === musicLevel) return;
  musicLevel = v;
  saveLevel(MUSIC_KEY, v);
  changed();
}
/* A popup's data-sound is the sound it makes when it OPENS, so it is not a click target:
   without the :not(.ov), pressing plain text anywhere inside a popup would play it. */
const CLICKABLE =
  "[data-sound]:not(.ov), button, [role='button'], input[type='button'], input[type='submit']";

/* A data-sound value (or the default when there is none) as a mapped event, or null
   for silence: "none"/empty means quiet on purpose, an unmapped name warns once. */
function resolveEvent(name: string): SoundEvent | null {
  if (name === "none" || name === "") return null;
  if (!(name in SOUND_MAP)) {
    warnOnce("event:" + name, `no sound mapped to "${name}" in soundMap.ts.`);
    return null;
  }
  return name as SoundEvent;
}

/* The event a click should play, or null for silence. data-sound on the element wins;
   a button with none plays the default. */
function eventForClick(target: EventTarget | null): SoundEvent | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(CLICKABLE);
  if (!el) return null;
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true")
    return null;
  return resolveEvent(el.getAttribute("data-sound") ?? DEFAULT_BUTTON_EVENT);
}

/* The game's popups are all <div class="ov"> and are open while they carry "show".
   Nothing here knows which code opens them (React toggles the class from the views
   the engine pushes, and mounts the start popup already open), so the page is watched instead:
   a popup that has just gained "show", or just been added with it, makes a sound. */
const POPUP = ".ov";
const wasShown = (classes: string | null) => /(^|\s)show(\s|$)/.test(classes ?? "");

function popupEvent(el: Element): SoundEvent | null {
  return resolveEvent(el.getAttribute("data-sound") ?? DEFAULT_POPUP_EVENT);
}

/* the popups this one change opened */
function newlyOpened(record: MutationRecord): Element[] {
  if (record.type === "attributes") {
    const el = record.target;
    const opened =
      el instanceof Element &&
      el.matches(POPUP) &&
      el.classList.contains("show") &&
      !wasShown(record.oldValue);
    return opened ? [el] : [];
  }
  const found: Element[] = [];
  record.addedNodes.forEach(node => {
    if (!(node instanceof Element)) return;
    if (node.matches(".ov.show")) found.push(node);
    node.querySelectorAll(".ov.show").forEach(el => found.push(el));
  });
  return found;
}

function onPopupMutations(records: MutationRecord[]) {
  for (const record of records) {
    for (const el of newlyOpened(record)) {
      const event = popupEvent(el);
      if (!event) continue;
      playSound(event);
      return; /* one sound per batch, even if two popups change at the same moment */
    }
  }
}

/* Turns the page's sounds on: button clicks and popups opening.
   Clicks use one listener for the whole page, in the capture phase so a handler that
   stops the click cannot hide it. Untrusted clicks (the replay, tests calling .click())
   are skipped: only a real press makes a sound. Popups need no gesture, since the
   game itself opens them. Returns a function that removes it all. */
export function installSounds() {
  /* A mouse or pen press sounds on pointerdown, not on the click that follows the
     release: waiting for the release adds the whole length of the press (often
     100 ms or more) and reads as lag. Touch keeps the click, because a touch that
     starts a scroll must stay silent. */
  let soundedDown = false;
  const onPointerDown = (e: PointerEvent) => {
    soundedDown = false;
    if (!e.isTrusted || e.button !== 0 || e.pointerType === "touch") return;
    const event = eventForClick(e.target);
    if (!event) return;
    playSound(event);
    soundedDown = true;
  };
  /* A click that follows a sounded pointerdown stays quiet. Taps and keyboard
     clicks (Enter/Space) sound here; Safari's click carries no pointerType, so the
     pointerdown before it is what tells a tap from a mouse press. */
  const onClick = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    const already = e.detail > 0 && soundedDown;
    soundedDown = false;
    if (already) return;
    const event = eventForClick(e.target);
    if (event) playSound(event);
  };
  const GESTURES = ["pointerdown", "touchend", "click", "keydown"] as const;
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  for (const g of GESTURES) document.addEventListener(g, prime, true);

  const popups = new MutationObserver(onPopupMutations);
  popups.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
    attributeOldValue: true,
  });

  /* fetch and decode every file now, and make the context, so the first press only
     has to wake it */
  context();
  for (const spec of Object.values<SoundSpec>(SOUND_MAP))
    for (const file of specFiles(spec)) void decode(file);

  /* the game engine is a plain script outside the bundle; this is its way in */
  window.mkmkSound = {
    play: (event: string) => void playSound(event as SoundEvent),
    isMuted,
    setMuted,
  };

  return () => {
    popups.disconnect();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("click", onClick, true);
    for (const g of GESTURES) document.removeEventListener(g, prime, true);
  };
}

declare global {
  interface Window {
    mkmkSound?: {
      play: (event: string) => void;
      isMuted: () => boolean;
      setMuted: (value: boolean) => void;
    };
  }
}
