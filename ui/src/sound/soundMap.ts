/*
  SOUND MAP: the one place that wires sounds to events.

  To add a sound:
    1. Drop the audio file (.wav, .mp3, .ogg, .m4a or .flac) into  src/sound/files/
    2. Add a line below:   "event.name": { file: "your-file.wav" },

  That is all. Vite bundles everything in files/, so it works in `npm run dev`
  and in the production image without touching the server.

  Fields
    file    the file name inside src/sound/files/ (exact name, including extension),
            or a list of names: each play then picks one of them at random
    volume  0 to 1, default 1. Per-sound level.
    trim    for a sound with several files, a level for any one of them on top of
            volume (file name to 0..1), so a file recorded hotter than its siblings
            plays as loud as they do and not louder.
    pitchJitter  0 to 0.5, default 0. Each play is pitched up or down by a random
            amount up to this fraction (0.1 = up to 10% either way), so a sound that
            repeats a lot (like the button click) does not sound identical each time.
    sync    true for a sound timed against something on screen (the R&D hold). If it
            starts late (decoding, waking the audio, the speakers' own latency), it
            skips ahead by that much so its timeline still matches the moment it was
            triggered. Leave it off for short hits: skipping would cut their attack.
    loop    true to repeat the file until the stop function playSound returns is
            called (the R&D reveal's cash register runs for as long as its numbers
            count up).

  Muting
    The game starts with sound on. The mute buttons on the start popup and in the brand bar
    (next to Blog and bug?) turn sound on and off; they share one switch, saved in
    localStorage ("mm-muted") so it survives a reload. In code: setMuted(true) from soundEngine.ts, or window.mkmkSound.setMuted(true).

  Levels
    Pointing at either mute button opens a small panel (SoundControl.tsx) with two
    sliders: sound effects and music, 0 to 100% each, saved in localStorage
    ("mm-sfx-volume-v2", "mm-music-volume"). Every sound here plays through one effects
    bus at the effects level; `volume` above is each sound's share of it. In code:
    setSfxVolume(0.5) and setMusicVolume(0.5) from soundEngine.ts.

  Playing an event
    - Buttons: every click on a <button>, [role="button"] or input[type=button|submit]
      plays "button.click". To give one button its own sound, add the event here and
      put data-sound="your.event" on that button. data-sound="none" silences one.
    - Popups: whenever one of the game's popups opens (the monthly news card, the
      leaderboard), it plays "news.open". The
      start popup is silent (data-sound="none" on #ovStart). To give one popup its own sound, put
      data-sound="your.event" on the popup's element (the <div class="ov"> ...),
      or data-sound="none" to keep it quiet. Closing a popup makes no sound.
    - Game end: "game.win" plays when the year runs out and the score screen opens,
      "game.lose" when the business goes bankrupt and the game-over screen opens. They
      are the popup sounds of those two screens (data-sound on #ovScore in Leaderboard.tsx
      and #ovDie in GameOverOverlay.tsx), so each replaces "news.open" instead of stacking on it. The game
      treats reaching the end of the year as the finish whatever the capital is (it
      sets off the fireworks either way), and so does this. Over the score screen,
      "fireworks.pop" plays each time a firework bursts (up to nine, about 2.6 s).
    - Anything else (the game engine, a React handler):
        import { playSound } from "./sound";   playSound("your.event");
      playSound returns a function that fades the sound out, for a sound that
      should end when a press does (see HoldInstall in RdPanel.tsx).
      The engine is a plain script, so from there use:
        window.mkmkSound?.play("your.event");

  Event names are free text; "area.thing" reads well. An event with no file in
  files/ is skipped quietly (one console warning), so you can add names ahead of
  the audio.
*/

export type SoundSpec = {
  file: string | readonly string[];
  volume?: number;
  trim?: Readonly<Record<string, number>>;
  pitchJitter?: number;
  sync?: boolean;
  loop?: boolean;
};

export const SOUND_MAP = {
  /* any button click, unless the button says otherwise with data-sound */
  "button.click": { file: "button-click.wav", volume: 0.6, pitchJitter: 0.1 },

  /* any popup opening (the news card and the rest), unless the popup says otherwise
     with data-sound: a rising F4-A4-C5 chime, 80 ms apart, near-pure sine and quick to
     fade, kept low because it plays every month */
  "news.open": { file: "news-open.wav", volume: 0.7 },

  /* the run is over: survived the year (score screen) or went bankrupt (game over) */
  /* game.win is a rock finish climbing A flat, B flat, C: power-chord stabs and a held
     one with a kick under each, and a clean major chord on top of each so it sounds
     happy; the held C major is louder, with its major third inside the guitar's range */
  "game.win": { file: "game-win.wav", volume: 0.8 },
  /* game.lose is game.win's rock finish turned around: power chords stepping down
     C, B flat, then a held low F, with a clean minor chord on top of each and its
     minor third inside the guitar's range, so it sounds sad */
  "game.lose": { file: "game-lose.wav", volume: 0.8 },

  /* each firework bursting over the score screen (Fireworks in Leaderboard.tsx) */
  "fireworks.pop": { file: "fireworks-pop.wav", volume: 0.5, pitchJitter: 0.15 },

  /* "Hold to deploy" in R&D and in Serving (HoldInstall in RdPanel.tsx): someone
     typing "elise-run deploy", with Enter landing as the hold completes (HOLD_MS);
     letting go early fades it out */
  "gpu.deploy": { file: "gpu-deploy.wav", volume: 0.7, sync: true },

  /* The R&D reveal popup (RdReveal.tsx) opening: one of six 8-bit discovery horns
     at random, each a quick pickup into a held two-note chord, flutter-tongued with a
     little vibrato. It is that popup's data-sound, so it replaces news.open.
       rd-discover    G4 C5 E5 into G5 over C5
       -2             D5 F#5 A5 into D6 over A5, thinner and quicker flutter
       -3             C5 E5 G5 C6 run into E6 over C6, shorter
       -4             low call G4 G4 C5 into E5 over G4, slow flutter, longer
       -5             A4 C#5 E5, the held A5 over E5 scoops up into place
       -6             F4 A4 C5 F5, the held A5 trills with B flat over F5
     These horns are bright square-wave tones held near full level for over a second,
     much of them at 1-5 kHz where hearing is keenest, so they sound far louder than
     their level suggests: measured as heard (BS.1770 loudness), at 0.45 every one
     was louder than the year-end fanfare. 0.25 brings them to about -20 LUFS, just
     under the Serving ding. -6 is about 3 dB hotter than the other five, so it is
     trimmed to match them. */
  "rd.discover": {
    file: [
      "rd-discover.wav",
      "rd-discover-2.wav",
      "rd-discover-3.wav",
      "rd-discover-4.wav",
      "rd-discover-5.wav",
      "rd-discover-6.wav",
    ],
    volume: 0.25,
    trim: { "rd-discover-6.wav": 0.72 },
  },

  /* The R&D reveal popup: an 8-bit cash register, a drawer click with a coin chime
     then a lighter click, a 0.22 s cycle looping for as long as the improved numbers
     count up to their new values. Synthesized square waves and LFSR noise. */
  "rd.register": { file: "rd-register.wav", volume: 0.5, loop: true },

  /* Closing the R&D reveal: each Serving card the improvement speeds up bounces and
     plays an 8-bit ding (A5 into a ringing D6, over a faint triangle-wave bass thud),
     pitched like the button clicks */
  "serve.ding": { file: "serve-ding.wav", volume: 0.55, pitchJitter: 0.1 },

  /* The Serving cards re-sorting by profit at the end of each in-game day (useDailySort
     in ServingPanel.tsx): a soft 8-bit whoosh, dull LFSR noise rising and falling
     gently under a slow swell, lightly low-passed. Kept quiet: it plays every day */
  "serve.whoosh": { file: "serve-whoosh.wav", volume: 0.18 },

  /* A "Hold to deploy" on a new Serving card landing: the card it lands on pops to
     110% while this plays (ServingPanel.tsx). A short, low 8-bit rev: a square wave
     climbing A1 to A3 with a fast engine wobble, a triangle an octave under it, and
     a small blip as it lands. 0.36 s */
  "serve.powerup": { file: "serve-powerup.wav", volume: 0.6 },

  /* add your events below, e.g.
  "serve.click": { file: "serve.mp3" },
  "rent.click": { file: "coin.wav", volume: 0.8 },
  */
} as const satisfies Record<string, SoundSpec>;

export type SoundEvent = keyof typeof SOUND_MAP;

/* what a button plays when it has no data-sound attribute */
export const DEFAULT_BUTTON_EVENT: SoundEvent = "button.click";

/* what a popup plays when it has no data-sound attribute */
export const DEFAULT_POPUP_EVENT: SoundEvent = "news.open";
