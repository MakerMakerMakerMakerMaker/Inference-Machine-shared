/* Light or dark. index.html sets data-theme before first paint; this keeps it in
   step afterwards. A choice is saved under the site's key, so the game and the
   blog share it on makermaker.ai; with nothing saved it follows the system. */
export type Theme = "light" | "dark";

const KEY = "mm-theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function apply(t: Theme) {
  if (document.documentElement.dataset.theme === t) return;
  document.documentElement.dataset.theme = t;
  listeners.forEach(l => l());
  /* the engine's canvases read the tokens when they draw */
  window.dispatchEvent(new CustomEvent("mkmk:theme"));
}

const fromSystem = (): Theme => (darkQuery.matches ? "dark" : "light");

darkQuery.addEventListener("change", () => {
  if (!saved()) apply(fromSystem());
});
window.addEventListener("storage", e => {
  if (e.key === KEY) apply(saved() ?? fromSystem());
});

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: the switch still holds for this page */
  }
  apply(t);
}

export function subscribeTheme(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
