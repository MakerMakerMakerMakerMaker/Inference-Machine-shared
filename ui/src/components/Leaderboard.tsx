import { useEffect, useRef, useState } from "react";
import { BANNED_NAMES, cleanName, nameOk } from "../engine/names";
import { SHARE_URL } from "../game/share";
import { useBoard, useScore } from "../game/store";
import type { LbRow, ScoreView } from "../game/types";
import { ScoreCapital } from "./Chart";
import { CopyTip, useCopy } from "./CopyTip";
import { TrophyIcon } from "./Hud";

const X_INTENT = "https://x.com/intent/post?text=";

function LbRows({ rows, you }: { rows: (LbRow | null)[]; you?: string }) {
  return (
    <>
      {rows.map((r, i) =>
        r ? (
          <div
            key={i}
            className={"lb" + (r.you ? " you" : "")}
            id={r.you && you != null ? "lbYou" : undefined}
          >
            <span>{r.rank}</span>
            <b>
              {r.you && you != null ? you : r.name}
              {r.pending ? (
                <i
                  className="lbNew"
                  title="New: not verified yet"
                  aria-label="new, not verified yet"
                />
              ) : null}
            </b>
            <span>{r.score}</span>
          </div>
        ) : (
          <div key={i} className="lb gap">
            …
          </div>
        )
      )}
    </>
  );
}

function RowsHead() {
  return (
    <div className="lbhd">
      <span>#</span>
      <span>name</span>
      <span>score</span>
    </div>
  );
}

export function BoardOverlay() {
  const board = useBoard();
  const close = () => window.__board?.closeBoard();
  return (
    <div
      className={board ? "ov show" : "ov"}
      id="ovBoard"
      data-sound="none"
      onClick={e => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {board ? (
        <div className="ovcard">
          <h2>
            <TrophyIcon className="lbTrophy" still />
            Leaderboard
          </h2>
          <p className="sub" id="boardP">
            {board.blurb}
          </p>
          <RowsHead />
          <div id="boardRows">
            <LbRows rows={board.rows} />
          </div>
          {board.note ? (
            <p className="sub" id="boardNote">
              {board.note}
            </p>
          ) : null}
          <div className="row">
            <button
              className="big primary"
              id="boardClose"
              type="button"
              onClick={close}
            >
              CLOSE ▸
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* The name field, while a run that placed has none on the board yet. */
function ScoreName({
  score,
  name,
  setName,
}: {
  score: ScoreView;
  name: string;
  setName: (name: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [hideError, setHideError] = useState("");
  useEffect(() => input.current?.focus(), []);
  const banned = BANNED_NAMES.has(name);
  const ready = nameOk(name) && !score.saving;
  const save = () => {
    if (ready) window.__board?.saveHighscore(name);
  };
  const error = score.error && score.error !== hideError ? score.error : "";
  return (
    <div className="scoreName" id="scoreName">
      <label htmlFor="scoreNameIn">Your name</label>
      <input
        ref={input}
        id="scoreNameIn"
        className={banned ? "bad" : undefined}
        maxLength={3}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        value={name}
        disabled={score.saving}
        onChange={e => {
          setName(cleanName(e.target.value));
          setHideError(score.error);
        }}
        onKeyDown={e => {
          if (e.key === "Enter" && ready) {
            e.preventDefault();
            save();
          }
        }}
      />
      <button
        className={score.saving ? "nameOk busy" : "nameOk"}
        id="scoreSave"
        type="button"
        aria-label={score.saving ? "Saving highscore" : "Save highscore"}
        title="Save highscore"
        disabled={!ready}
        onClick={save}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 12.5l5 5L19 7"
          />
        </svg>
        <i className="spin" aria-hidden="true" />
      </button>
      {banned ? (
        <p className="nameBan" id="scoreNameBan">
          Yeah, no. Use another name.
        </p>
      ) : null}
      {error ? <p id="scoreSaveErr">{error}</p> : null}
    </div>
  );
}

function ShareButtons({ text }: { text: string }) {
  const [textCopied, copyPost] = useCopy();
  const [linkCopied, copyLink] = useCopy();
  return (
    <div className="scoreShare">
      <span>Share</span>
      <div className="row">
        <button
          className="big"
          id="scoreX"
          type="button"
          aria-label="Share on X"
          title="Share on X"
          onClick={() =>
            window.open(
              X_INTENT + encodeURIComponent(text),
              "_blank",
              "noopener,noreferrer"
            )
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            />
          </svg>
        </button>
        <span className="copyWrap">
          <button
            className="big"
            id="scoreShareBtn"
            type="button"
            onClick={() => copyPost(text)}
          >
            Copy Your Score Post Text
          </button>
          <CopyTip show={textCopied} />
        </span>
        <span className="copyWrap">
          <button
            className="big"
            id="scoreLinkBtn"
            type="button"
            onClick={() => copyLink(SHARE_URL)}
          >
            Copy Link
          </button>
          <CopyTip show={linkCopied} />
        </span>
      </div>
    </div>
  );
}

type Rocket = { x: number; y: number; vx: number; vy: number; tx: number; c: string };
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  w: number;
};

const FW_COLORS = ["#e7f700", "#ff7ad9", "#7ee787", "#ffffff", "#6ab0f3", "#ffb347"];

/* A few seconds of fireworks over the year-end screen, each time it opens. */
function Fireworks() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(
    () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || done) return;
    let dpr = 1,
      next = 0,
      bursts = 0,
      raf = 0;
    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    const t0 = performance.now();
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.floor(innerWidth * dpr));
      cv.height = Math.max(1, Math.floor(innerHeight * dpr));
      cv.style.width = innerWidth + "px";
      cv.style.height = innerHeight + "px";
    };
    const burst = (x: number, y: number, c: string) => {
      window.mkmkSound?.play("fireworks.pop");
      const n = 36 + ((Math.random() * 22) | 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2,
          s = 0.8 + Math.random() * 3.2;
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 0.4,
          life: 1,
          c,
          w: 1.2 + Math.random() * 1.6,
        });
      }
    };
    const frame = (now: number) => {
      size();
      const W = innerWidth,
        H = innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      if (now - t0 < 2600 && bursts < 9 && now >= next) {
        next = now + 220 + Math.random() * 180;
        bursts++;
        rockets.push({
          x: W * (0.12 + Math.random() * 0.76),
          y: H + 8,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -(6.5 + Math.random() * 2.4),
          tx: H * (0.12 + Math.random() * 0.38),
          c: FW_COLORS[bursts % FW_COLORS.length],
        });
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.045;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = r.c;
        ctx.fillRect(r.x, r.y, 2.2, 2.2);
        if (r.y <= r.tx || r.vy >= 0) {
          burst(r.x, r.y, r.c);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vy += 0.028;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.life -= 0.012;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w, 0, 6.3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (rockets.length || sparks.length || now - t0 < 2600)
        raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    size();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [done]);
  return <canvas id="fw" ref={ref} hidden={done} />;
}

const ICON_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ScoreCard({ score }: { score: ScoreView }) {
  const [name, setName] = useState("");
  const you = score.naming
    ? BANNED_NAMES.has(name) || !name
      ? "YOU"
      : name
    : undefined;
  return (
    <>
      <Fireworks />
      <div className="ovcard">
        <div className="scoreL">
          <h2 id="scoreH">{score.title}</h2>
          <p id="scoreP">{score.line}</p>
          <div className="num" id="scoreN">
            {score.money}
          </div>
          <ScoreCapital />
        </div>
        <div className="scoreR">
          {score.note ? (
            <p className="sub" id="scoreRank">
              {score.note}
            </p>
          ) : null}
          {score.naming ? (
            <ScoreName score={score} name={name} setName={setName} />
          ) : null}
          <RowsHead />
          <div id="scoreRows">
            <LbRows rows={score.rows} you={you} />
          </div>
          {score.loading ? (
            <p className="scoreLoad" id="scoreLoad">
              <i className="spin" aria-hidden="true" />
              Loading leaderboard
            </p>
          ) : null}
          <div className="row">
            <button
              className="big"
              id="scoreRestart"
              type="button"
              onClick={() => window.__board?.showStart()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  {...ICON_PROPS}
                  d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                />
                <path {...ICON_PROPS} d="M3 3v5h5" />
              </svg>
              RESTART
            </button>
            <button
              className="big primary"
              id="scoreInfinite"
              type="button"
              onClick={() => window.__board?.infiniteMode()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  {...ICON_PROPS}
                  d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"
                />
              </svg>
              INFINITE MODE
            </button>
          </div>
          <ShareButtons text={score.share} />
        </div>
      </div>
    </>
  );
}

/* Always mounted, so opening it is a class change the popup sound picks up.
   The card is keyed by the opening, so the name field and fireworks start fresh. */
export function ScoreOverlay() {
  const score = useScore();
  return (
    <div className={score ? "ov show" : "ov"} id="ovScore" data-sound="game.win">
      {score ? <ScoreCard key={score.id} score={score} /> : null}
    </div>
  );
}
