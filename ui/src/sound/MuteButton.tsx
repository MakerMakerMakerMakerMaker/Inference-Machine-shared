import { useSyncExternalStore } from "react";
import { isMuted, playerSetMuted, playSound, subscribeSound } from "./soundEngine";

/* Pixel-art speaker on a 16-cell grid: two sound waves when on, an X when muted.
   Draw it at a multiple of 16px so every cell lands on whole pixels. */
export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      className="muteIcon"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g fill="currentColor">
        <rect x="1" y="6" width="3" height="4" />
        <rect x="4" y="5" width="1" height="6" />
        <rect x="5" y="4" width="1" height="8" />
        <rect x="6" y="3" width="1" height="10" />
        <rect x="7" y="2" width="1" height="12" />
        {muted ? (
          <>
            <rect x="10" y="5" width="2" height="2" />
            <rect x="11" y="6" width="2" height="2" />
            <rect x="12" y="7" width="2" height="2" />
            <rect x="13" y="8" width="2" height="2" />
            <rect x="14" y="9" width="2" height="2" />
            <rect x="14" y="5" width="2" height="2" />
            <rect x="13" y="6" width="2" height="2" />
            <rect x="11" y="8" width="2" height="2" />
            <rect x="10" y="9" width="2" height="2" />
          </>
        ) : (
          <>
            <rect x="9" y="5" width="1" height="1" />
            <rect x="10" y="6" width="1" height="4" />
            <rect x="9" y="10" width="1" height="1" />
            <rect x="11" y="2" width="1" height="1" />
            <rect x="12" y="3" width="1" height="1" />
            <rect x="13" y="4" width="1" height="8" />
            <rect x="12" y="12" width="1" height="1" />
            <rect x="11" y="13" width="1" height="1" />
          </>
        )}
      </g>
    </svg>
  );
}

/* One mute toggle, used wherever the player should be able to reach it. They all read
   the same flag, so flipping one flips the rest. Inside a SoundControl the levels
   panel takes the place of the hover tip (noTip). */
export function MuteButton({
  className,
  noTip,
}: {
  className?: string;
  noTip?: boolean;
}) {
  const muted = useSyncExternalStore(subscribeSound, isMuted);
  const action = muted ? "Unmute sound" : "Mute sound";
  return (
    <button
      type="button"
      className={className}
      /* the toggle plays its own confirmation below, so the page-wide click sound
         stays out of it: it would otherwise click as you mute and stay silent as you
         unmute */
      data-sound="none"
      data-tip={noTip ? undefined : action}
      aria-label={action}
      aria-pressed={muted}
      onClick={() => {
        const next = !muted;
        playerSetMuted(next);
        if (!next) playSound("button.click");
      }}
    >
      <SpeakerIcon muted={muted} />
    </button>
  );
}
