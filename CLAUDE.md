# Capo

A Prohibition-era crime-management game, single-player against AI rival families, in the spirit of the
1998 game *Gangsters: Organised Crime* but with modern design. You run a family from nothing; lieutenants
run branches of the business; each month you give orders, then watch the month play out and react.

**Stage: exploring ideas, not building the game.** The prototype exists to test whether the core loop is
fun. Prefer fast, throwaway-friendly changes over robust architecture. Don't add frameworks, engines,
abstractions or "proper" infrastructure unless asked. When an idea changes the design, update the design
doc first.

## Where things are

- `docs/DESIGN.md` is the design doc and the source of truth for decisions. Its **Appendix A decisions
  log** records what was decided and why; §17 describes the prototype's scope; §18 lists open questions.
- `prototype/` is the browser prototype (the "vertical slice"). See `prototype/README.md`.
  - `src/sim/` is the simulation: pure TypeScript, no DOM. `engine.ts` (month loop, jobs, fights,
    settlement), `ai.ts` (family AI), `lessons.ts` (tutorial), `setup.ts` (ward, names, starting cast),
    `util.ts` (branches, job table, prices, helpers), `types.ts`, `rng.ts` (seeded RNG).
  - `src/ui/` is the front end: `main.ts` (panels, telegrams, newspaper), `map.ts` (canvas map), `style.css`.
  - `scripts/autoplay.ts` is the headless balance runner; `tests/sim.test.ts` holds the tests.
- `.devcontainer/` is the dev container (see its README). Develop and run commands inside it.

## Tech stack

TypeScript 5.6 (strict), Vite 5, Vitest 2, vite-node, Node 22. No UI framework: plain DOM strings and a
canvas. The published build is a single HTML file (`vite-plugin-singlefile`).

## Commands (run from `prototype/`, inside the dev container)

- `npm run dev`: play at http://localhost:5173
- `npm run check`: **everything that must pass**: type-check, lint, format check, tests. CI runs this too.
- `npm test` / `npm run typecheck` / `npm run lint`: the parts on their own
- `npm run lint:fix` and `npm run format`: fix what can be fixed automatically
- `npm run sim -- 300`: autopilot plays 300 seeded games and prints win/draw/loss.
  `CAPO_RANDOM=1` answers cards at random; `CAPO_NOLESSONS=1` turns the tutorial off.
- `npm run artifact`: build `dist/capo.html` for publishing

**Before calling a change done:** `npm run check` passes. If the change touches game rules or
numbers, also run `npm run sim -- 300` and report the before and after results. If it touches the UI,
look at it in the browser (desktop and phone width) or say that you didn't.

## Architecture rules

- **The simulation never touches the DOM.** Nothing in `src/sim/` imports from `src/ui/` or uses
  `window`/`document`. The UI calls the sim's exported functions and renders `GameState`.
- **Deterministic.** All randomness goes through `rng.ts` with the RNG state held in `GameState`. Never use
  `Math.random`, `Date.now` or `performance.now` in `src/sim/`. Same seed plus same choices must give the
  same game; a test checks this.
- **Player and AI use the same rules.** The rival builds job lists in the same format the player does and
  is resolved by the same engine. Don't give the AI shortcuts or hidden information.
- **`GameState` is plain JSON.** It's saved to `localStorage` as-is, so no classes, functions or Maps in
  it. If you change its shape, bump `SAVE_KEY` in `src/ui/main.ts`.
- **Every number explains itself.** Money and heat changes go through `spend`/`earn`/`addHeat` with a
  readable label, so the ledger and heat breakdown can show why.

## Conventions

- Code style is Prettier's (`.prettierrc.json`: 140 columns, single quotes). Don't hand-format; run
  `npm run format`. ESLint (`eslint.config.js`) enforces the architecture rules above for `src/sim/`:
  don't silence them with disable comments, fix the code.
- Names: camelCase functions and variables, PascalCase types, UPPER_SNAKE constants.
- Tuning numbers (prices, incomes, thresholds) live in `src/sim/util.ts` or near the top of the file that
  uses them, as named constants. Don't scatter magic numbers.
- Comments explain *why*, not *what*.
- Bug fixes come with a test that would have caught the bug.

## Game design context (what affects code)

- Monthly turns. A month runs day by day; any day can raise a **card** (a decision) that pauses it.
  Big events offer a **Change of Plans**; orders reach lieutenants by telephone at once or by runner later.
- People: the boss and lieutenants run branches; **hoods** are named, with stats and experience, and work
  in crews. Lieutenants are only ever promoted from hoods.
- **Hays Code presentation:** violence and vice are in the game but happen off screen. Show aftermath,
  silhouettes and newspaper reports, never gore. Vice is implied ("a hotel with a lot of late callers").
- **Tone:** pulpy and wry. Period language, no modern profanity. The newspaper is the narrator.
- Fictional places and people only: no real gangsters, officials or brands, and nothing recreating the
  original *Gangsters* game's names, characters or art.

## Common tasks

- **New card (decision):** add the kind to `CardKind` in `types.ts`, raise it in `engine.ts` (from
  `fire()` or where the event happens), resolve it in `answer()`, label it in `KIND` in `ui/main.ts`, and
  make sure the autopilot in `scripts/autoplay.ts` can answer it.
- **New job:** add it to `JobKind` and the `JOBS` table in `util.ts` (branch, stat, target rule, hint),
  its hands in `needFor()`, its effect in `complete()` or `settle()` in `engine.ts`, and teach `ai.ts` to use it.
- **Design change:** edit `docs/DESIGN.md`, add a row to the decisions log, then change the prototype.

## Git (git-flow)

- **`main`**: released versions only. Each release is a merge from a `release/*` or `hotfix/*` branch,
  tagged `vX.Y.Z` (matching `version` in `prototype/package.json`). Never commit to it directly.
- **`develop`**: the integration branch and GitHub's default. Finished features land here. Never commit
  to it directly either.
- **`feature/<short-name>`**: one per idea or change, branched from `develop`, merged back with
  `git merge --no-ff` once `npm run check` passes. Throwaway experiments are features that get deleted
  instead of merged.
- **`release/X.Y.Z`**: from `develop` when a version is worth keeping (e.g. a playtest build): bump the
  version, fix only, merge into `main` (tag it) and back into `develop`.
- **`hotfix/X.Y.Z`**: from `main` for an urgent fix to a release; merge into `main` (tag) and `develop`.
- The pre-commit hook (`.githooks/pre-commit`) refuses commits on `main`/`develop` and runs
  `npm run check` when prototype files are staged. Don't bypass it with `--no-verify` unless asked.
- Commit when a change is finished and its checks pass: one logical change per commit. Messages: a short
  imperative subject (e.g. "Prototype: named hoods with promotion"), a blank line, then a body saying
  what changed and why. Mention any balance numbers that moved.
- Push only when asked. Delete feature branches (local and remote) after merging.
- Never commit `node_modules/`, `dist/`, `.env` files, credentials, or `.claude/settings.local.json`.
- Don't rewrite pushed history (no force-push, no amending pushed commits) without asking.
- Line endings are LF everywhere (`.gitattributes`, `.editorconfig`), including on Windows.

## What not to do

- Don't build for the full game yet: no isometric engine, save systems, multiplayer, or asset pipelines.
- Don't break determinism or let the UI change state except through the sim's exported functions.
- Don't tune balance by feel without measuring: run `npm run sim` before and after.
- Don't delete or rewrite large parts of `docs/DESIGN.md` without being asked; it records decisions.
- Don't install new dependencies without asking.

## Keeping this file current

When Claude makes a mistake worth not repeating, or the structure changes, add or fix a line here. Keep it
short: if a section grows past a screen, move the detail into `docs/` and link to it.
