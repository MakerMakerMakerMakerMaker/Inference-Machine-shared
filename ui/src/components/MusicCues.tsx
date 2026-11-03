/* Watches the board and tells the music what is happening (sound/music/cues.ts),
   the same way MusicDirector tells it how far the run has come. Everything here is
   read off the views the engine pushes.

   Cues, the moment each thing first shows:
     news       a news card opens
     discovery  an Elise run finds an improvement
     newModel   a new model comes out (its highlight on the R&D and Stats tables)
     unlock     a new GPU type unlocks (its highlight in the fleet)

   Moods, for as long as each lasts:
     outage     the cloud is down (the fleet's GPUs say they are offline)
     danger     capital is running out (the capital tile turns red)
     paused     the clock is stopped by something on screen (a news card, the R&D
                reveal, the tutorial waiting): the mix muffles, and stays audible.
                The player's own pause is separate and silences the music. */
import { useEffect, useRef } from "react";
import { useControls, useEvent, useGpu, useHud, useRd } from "../game/store";
import { musicCue, setMusicMood, setMusicPaused } from "../sound/musicEngine";

export function MusicCues() {
  const event = useEvent();
  const rd = useRd();
  const gpu = useGpu();
  const hud = useHud();

  const news = !!event;
  const found = rd.jobs?.filter(j => j.phase === "found").length ?? 0;
  const newModel = rd.models.some(m => m.aura);
  const unlock = rd.gpus.some(g => g.aura);
  const outage = !!gpu?.types.some(t => t.tip.includes("Offline"));
  const danger = hud?.tiles.find(t => t.id === "hMoney")?.valueClass === "neg";
  const controls = useControls();
  const paused = !!controls?.paused;
  const playerPaused = !!controls?.playerPaused;

  /* a cue fires on the change to true (or, for finds, on one more), never while it
     stays so; the first look only takes note of how things stand */
  const seen = useRef<{
    news: boolean;
    found: number;
    newModel: boolean;
    unlock: boolean;
  } | null>(null);
  useEffect(() => {
    const was = seen.current;
    seen.current = { news, found, newModel, unlock };
    if (!was) return;
    if (news && !was.news) musicCue("news");
    if (found > was.found) musicCue("discovery");
    if (newModel && !was.newModel) musicCue("newModel");
    if (unlock && !was.unlock) musicCue("unlock");
  }, [news, found, newModel, unlock]);

  useEffect(() => setMusicMood("outage", outage), [outage]);
  useEffect(() => setMusicMood("danger", danger), [danger]);
  useEffect(() => setMusicMood("paused", paused), [paused]);
  useEffect(() => setMusicPaused(playerPaused), [playerPaused]);
  useEffect(
    () => () => {
      setMusicMood("outage", false);
      setMusicMood("danger", false);
      setMusicMood("paused", false);
      setMusicPaused(false);
    },
    []
  );

  return null;
}
