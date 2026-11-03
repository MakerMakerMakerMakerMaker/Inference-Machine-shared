import GitHub from "@mui/icons-material/GitHub";
import { useLayoutEffect, useRef } from "react";
import { SoundControl } from "../sound/SoundControl";
import { blogLinkProps } from "./blogLink";
import { ThemeButton } from "./ThemeButton";

const X_INTENT = "https://x.com/intent/post?text=";

/* Where players report bugs: the issues of the public copy of this repo. */
const BUG_URL =
  "https://github.com/MakerMakerMakerMakerMaker/Inference-Machine-shared/issues";

/* The bar sits at the top of the left column, which can be narrower than the bar's
   full-size wordmark, Blog and bug?. Where they would not fit, --brand-fit scales
   those three down (board.css) until the icons after them stay on screen; with
   room to spare they keep their size. */
function useBrandFit() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const fit = () => {
      bar.style.removeProperty("--brand-fit");
      const over = bar.scrollWidth - bar.clientWidth;
      if (over <= 0) return;
      let text = 0;
      bar.querySelectorAll<HTMLElement>("a:not(.muteBtn)").forEach(a => {
        text += a.offsetWidth;
      });
      if (text > 0)
        bar.style.setProperty(
          "--brand-fit",
          String(Math.max(0.6, (text - over - 2) / text))
        );
    };
    fit();
    void document.fonts.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return ref;
}

export function BrandBar() {
  const bar = useBrandFit();
  return (
    <header id="brandBar" className="panel" ref={bar}>
      <svg className="mmlogo" viewBox="180 265 720 548" height="22" aria-hidden="true">
        <use href="#mm" />
      </svg>
      <a
        className="wordmark"
        href="https://makermaker.ai"
        target="_blank"
        rel="noopener"
      >
        MakerMaker.ai
      </a>
      <span className="spacer" />
      <a
        className="muteBtn"
        href="https://github.com/MakerMakerMakerMakerMaker/Inference-Machine-shared"
        target="_blank"
        rel="noopener"
        aria-label="GitHub"
        title="GitHub"
      >
        <GitHub style={{ fontSize: 16 }} />
      </a>
      <button
        type="button"
        className="muteBtn"
        aria-label="Share on X"
        title="Share on X"
        onClick={() => {
          const text = window.__board?.shareNowText();
          if (!text) return;
          window.open(
            X_INTENT + encodeURIComponent(text),
            "_blank",
            "noopener,noreferrer"
          );
        }}
      >
        <svg className="muteIcon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
          />
        </svg>
      </button>
      <a {...blogLinkProps("blog")}>Blog</a>
      <a id="bugBtn" href={BUG_URL} target="_blank" rel="noopener">
        bug?
      </a>
      <ThemeButton className="muteBtn" />
      <SoundControl className="muteBtn" />
    </header>
  );
}
