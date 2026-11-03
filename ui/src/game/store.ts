import { useSyncExternalStore } from "react";
import type {
  BoardView,
  ChartView,
  ControlsView,
  GameOverView,
  EventView,
  GameView,
  GpuView,
  HudView,
  RdView,
  ScoreView,
  ServeView,
  StartView,
  TutorialView,
  UnfoldView,
} from "./types";

let view: GameView = {
  tick: 0,
  gpu: null,
  chart: null,
  start: { show: true },
  controls: null,
  hud: null,
  rd: { models: [], gpus: [], serving: {} },
  serve: null,
  event: null,
  gameOver: null,
  score: null,
  board: null,
  tutorial: null,
  unfold: null,
  tutCall: null,
};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

window.__reactPush = next => {
  view = next;
  emit();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTick() {
  return useSyncExternalStore(subscribe, () => view.tick);
}

export function useGpu(): GpuView | null {
  return useSyncExternalStore(subscribe, () => view.gpu);
}

export function useChart(): ChartView | null {
  return useSyncExternalStore(subscribe, () => view.chart);
}

export function useStart(): StartView {
  return useSyncExternalStore(subscribe, () => view.start);
}

export function useControls(): ControlsView | null {
  return useSyncExternalStore(subscribe, () => view.controls);
}

export function useHud(): HudView | null {
  return useSyncExternalStore(subscribe, () => view.hud);
}

export function useRd(): RdView {
  return useSyncExternalStore(subscribe, () => view.rd);
}

export function useServe(): ServeView | null {
  return useSyncExternalStore(subscribe, () => view.serve);
}

export function useEvent(): EventView | null {
  return useSyncExternalStore(subscribe, () => view.event);
}

export function useGameOver(): GameOverView | null {
  return useSyncExternalStore(subscribe, () => view.gameOver);
}

export function useScore(): ScoreView | null {
  return useSyncExternalStore(subscribe, () => view.score);
}

export function useBoard(): BoardView | null {
  return useSyncExternalStore(subscribe, () => view.board);
}

export function useTutorial(): TutorialView | null {
  return useSyncExternalStore(subscribe, () => view.tutorial);
}

export function useUnfold(): UnfoldView | null {
  return useSyncExternalStore(subscribe, () => view.unfold);
}

export function useTutCall(): string | null {
  return useSyncExternalStore(subscribe, () => view.tutCall);
}

export type NewsItem = { id: number; html: string; cls: string; month: string };

let newsItems: NewsItem[] = [];
const newsListeners = new Set<() => void>();

function emitNews() {
  newsListeners.forEach(listener => listener());
}

window.__pushNews = item => {
  newsItems = [item, ...newsItems].slice(0, 40);
  emitNews();
};

window.__clearNews = () => {
  newsItems = [];
  emitNews();
};

export function useNews(): NewsItem[] {
  return useSyncExternalStore(
    listener => {
      newsListeners.add(listener);
      return () => newsListeners.delete(listener);
    },
    () => newsItems
  );
}
