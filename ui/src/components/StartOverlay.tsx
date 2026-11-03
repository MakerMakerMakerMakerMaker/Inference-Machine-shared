import { START_GPU } from "../art/sprites";
import { useStart } from "../game/store";
import { SoundControl } from "../sound/SoundControl";
import { ThemeButton } from "./ThemeButton";
import { blogLinkProps } from "./blogLink";

export function StartOverlay() {
  const start = useStart();
  if (!start.show) return null;

  return (
    <div className="ov show" id="ovStart" data-sound="none">
      <div className="ovcard">
        <div
          className="mark"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: START_GPU }}
        />
        <p className="kicker">
          MakerMaker's Inference Machine
          <span className="remaster">Remastered</span>
        </p>
        <h2 id="introOne">
          Build your inference business
          <br />
          in <span className="yr">one year</span>.
        </h2>
        <p id="introAsk">
          You have <span className="stake">$10k</span> and no experience. The first
          users are eager to onboard. Are you ready to see if you have what it takes to
          run an AI startup?
        </p>
        <ul id="introGoals">
          <li>Rent GPUs from legally distinct Nbibia and AMB</li>
          <li>Decide which models to host and when</li>
          <li>
            Optimize inference engine with MakerMaker's Elise
            <a {...blogLinkProps("about")}>(about)</a>
          </li>
          <li>Make strategic decisions in a changing world</li>
        </ul>
        <p className="ask">Are you ready?</p>
        <div className="row">
          <button
            className="big primary"
            id="startGo"
            type="button"
            onClick={() => window.__board?.play()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28a1 1 0 0 0-1.5.86z"
              />
            </svg>
            Start
          </button>
          <button
            className="big"
            id="startBoard"
            type="button"
            onClick={() => window.__board?.openBoard()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 22h16"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 2H6v7a6 6 0 0 0 12 0V2Z"
              />
            </svg>
            Leaderboard
          </button>
        </div>
        <ThemeButton className="muteCorner themeCorner" />
        <SoundControl className="muteCorner" />
      </div>
    </div>
  );
}
