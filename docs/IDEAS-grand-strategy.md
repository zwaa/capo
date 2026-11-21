# Ideas: a grand-strategy feel

*Exploration notes, not decisions. Once homes and blocks gave the ward painted turf, the game started to
feel like a Paradox grand strategy game. This file collects what to borrow from that feel and what to
avoid. Anything we adopt moves into `DESIGN.md` with a row in the decisions log.*

## What already feels that way

- **The map is the scoreboard.** With homes, you hold ground rather than scattered shops.
- **Characters over units.** Lieutenants with traits, loyalty and ambition (Pillar 1).
- **Monthly ticks that tell stories.** The Morning Edition turns numbers into stories, the way event pop-ups do.

## Ideas to borrow

### 1. Blocks as provinces

A block gets a few values of its own that change over time:

- **Fear or goodwill:** do the residents back you or resent you? Leaning on people raises fear now and costs goodwill later.
- **Settled:** a block held for months is truly yours and harder to peel off than one signed up last week
  (Paradox "cores"). Rewards holding ground over grabbing it.
- **Police presence:** local heat, so one block is hot while another is quiet.

### 2. Lieutenants as vassals with fiefs

A lieutenant can be given **blocks** instead of (or as well as) a branch. They collect there, keep a cut and
build their own power base. Less for you to manage; more for them to take with them if they defect.
Delegation becomes the core trade-off, and it answers the "no micromanagement" rule. The design already
hints at it: "split Protection by territory" (§5.2).

### 3. Map modes

Toggle the map between turf, income per block, heat, who runs it (fiefs) and what we know about the rival.
Cheap on the canvas; makes "every number explains itself" visible at a glance.

### 4. Reasons to fight, and sit-downs

Rivals hold grievances ("you took the Orchard Avenue block") and settle them by force or at a sit-down:
truces, territory swaps, splitting a third family's turf. Blocks give diplomacy something concrete to trade.

## Risks

- **Spreadsheet creep.** Runs are 3–5 hours with a tutorial. Every new block value must show on the map or
  in the paper, or it's a hidden spreadsheet.
- **Pacing.** Keep the orders, then watch, then react loop. Don't switch to continuous pausable time.
- **The late game drags.** Paradox games go flat once you're winning. Lean on the anti-snowball brakes (§9);
  fiefs make internal threats a stronger one.
- **Scale.** One ward of nine blocks is small. The feeling really needs the planned city → ward → street zoom.

## Prototype order (cheapest first)

1. **Map modes:** turf, income and heat per block. Mostly UI.
2. **Settled blocks:** one counter per block; tests whether *holding* ground feels good.
3. **A lieutenant's fief:** tests whether delegating territory feels like running a family.

## Grilling notes

*Answers from the design grilling go here, idea by idea.*

### Idea 1: blocks (round 1)

- **Not provinces.** A block isn't real territory; it's where a family's or lieutenant's **power base**
  lies. Bonuses could depend on what's on the block (its shops, its fronts).
- **Two dials, fear and goodwill,** kept separate so more play styles are possible.
- **Settled turf isn't a wall** if there are jobs that work on goodwill and fear, ours or the enemy's, to
  weaken a hold: charity, intimidation and so on.
- **Heat is local** to blocks, but family-wide heat ends up on your **HQ**.

### Idea 1: blocks (round 2)

- **Bonuses go to whoever holds the block.** A lieutenant's blocks make that lieutenant stronger, so you
  specialise lieutenants by the territory they control (the garage blocks make a natural bootlegger).
- **Respected (high fear and high goodwill) is the hardest corner** to reach and hold.
- **Stances and jobs.** A stance on your own blocks (e.g. Generous, Firm, Iron fist) nudges the dials each
  month; one-off jobs (charity, intimidation) strike at an enemy's blocks.
- **HQ only moves by losing it** (raided or taken). It's a real blow, not a way to shed heat.
- **Heat spreads a little** to neighbouring blocks each month.
- **Heat on a block** raises raids on rackets there, slows jobs, erodes goodwill and gets hoods arrested.
- **On screen:** full detail in map modes, with light hints on the normal map (dim streetlamps for heat,
  lit windows for goodwill).

### Idea 2: lieutenants holding blocks (round 1)

- **You grant blocks** (a boss action). Lieutenants also **ask for, or trade for,** blocks whose bonuses
  help the jobs they've been given.
- **Branches and blocks are separate:** branches say what a lieutenant does; blocks say where their power lies.
- **You set each lieutenant's cut** of their blocks' take: higher keeps them loyal, lower keeps money in the family.
- **When a lieutenant defects, it depends on goodwill:** blocks whose residents like you stay; feared or
  resentful ones go with the lieutenant.

### Idea 2: lieutenants holding blocks (round 2)

- **Residents feel the lieutenant's fear and goodwill,** not the family's: they know the man who comes round.
  The longer a lieutenant holds a block, the more it's his.
- **Asking for blocks:** both demands on the boss ("Sal wants the garage block") and swap proposals between
  lieutenants that the boss approves.
- **The boss can hold only a few blocks** properly; the rest drift unless granted. This pushes you to delegate.
- **One cut rate per lieutenant**, across all their blocks.
- **On defection, feared blocks go with him; liked ones stay.** Fear is portable, and love is the family's.
  This refines round 1: **fear belongs to the man** who comes round, and **goodwill builds up in the family's
  name.** A lieutenant who rules by fear is the one to watch.
