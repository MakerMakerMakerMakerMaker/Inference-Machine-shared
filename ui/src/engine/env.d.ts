/* Replaced by vite/board.ts with the titles in catalog/improvements.csv. */
declare const __IMPROVEMENTS_JSON__: string[];
/* The event pictures from art/sprites.ts, by key. */
declare const __EVENT_ART_JSON__: Record<string, string>;

interface Window {
  /* Set by the validator before the engine runs: no drawing, no network. */
  __HEADLESS?: boolean;
  /* For the probe test: the first frame error, frames run, and clock restarts. */
  __frameErr?: unknown;
  __frames?: number;
  __healed?: number;
}
