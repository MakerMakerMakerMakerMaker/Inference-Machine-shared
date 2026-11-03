# Checks

Scripts that answer the questions this board got wrong once and should not get
wrong again. Both test the build, so build first. From the repo root:

```
npm ci                             # once; installs Playwright
npx playwright install chromium    # once; or set CHROME_PATH to a Chromium
(cd ui && npm run build)
npm run test:replay                # the leaderboard's numbers, ~15 s, no browser
npm run test:probe                 # the clock, NaN, small screens, a 25 s soak
```

| Script | Asks | Passing looks like |
|---|---|---|
| `replay.mjs` | do the saved runs in `fixtures/` replay through the leaderboard validator to the exact same score; does a fixed seed and fleet, run long with and without R&D, land on the same numbers | 6 ok lines |
| `probe.mjs` | does the frame loop run; can the clock get stuck with nothing on screen; does a model too big for the fleet leave a NaN; does every width get the board; does a tireless player survive 25 s at ×60 with no pop-up off screen | 22 ok lines |

A change that is meant to move the game's numbers fails `replay.mjs`. Update
the expected values there and say so in the commit: saved leaderboard runs stop
verifying with it.

`harness.mjs` is what the browser checks share: it serves `ui/dist` on a free
port, opens Playwright's Chromium, and collects page errors.
