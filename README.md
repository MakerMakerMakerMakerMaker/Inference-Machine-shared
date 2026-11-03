# The Inference Machine

A browser game about running an inference business for one year. You rent
GPUs, choose which open-weights models to serve on which of them, and give
spare GPUs to Elise, [MakerMaker](https://makermaker.ai)'s research agent, to
find speedups for the engine that you then install. Your score is the capital
you end the year with, and a server-side replay verifies every leaderboard
entry.

Play it at https://makermaker.ai/breakthroughs/inference/simulation, and read how it was made at
https://makermaker.ai/breakthroughs/inference/.

## Run it

You need Node.js 24 or newer. From the repo root:

```
cd ui && npm ci           # once
cd ui && npm run dev      # http://localhost:5173
cd ui && npm run build    # production assets in ui/dist
```

Chrome is what it is tested in. Phones and small screens get their own layout
(`ui/src/styles/mobile.css`).

Useful URL parameters:

- `?skipstart=1` skips the intro cards.
- `?t=10` runs the clock ten times faster. One second of the clock at ×1 is one
  accounting hour.
- `?seed=N` pins the world for that page load.
- `?api=URL` points the leaderboard at another server (ignored on the live
  site and on `*.run.app`).

`window.__board` exposes the state (`S`) and the functions the buttons call;
`__board.sim` holds every export of `constants.ts`, `clock.ts` and
`simulation.ts`, and `__board.eval(src)` runs code inside `game.ts`, so its
internals are reachable from the console too.

## How it plays

Every game starts the same way: $10k and no GPUs. Every visit starts a new
game with a new seed. The starting state is `START_STATE` in
`ui/src/engine/constants.ts`; every other tuning number lives in that file too.

**Elise owns the engine; the player owns the business.** Her R&D runs make
the engine faster. The fleet, which models run where, and how many GPUs she
gets stay the player's, and the player can still lose by renting GPUs that sit
idle or that cost more than the models on them earn.

- **Renting.** Four GPU types, two vendors. The bigger types unlock as the
  fleet grows, each type is capped at 256, and the more you rent the cheaper
  each additional GPU gets. Rented GPUs cannot be handed back.
- **Serving.** Each model sells at its fixed list price per token; there is no
  price to set. A deployment earns from the moment it lands: demand
  for a model jumps to what your GPUs on it can serve, up to the size of its
  market, so revenue follows capacity until the market runs out. After that,
  changes (a share cut by an event, GPUs taken off a model) ease in over about
  two game weeks. Models with large weights need several
  GPUs per copy, and some only fit the two newest GPU types. GigaParrot is out
  from the start; the other five come out on the 15th of January through May.
- **R&D.** GPUs not serving can be given to Elise for one model on one GPU
  type. She earns research points over time, faster with more copies'
  worth of GPUs, and each set of points leads to an improvement. You can
  install it once the set is complete or stop early and install a smaller
  share of it. An install speeds that model on that GPU type for good; each
  next find on the same pair takes more points and closes a fraction of what
  is left.
- **Month events.** Each month brings a news card, and most bring a choice,
  each at most once a run, such as a cloud outage, a new engine version,
  partnership offers that change rent, new drivers, a hire, or mining Bitcoin
  on every GPU.
- **The end.** Capital below zero ends the run. At the year end your capital
  is your score; you can put it on the leaderboard and keep playing unscored.

The board:

- **HUD.** Capital with a trend arrow, the time played and the leading model,
  your place on the leaderboard, and the time left.
- **Panels.** Fleet (rent GPUs and see what they are doing), Serving (deploy
  models and see each job's revenue, expenses and profit), R&D (Elise's runs
  and what they found), Stats (tok/s, GPUs per copy, price and profit for
  every model on every GPU type), Monitoring and the news.
- **Monitoring.** Charts of profit a day, GPU utilization, and capital with
  and without Elise (what the same deployments would have earned with none of
  her speedups), marked by month.

## Repository layout

| Path | What it is |
|---|---|
| `ui/` | The game: a Vite + React app with the engine beside it |
| `catalog/improvements.csv` | The engine improvements R&D can discover |
| `validate/server.mjs` | The leaderboard's replay validator, which also runs a local leaderboard |
| `tests/` | Replay and browser checks (see `tests/README.md`) |
| `deploy/` | Terraform for Google Cloud Run, Firestore and Cloud Storage |
| `build.sh` | Builds, and optionally pushes, the production image |

### The game (`ui/`)

- `ui/src/components/` — the board, overlays, and HUD.
- `ui/src/styles/` — board CSS.
- `ui/src/engine/` — the game: `constants.ts` (every tuning number: models,
  GPUs, prices, throughput, market, R&D, the starting state), `simulation.ts`
  (throughput, rent, demand and market share), `game.ts` (rounds, events,
  views) and `loop.ts` (the frame loop), with `state.ts` (the game state
  `S`), `clock.ts`, `names.ts` (leaderboard names), `format.ts` and `util.ts`.
  All of it is typed ES modules. The engine does not draw on the page (the
  tutorial only reads it, to see what is on screen): `pushReact()` hands React
  one view of the state (panels, event card, game over, score, leaderboard,
  tutorial), and the components call back through `window.__board`, whose type
  (`Board`) comes from `game.ts`. The engine is still its own script, not part
  of the page bundle, because the leaderboard replays that exact file:
  `ui/vite/board.ts` has esbuild bundle it from `loop.ts` into `engine.js`. The
  React panels import `constants.ts` directly.
- `ui/src/game/` — the React side of that bridge: `store.ts` (the view the
  engine last pushed), `types.ts` (its types), `rdTable.ts` (the Serving, R&D
  and Stats table, built from `constants.ts`) and `share.ts` (the share
  buttons).
- `ui/src/art/` and `ui/src/sound/` — the event pictures and the sounds. Their
  galleries are at `/art` and `/sound`.
- `catalog/improvements.csv` — the titles the R&D card can show as a
  discovered improvement, one per line under a `title` header. An R&D find draws
  one at random. For the game, list of improvements taken from public vLLM and
  FlashInfer PRs, not from Elise. Refer to our blogpost for actual improvements
  Elise discovered.

`cd ui && npm run typecheck`, `npm run lint` and `npm run format` check and
format the code. `ui/dist/` is the Vite build and is not tracked.

### The leaderboard (`validate/`)

A score is trusted only if replaying the run's events through the built
`engine.js` lands on the same capital. `validate/server.mjs` does that replay
in `node:vm`, with no browser.

- **The live leaderboard** replays every claimed run with this same file before
  the score counts.
- **Locally**, `node validate/server.mjs` (after `npm run build` in `ui/`)
  serves the same API on port 8080 with the board kept in memory. The dev
  server on `localhost` talks to it automatically. `node validate/server.mjs
  run.json` replays one saved run and prints the result.

### Deploy (`deploy/`, `build.sh`)

The game and leaderboard run as one Cloud Run service. You need Docker,
`gcloud` and Terraform.

```
cp deploy/terraform.tfvars.example deploy/terraform.tfvars   # fill in your project and domain
cd deploy && terraform init
terraform apply -target=google_artifact_registry_repository.app   # first time only
cd .. && ./build.sh --push                                        # reads the project from terraform.tfvars
cd deploy && terraform apply
```

State is local by default. To keep it remotely, put a `terraform` block with
your backend in `deploy/backend_override.tf`, which is gitignored like
`terraform.tfvars`.

### Play analytics

The game reports game starts and ends, event-card choices, mute presses and
clicks on the blog links to `POST /events`, tagged with a random per-browser
player id kept in `localStorage` (`im_player`), a random id for the run, and
the game version; the events carry no other identifier.

## Checks

```
npm ci                             # once, at the repo root: Playwright for the browser checks
npx playwright install chromium    # once
(cd ui && npm run build)           # both test the build
npm run test:replay                # saved runs and a fixed seed land on the same numbers
npm run test:probe                 # the clock, NaN, small screens, a soak
```

`tests/README.md` describes each.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
Report security problems, including ways to cheat the leaderboard, privately as
described in [SECURITY.md](SECURITY.md).

## License

Copyright (C) 2026 MakerMaker.

The Inference Machine is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See [LICENSE](LICENSE). The fonts in `ui/src/design/fonts/` keep
their own licenses, next to them in `licenses/`.
