/* The panel titles pulse to the music's beat (musicBeats(), musicEngine.ts):
   Progress on one beat, Fleet on the next, Monitoring on the one after, round and
   round. Each pulse is a quick swell in size that settles back before the next
   beat. (The Monitoring graphs used to hop on the beat too; that was taken out as
   too distracting.)

   The tempo is always the station's own. Only the size follows profit, on the
   Capital tile's hype scale (CapitalFx.tsx): from nothing at 30% (about $16k/day)
   to 10% bigger at 50% ($40k/day). It stops while the clock does, and never runs
   with reduced motion. */
import { useEffect, useRef } from "react";
import { musicBeats } from "../sound/musicEngine";
import { useHypeRamp } from "./RippleText";

const PULSE_FROM = 0.3;
const PULSE_FULL = 0.5;
/* the biggest swell, at the top of the scale */
const PULSE_MAX = 0.1;
/* in order, one per beat */
const TITLES = ["#timePanel", "#gpusPanel", "#chartwrap"].map(p => `${p} .panelTitle`);
/* the swell peaks this far into its beat, then eases back down by the next */
const ATTACK = 0.08;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* 0 to 1 over a beat: a fast rise, then a smooth fall back to rest */
function envelope(f: number) {
  if (f < ATTACK) return f / ATTACK;
  const d = (f - ATTACK) / (1 - ATTACK);
  return (1 - d) * (1 - d);
}

export function BeatPulse() {
  const pulse = useHypeRamp(PULSE_FROM, PULSE_FULL);
  const live = useRef({ pulse: pulse.level });
  live.current = { pulse: pulse.level };
  const active = pulse.level > 0 && !pulse.frozen && !reducedMotion.matches;

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    /* the beat it switched on, so the round starts with Progress */
    const first = Math.floor(musicBeats());
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const beats = musicBeats();
      const n = Math.floor(beats);
      const env = envelope(beats - n);
      const swell = PULSE_MAX * live.current.pulse * env;
      const on = (((n - first) % TITLES.length) + TITLES.length) % TITLES.length;
      TITLES.forEach((sel, i) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return;
        el.style.transformOrigin = "0 50%";
        if (i === on && swell > 0)
          el.style.setProperty("scale", (1 + swell).toFixed(4));
        else el.style.removeProperty("scale");
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      TITLES.forEach(sel => {
        const el = document.querySelector<HTMLElement>(sel);
        el?.style.removeProperty("scale");
      });
    };
  }, [active]);

  return null;
}
