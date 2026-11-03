# Contributing

Thanks for helping. Bug reports, balance ideas and pull requests are all
welcome.

## Before you open a pull request

1. Build and run the checks from the repo root (see `tests/README.md`):

   ```
   (cd ui && npm ci && npm run typecheck && npm run lint && npm run build)
   npm ci && npx playwright install chromium
   npm run test:replay
   npm run test:probe
   ```

2. Run `npm run format` in `ui/` so the diff is only your change. To have the
   CI checks (typecheck, lint, formatting, build, tests)
   run on every commit, install the hook once with `pre-commit install`.
3. Keep a pull request to one change, and say in the description what a player
   would notice.

## Changes that move the game's numbers

The leaderboard trusts a score only if replaying the run through the built
engine lands on the same capital, so any change to the simulation's numbers
makes `npm run test:replay` fail and stops existing leaderboard runs from
verifying. That is fine when it is the point of the change: update the expected
values in `tests/replay.mjs` and say so in the pull request.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
`fix:`, `docs:`, `refactor:`, `test:`, `chore:`). By contributing you agree
that your contribution is licensed under the project's license, GPL-3.0 or
later.
