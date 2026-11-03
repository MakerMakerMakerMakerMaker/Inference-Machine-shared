import { useEffect, useState } from "react";
import ART_NEWS from "virtual:mkmk-news";
import "./art.css";
import { NEWS_ART, type NewsArt } from "./sprites";

/* The picture large with every piece of news that shows it. */
function ArtNews({ item, onClose }: { item: NewsArt; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const news = ART_NEWS[item.key] ?? [];
  return (
    <div className="artNewsBack" onClick={onClose}>
      <div
        className="artNews"
        role="dialog"
        aria-label={item.name}
        onClick={e => e.stopPropagation()}
      >
        <span className="artGlyph" dangerouslySetInnerHTML={{ __html: item.svg }} />
        {news.length ? (
          news.map((n, i) => (
            <p key={i}>
              {n.title && <b>{n.title} </b>}
              <span dangerouslySetInnerHTML={{ __html: n.text }} />
            </p>
          ))
        ) : (
          <p className="artNewsNone">No news uses this picture.</p>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function ArtPage() {
  const [open, setOpen] = useState<NewsArt | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "News art";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div id="art">
      <header className="artHead">
        <p className="artKicker">24×24</p>
        <h1>News art</h1>
        <p>
          Every picture from the monthly news. Click one to read its news.{" "}
          <a href="/">Back to the machine</a>
        </p>
      </header>
      <ul className="artGrid">
        {NEWS_ART.map(item => (
          <li key={item.key}>
            <figure>
              <button
                type="button"
                className="artGlyph"
                aria-label={`${item.name}: show the news`}
                onClick={() => setOpen(item)}
                dangerouslySetInnerHTML={{ __html: item.svg }}
              />
              <figcaption>
                <b>{item.name}</b>
                <span>{item.key}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {open && <ArtNews item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
