# Capo: vertical slice (v2)

The playable prototype of [Capo](../docs/DESIGN.md), scoped as in §17 of the design doc:
one ward, one established rival (the Calloway Outfit), and **all of 1927, starting from nothing**.

v1 (three lieutenants, one order each) taught us that one order a month is too limiting and that the
tutorial should build the family up from scratch. v2 is rebuilt around that.

## What's in it

- **Start from nothing.** The boss, two cousins (Vito and Carlo), two pistols, $300 and a rented room. No lieutenants, no property.
- **Named hoods.** Every hood has a name, often a nickname, four stats, up to two traits, a line of history and experience. Each job takes the free hands best suited to it (the best talker on a sign-up, the toughest on a takeover), and the squad's stats decide how it goes. Hoods grow with work, get wounded, jailed or killed by name, and the newspaper names them.
- **Lieutenants are promoted, not hired.** A hood with enough experience is lieutenant material and can be promoted in a meeting. Each month a hiring hall offers a few named hoods, with stats and history on show.
- **Branches and job lists.** Eight branches in four areas (Muscle, Property, Vice, Fixing). Each branch is run by the boss or a lieutenant, and a lieutenant can take up to three. Every person ranks the jobs across their branches in one list.
- **Hands are the capacity.** Each job needs a number of hands (and sometimes a car or cash). The person running a list works too, so a crew of two is three hands. Being in debt stalls only jobs that cost money. Hands go to the top of the list first; jobs that get nobody stall, and the orders screen says why.
- **Protection and property are separate.** Shops pay protection (and stop if nobody collects). Owned buildings can hold a back room (speakeasy, gambling den or still) and a telephone.
- **Inventory.** Hoods, pistols, cars and liquor are counted. Bars pour liquor; stills make it; without a supply run, you buy on the open market.
- **Specialists:** recruiter, armourer, mechanic and lawyer. Nothing is locked without one; they make things cheaper, better or safer.
- **Lessons** (switch off any time): work the street, hand it to Sal, buy a building, open a back room, Calloway notices, fix the police, hire a specialist, ambition. Lessons finish on progress, not on the calendar, and three of them bring an experienced hood asking for work, ready to promote.
- **Carried over from v1:** the watch phase with telegram decisions, Change of Plans (your own list changes at once; lieutenants hear by telephone or wait for a runner), heat with itemised causes, the Morning Edition and the Wire, fog of war, ambition, demands and betrayal, and a rival AI that uses the same job lists.

**How the year is judged:** on what you built (buildings, rackets and paying shops, plus some of your cash), not on beating Calloway outright. A draw needs 2,500 points and a win 5,000. Driving Calloway out of the ward entirely wins at once.

Not in the slice: City Hall and elections, laundering, the doctor, brewmaster, accountant and newsman, boss succession, the roguelite layer, and isometric art.

## Running it

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # simulation tests
npm run sim -- 300 # headless balance check: an AI plays the Russo side over 300 seeds
npm run artifact   # single-file build for publishing (dist/capo.html)
```

## Layout

- `src/sim/` is the deterministic simulation, with no DOM. The same seed and the same choices always give the same game.
  - `engine.ts` covers the orders API, hand and car allocation, the day loop, fights, Change of Plans and month-end settlement.
  - `ai.ts` builds job lists for a family (Calloway every month; the autoplay script uses it for the Russos too).
  - `lessons.ts` holds the tutorial. `setup.ts` builds the ward and the hiring pool. `util.ts` holds branches, jobs, prices and targeting rules.
- `src/ui/` is the browser front end: `map.ts` (the ward at night) and `main.ts` (panels, telegrams, the Morning Edition).
- `scripts/autoplay.ts` is the headless balance runner.

## Balance snapshot

From `npm run sim -- 300`. The Russo side is played by a simple autopilot that takes on whoever the lessons offer, promotes its most capable hood, hands out branches and answers telegrams. It never really plans:

| Russo player | Win | Draw | Loss |
|---|---|---|---|
| Autopilot, sensible answers | 2% | 22% | 76% |
| Autopilot, random answers | 4% | 33% | 63% |

The autopilot is weak, so these numbers say little about a human. The thresholds need tuning from real play.
