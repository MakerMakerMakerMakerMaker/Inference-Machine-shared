import { useLayoutEffect, useRef } from "react";
import { useNews } from "../game/store";
import { closeMobNews, Fold, RowSplit, toggleMobNews, useLayout } from "./layout";

export function Machine() {
  const layout = useLayout();
  const news = useNews();
  const latest = news[0];
  const logRef = useRef<HTMLDivElement>(null);
  const latestId = latest?.id;

  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = 0;
  }, [latestId]);
  const cls = [layout.collapsed.news ? "collapsed" : "", layout.h.news ? "hasH" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div id="center" className={cls || undefined}>
      <RowSplit id="news" edge="above" />
      <div id="centerBody">
        <div id="logPanel">
          <h2 id="logPanelHd">
            <Fold id="news" />
            <svg className="newsIco" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3" width="12" height="11" fill="currentColor" />
              <rect x="1" y="4" width="2" height="10" fill="currentColor" />
              <rect x="4" y="5" width="4" height="3" fill="var(--card)" />
              <rect x="9" y="5" width="4" height="1" fill="var(--card)" />
              <rect x="9" y="7" width="4" height="1" fill="var(--card)" />
              <rect x="4" y="10" width="9" height="1" fill="var(--card)" />
              <rect x="4" y="12" width="7" height="1" fill="var(--card)" />
            </svg>
            <span className="newsTitle">News</span>
            <button type="button" id="logClose" onClick={() => closeMobNews()}>
              Close
            </button>
          </h2>
          <div id="logFull" ref={logRef}>
            {news.map(item => (
              <div
                key={item.id}
                className={["e", item.cls, item.id === latest?.id ? "in" : ""]
                  .filter(Boolean)
                  .join(" ")}
                dangerouslySetInnerHTML={{
                  __html:
                    (item.month ? `<span class="t">${item.month}</span>` : "") +
                    item.html,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div
        id="logStrip"
        role="button"
        tabIndex={0}
        onClick={e => {
          if ((e.target as HTMLElement).closest("a")) return;
          toggleMobNews();
        }}
        onKeyDown={e => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          toggleMobNews();
        }}
      >
        <svg className="newsIco" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" fill="currentColor" />
          <rect x="1" y="4" width="2" height="10" fill="currentColor" />
          <rect x="4" y="5" width="4" height="3" fill="var(--card)" />
          <rect x="9" y="5" width="4" height="1" fill="var(--card)" />
          <rect x="9" y="7" width="4" height="1" fill="var(--card)" />
          <rect x="4" y="10" width="9" height="1" fill="var(--card)" />
          <rect x="4" y="12" width="7" height="1" fill="var(--card)" />
        </svg>
        <span id="logStripLbl">NEWS ·</span>
        <span
          id="logStripText"
          dangerouslySetInnerHTML={{
            __html: latest
              ? (latest.month ? `<span class="t">${latest.month}</span>` : "") +
                latest.html
              : "–",
          }}
        />
      </div>
    </div>
  );
}
