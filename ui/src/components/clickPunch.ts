import { useEffect } from "react";

/* A light punch on any button that is clicked. The pause button has
   its own stronger one. */
export function useClickPunch() {
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest || t.closest("#pauseBtn")) return;
      const el = t.closest("button:not(:disabled)");
      if (!el) return;
      el.classList.remove("smash-sm");
      void el.getBoundingClientRect();
      el.classList.add("smash-sm");
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
}
