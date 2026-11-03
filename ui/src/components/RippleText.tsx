import type { CSSProperties } from "react";
import { useHud } from "../game/store";
import { CASH_AT, COINS_AT, hypeOf, useProfitDay } from "./CapitalFx";
import { POP_AT } from "./LuxuryPopcorn";

/* The ripple on the Progress panel's tile labels. Each letter bobs up and down a
   beat after the one before it, so a wave runs left to right through the word.

   It rides the Capital tile's hype scale (CapitalFx.tsx). It fades in from
   nothing halfway between the coins (60%) and the cash bundles (75%), and is at
   full height by the time the popcorn starts (85%, LuxuryPopcorn.tsx). The level
   goes on #timePanel as --ripple (0 to 1); board.css turns it into the wave. It
   holds still while the clock is stopped, and never moves with reduced motion. */

const RIPPLE_FROM = (COINS_AT + CASH_AT) / 2;
const RIPPLE_FULL = POP_AT;

/** An effect's strength on the hype scale: 0 at `from`, 1 at `full`, and
    whether the clock is stopped. */
export function useHypeRamp(from: number, full: number) {
  const hype = hypeOf(useProfitDay());
  const frozen = !!useHud()?.frozen;
  const level = Math.max(0, Math.min(1, (hype - from) / (full - from)));
  return { level, frozen };
}

/** the heading ripple's strength, 0 to 1, and whether the clock is stopped */
export function useRipple() {
  return useHypeRamp(RIPPLE_FROM, RIPPLE_FULL);
}

/** A word split into letters the wave can move one at a time. The letters are
    hidden from screen readers, which read the whole word from a hidden copy.
    Below the ripple's threshold it stays plain text, so its letter pairs keep
    their kerning. */
export function RippleText({ text }: { text: string }) {
  const { level } = useRipple();
  if (!(level > 0)) return <>{text}</>;
  return (
    <span className="rip">
      {[...text].map((ch, i) => (
        <span
          key={i}
          className="ripL"
          aria-hidden="true"
          style={{ "--i": i } as CSSProperties}
        >
          {ch}
        </span>
      ))}
      <span className="ripSr">{text}</span>
    </span>
  );
}
