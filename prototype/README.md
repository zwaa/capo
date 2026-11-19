# Capo: vertical slice

The first playable prototype of [Capo](../docs/DESIGN.md), scoped as in §17 of the design doc:
one ward, one rival family (the Calloway Outfit), three lieutenants, six months (January to June 1927).

## What's in it

- **Orders.** Give each lieutenant a goal (expand, earn, hold, hit, recruit, lie low), a target and a posture (quiet, firm, loud).
- **Personality.** Hotheads escalate, cautious lieutenants hang back, greedy ones skim, and ambitious ones make demands and may betray you.
- **The watch phase.** The month plays out day by day on the map and stops for decisions (react cards) when something happens.
- **Change of Plans.** Big events let you re-issue orders mid-month. A lieutenant at a shop with a telephone hears immediately. Anyone else waits for a runner.
- **Heat and raids.** Hover over Heat or Cash to see every cause, itemised.
- **The Morning Edition.** Each month opens with a newspaper, the informants' Wire, the Ledger and trouble at home.
- **Fog of war.** You only see Calloway's people near your shops and crews.
- **The rival AI** uses the same order system and the same rules, including its own Change of Plans.

Out of scope for the slice: politics, laundering, boss succession, the roguelite layer, and isometric art.

## Running it

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # simulation tests
npm run sim -- 300 # headless balance check: an AI plays the Russo side over 300 seeds
npm run build      # single-file build in dist/index.html
```

## Layout

- `src/sim/` is the deterministic simulation, with no DOM. The same seed and the same choices always give the same game.
  - `engine.ts` covers the month loop, cards, fights, Change of Plans and month-end settlement.
  - `ai.ts` holds the family AI (used for Calloway; autoplay uses it for the Russo side too).
  - `setup.ts` generates the ward and the starting cast. `types.ts`, `util.ts` and `rng.ts` are support code.
- `src/ui/` is the browser front end: `map.ts` (the ward at night, on canvas) and `main.ts` (panels, telegrams, the Morning Edition).
- `scripts/autoplay.ts` is the headless balance runner.

## Balance snapshot

From `npm run sim -- 300` (Russo side played by AI):

| Russo player | Win | Draw | Loss |
|---|---|---|---|
| Random choices (`CAPO_RANDOM=1`) | 1% | 2% | 96% |
| Sensible answers + meetings (hire, telephones, captain, grant demands) | 52% | 14% | 33% |

Calloway is meant to be the favourite. A thoughtful human should beat these numbers.
