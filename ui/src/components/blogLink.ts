import type { MouseEvent } from "react";

export const BLOG_URL = "https://makermaker.ai/breakthroughs/inference/";

export type BlogLink = "blog" | "about" | "elise";

/* Props for an <a> that opens the blog in a new tab. A click, or a middle click,
   tells the game engine, which logs it as play analytics. */
export function blogLinkProps(link: BlogLink) {
  const note = () =>
    window.dispatchEvent(new CustomEvent("mkmk:blog", { detail: { link } }));
  return {
    href: BLOG_URL,
    target: "_blank",
    rel: "noopener",
    onClick: note,
    onAuxClick: (e: MouseEvent) => {
      if (e.button === 1) note();
    },
  };
}
