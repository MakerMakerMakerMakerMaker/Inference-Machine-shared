import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "../theme";

/* Pixel-art sun and moon on the speaker's 16-cell grid. Like the speaker, the icon
   shows the current state: a moon in the dark, a sun on paper. */
function ThemeIcon({ theme }: { theme: "light" | "dark" }) {
  return (
    <svg
      className="muteIcon"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g fill="currentColor">
        {theme === "light" ? (
          <>
            <rect x="6" y="5" width="4" height="6" />
            <rect x="5" y="6" width="6" height="4" />
            <rect x="7" y="0" width="2" height="3" />
            <rect x="7" y="13" width="2" height="3" />
            <rect x="0" y="7" width="3" height="2" />
            <rect x="13" y="7" width="3" height="2" />
            <rect x="2" y="2" width="2" height="2" />
            <rect x="12" y="2" width="2" height="2" />
            <rect x="2" y="12" width="2" height="2" />
            <rect x="12" y="12" width="2" height="2" />
          </>
        ) : (
          <>
            <rect x="5" y="1" width="2" height="1" />
            <rect x="4" y="2" width="3" height="1" />
            <rect x="3" y="3" width="3" height="1" />
            <rect x="2" y="4" width="4" height="1" />
            <rect x="1" y="5" width="5" height="1" />
            <rect x="1" y="6" width="5" height="1" />
            <rect x="1" y="7" width="6" height="1" />
            <rect x="1" y="8" width="7" height="1" />
            <rect x="1" y="9" width="8" height="1" />
            <rect x="13" y="9" width="2" height="1" />
            <rect x="1" y="10" width="14" height="1" />
            <rect x="2" y="11" width="12" height="1" />
            <rect x="3" y="12" width="10" height="1" />
            <rect x="4" y="13" width="8" height="1" />
            <rect x="5" y="14" width="6" height="1" />
          </>
        )}
      </g>
    </svg>
  );
}

export function ThemeButton({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  const to = theme === "dark" ? "light" : "dark";
  const action = `Switch to ${to} theme`;
  return (
    <button
      type="button"
      className={className}
      data-tip={action}
      aria-label={action}
      onClick={() => setTheme(to)}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
