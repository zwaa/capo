# CAPO — Game Design Document

*v0.1 · working draft · Prohibition-era crime management*

---

## 1. Pitch

It's 1927. Booze is illegal, everyone wants it, and the city is up for grabs.

You run a crime family from the first speakeasy to Repeal in December 1933. Each turn you give orders to your **lieutenants** and meet the people who matter. Then you **watch the month play out** across the city and step in when something goes wrong, which it will, because your lieutenants have their own ideas.

A run is **3–5 hours** in a **procedurally generated city** against **2–3 rival families**. You win by wiping out the opposition, by owning city hall, by getting out clean, or by surviving to Repeal with the strongest legacy.

**Single-player.** **Inspiration:** the crime-management genre of the late 90s, with its orders phase followed by a watch phase. We keep that core and rebuild the parts that frustrated players: micromanagement, opaque systems, passive AI and a won game that still needs hours of cleanup.

---

## 2. Pillars (in priority order)

When pillars conflict, the higher one wins.

1. **People.** Your gang is a cast, not a set of units. Lieutenants have personalities, loyalties and ambitions, and the person you trust most is the most dangerous.
2. **Orders, then watch.** You plan, commit and then watch the plan go wrong, and you make a few sharp calls as it does.
3. **The economy.** Rackets, fronts and dirty money that needs cleaning. Money should feel scarce, and spending it should be an interesting choice.
4. **Politics and the law (medium depth).** Cops, judges and aldermen on the payroll, elections you can buy, and a federal task force that comes for whoever gets too big.

## 3. Design rules (fixing the 1998 problems)

| Problem | Rule |
|---|---|
| **Micromanagement** | You command **lieutenants, not hoods**. You give each lieutenant a goal, and they choose the hoods and tactics. Taking direct control is possible but costly (see §5.3). |
| **Opaque systems** | **Every number explains itself.** Hover any value to see its causes, e.g. `Heat 47 (+8 shootout on Dock St, +4 Capt. Doyle unpaid, −3 bribed reporter)`. Each betrayal has a readable trail of warning signs you could have seen. |
| **Passive AI** | Rivals play by **the same rules**: the same fog, the same orders, and lieutenants who can also turn on them. They scheme, form alliances and plant moles. |
| **Snowballing** | **Winning gets harder.** Federal heat grows with your share of the city, ambitious lieutenants want what you've built, and rivals team up against the leader (§9). |

---

## 4. Structure of a run

- **Span:** January 1927 to December 1933 (Repeal). **Hard end.**
- **Turn length:** **one month**, which gives about 84 turns at 2–4 minutes each, or roughly 3–5 hours. Unexpected events can interrupt the month for a **Change of Plans** (§5.5).
- **Fixed historical events** give each run its shape. These are fictionalised and contain no real people:
  - **Oct 1929: the Crash.** Legit businesses lose value, desperate people make good recruits, and gambling and loansharking boom.
  - **1931: a federal tax case** against a big-name boss sets precedent, and unexplained wealth becomes a serious risk from then on.
  - **1932–33: Repeal approaches.** Booze margins slide each month. Families still relying on liquor in 1933 are in trouble.
- **The city:** about 12–16 wards, procedurally generated each run. Each run gets a new layout, new businesses, new officials and new rival leaders.
- **Every run starts from the bottom.** The boss, two or three hoods, a few hundred dollars and no lieutenants. The rival families are already established. Each run follows the same arc: a hustler working one street, then a small outfit, then a family, then a contender for the city. The boss's origin (§6.6) changes what you start with, not where you start.

## 5. The turn loop

### 5.1 The Morning Edition (report, about 30s)
The month opens with a newspaper front page in a wry, pulpy voice:
- **Headlines** about what happened, written with a slant (the press may be on someone's payroll).
- **The Ledger:** income, expenses, dirty and clean cash, all fully itemised.
- **The Wire:** intel reports from informants, each with a confidence rating: *Rumour / Likely / Confirmed*.
- **Trouble at Home:** lieutenant demands, grudges and warning signs.

### 5.2 Orders: the four areas of the business (planning, about 1–2 min)
The family's work is split into four **areas**. Each area is run either by **the boss in person** or by **a lieutenant** you've put in charge of it.

| Area | Covers | Becomes relevant |
|---|---|---|
| **Muscle** | Protection (signing up shops, collecting), guarding, hits, recruiting hoods | From day one |
| **Property** | Buying or taking over buildings, fitting out back rooms, telephones | As soon as there's cash to spend |
| **Vice** | Running speakeasies, gambling dens and stills; the booze supply chain from still to bar | Once you own a building with a back room |
| **Fixing** | Paying off cops, captains, judges and aldermen; later, elections | Once heat starts to matter |

**Jobs and priorities.** Each area has a short, ranked list of **standing jobs**. For example, Muscle might be: *1. Collect from our 6 shops · 2. Sign up Novak's Bakery · 3. Guard the café · 4. Recruit.*
- **Some jobs take a target** (a shop, a building, a rival, an official). **Some are ongoing** (collect, guard, run the speakeasies).
- **Hoods are the capacity.** Each job says how many hoods it needs. The area's crew is handed out from the top of the list down. Jobs at the bottom that get nobody stall, and the orders screen shows that before you commit ("Guard the café: nobody left").
- **Posture** (*Quiet / Firm / Loud*) is set per area, with an override per job. It sets how much violence and heat the job may cause.
- **Jobs carry over.** Ongoing jobs keep running every month. One-off jobs (sign up X, buy Y, hit Z) drop off when they're done. A quiet month is a glance and "Begin the month".
- **Personality reinterprets the list.** A *Hothead* running Muscle adds jobs you didn't ask for, like leaning on a Calloway shopkeeper. A *Greedy* one running Vice skims the take. A *Cautious* one sends fewer hoods to risky jobs. Stats matter too: Muscle helps the Muscle area, Brains helps Property and Fixing, and Charm helps Vice and Fixing.

**The boss in person.** At the start of every run the boss runs all four areas personally:
- The boss is **on the map** with a small crew, and does jobs **exactly as ordered**, with no personality drift.
- But the boss's crew is **shared across every area the boss still runs**, so capacity is tight.
- And the boss on the street is **exposed**. Fights and raids can catch the boss (§6.5).

**Specialists** (§6.4) sit alongside the areas: a lawyer, an accountant, an armourer and others who work for the whole family, not one area.

**Hiring a lieutenant for an area** hands over that area's job list and the hoods you give them, and frees the boss's crew for the rest. You gain capacity and lose control. You can run any area yourself for as long as you like. Later, a big area can be **split between two lieutenants by territory**, e.g. Muscle (west side) and Muscle (docks).

**Boss actions:** a limited number of meetings per month (more as the family grows):
- Bribe or pay off an official · negotiate with a rival (truce, territory, a joint hit, a betrayal) · back an election candidate · arrange laundering · promote, discipline or reward a lieutenant · hire a specialist (accountant, lawyer, bootlegger, hitman)

**Standing orders:** directives carry over unless you change them, so a quiet month needs only a few clicks.

### 5.3 Going over their head (the hybrid)
You can give a **direct order** to a single hood, for example "Vinnie, take out the witness." It always gets done exactly as ordered, but:
- That lieutenant loses **Authority** over their crew, and
- Their **Loyalty** falls, more sharply if they're *Proud* or *Old-world*.

Direct orders are a scalpel. Use them too often and your lieutenants start asking why they need you.

### 5.4 The Month (watch phase, about 60–90s)
The city map plays out the month at speed: cars moving, deliveries, collections and flare-ups. The game **pauses on 2–5 react cards** per month, each a short decision about something going wrong:

> *Your driver spots a tail on the Kessler Street run.*
> **[Lose them]** risk crashing the truck · **[Lead them to the warehouse]** ambush, very loud · **[Dump the load]** lose $1,200, stay clean

Card sources include lieutenant personality clashes, rival moves, police raids, informant tip-offs and random city events. The number of cards is capped so the phase stays snappy.

**Violence** resolves automatically from numbers, weapons, Muscle and Nerve, surprise and position. Big fights produce **one decisive react card** (*push / retreat / take a hostage / call in reinforcements*) before resolving. Results feed straight into casualties, arrests, heat and headlines.

### 5.5 Change of Plans (mid-month re-planning)
React cards cover small decisions. Sometimes something happens that a single choice can't fix: a lieutenant is arrested, a rival hits your brewery, the Task Force raids a front, an informant reports a rival meeting tomorrow night. Those **big events stop the month** and open a **Change of Plans**:

- The rest of the month pauses, with the event shown on the map.
- You can **re-rank jobs, add a job or change posture** in any area for the rest of the month, and use a **boss action** if you have one left.
- **The message has to reach them.** It's 1929, not 2029:
  - Lieutenants at a front **with a telephone** get the new orders straight away.
  - Lieutenants out on the street are reached **by runner** and switch over a few days later, so the old plan keeps running until then.
  - Lieutenants **lying low** or in hiding can't be reached at all this month.
  - Areas the **boss runs in person** change straight away, wherever the boss is.
  - Telephones are an upgrade you buy for fronts, and lines can be **tapped** by the Task Force or a bent operator.
- **Limits:** at most **1–2 Changes of Plans per month**. Each one uses up a boss action from *next* month, because emergencies cost you time you'd have spent elsewhere.
- **Personality still matters.** A *Hothead* ordered to stand down may not, and a *Cautious* lieutenant ordered to retaliate may stall.
- **Rivals can re-plan too,** under the same rules. A rival who reacts fast to your hit is one with telephones and loyal lieutenants.

The point: monthly turns give the game its pace, but the plan is never locked in. The player responds to events, and how quickly they can respond depends on how well the family is organised.

### 5.6 Fallout (automatic)
Loyalty, Ambition, Heat, Federal Attention and official relationships update, the AI families commit their next orders, and the next newspaper is written.

---

## 6. People

### 6.1 Lieutenants (0–6, hard cap 6)
The core of the game. You start with none and hire them one at a time, usually to take an area of the business off the boss's hands (§5.2). Four areas plus territory splits keep the cap at six. Each one has:
- **Stats:** Muscle · Brains · Nerve · Charm
- **2–3 traits:** e.g. *Hothead, Greedy, Old-world, Family Man, Loose Lips, Ambitious, Cautious, Ladies' Man, Teetotaller, Butcher*
- **Loyalty** (hidden, but you can estimate it from signs and informants)
- **Ambition** (visible as a meter, though the threshold for acting on it is hidden)
- **Authority:** how well their crew obeys them

### 6.2 Hoods
Grouped into **crews** under a lieutenant. Each hood is named, has 2–3 stats and one trait, and can be wounded, arrested, killed, turned or **promoted**. You care about them through the lieutenant and can step in directly via §5.3.

### 6.3 Ambition and betrayal
Power you give a lieutenant (turf, crew size, money, prestige) raises their **Ambition**. That's the trade-off: the most capable lieutenant is the most dangerous.
- **Demands** come first: a bigger cut, a ward of their own, a promotion, a hit on a rival lieutenant.
- If demands go unmet, Ambition turns into **plotting**: skimming, splitting off with their crew and turf, **flipping to the feds**, or a **coup** against you.
- There are **warning signs** before every betrayal (new car, missed meetings, seen with rival people). Informants inside your own family can confirm them.

### 6.4 Specialists
Lieutenants run areas with crews of hoods. **Specialists** are professionals who work for **the whole family**. They have no crew and no turf, and they **don't count toward the six-lieutenant cap**.

Each specialist has a **standing service** that applies everywhere, and can take **one job a month on request**:

| Specialist | Standing service | Job on request |
|---|---|---|
| **Lawyer** | Bail, shorter sentences, fewer arrests that stick | Defend someone at trial; get a witness's statement "lost" |
| **Accountant** | Laundering capacity and a better rate; lower tax-case risk | Audit a lieutenant's books (exposes skimming); clean up before an inspection |
| **Armourer** | Better weapons for every crew: stronger in fights | Equip one job specially: a tommy gun for a hit (very loud) or something quiet |
| **Doctor** | Wounded people recover faster and die less often. Nobody goes to a hospital, so there are no police reports | Patch up someone important mid-month |
| **Driver** | Runners arrive faster in a Change of Plans; supply runs lose more tails; fewer arrests at the scene | A getaway for one job |
| **Brewmaster** | Stills make more and better liquor (better bars, nobody goes blind) | Fix a bad batch before it makes the papers |
| **Newsman** | Softer headlines: violence adds less heat, and the Morning Edition takes your side | Plant a story about a rival |

**Hiring:** one of each kind at a time, through a boss meeting, with a monthly retainer. Better specialists cost more, and some can only be had by poaching them from a rival.

**The catch:** specialists know everything about their part of the business. A lawyer or an accountant who turns is the most dangerous witness there is; the 1931 tax case (§4) is built on exactly that. They have loyalty and a price like anyone else, rivals try to buy them, and the Task Force (§8.5) goes after them first.

### 6.5 The Boss and succession
**You are a character on the map.** The boss can be shot, arrested, convicted or indicted for tax evasion.
- When the boss falls, **succession** happens: the lieutenant with the strongest claim (Authority, Loyalty, crew size) takes over. **That may be the one who arranged it.**
- The run continues with the new boss's traits, and loyalties reshuffle. Some lieutenants won't accept the new boss and leave.
- **Game over** only if no viable successor exists or the family collapses.

### 6.6 Creating your boss
Your family starts as a **blank slate**: no archetype, no fixed playstyle. Instead you build the **boss**:
- **Name, nickname and portrait.**
- **One origin** (where they came from), which sets starting stats, a head start in one area, and someone ready to become your first lieutenant:

| Origin | Start with |
|---|---|
| **Off the Boat** | Respect in immigrant wards and a loyal old-country friend ready to hire, but a weak hand with cops and city hall. |
| **The Trenches** | A war veteran: a tougher starting crew and an army buddy ready to hire for Muscle. Violence draws less loyalty loss and more heat. |
| **Bent Badge** | A former cop: police contacts on the payroll from day one, but other families distrust you. |
| **The Docks** | A union man: control of the waterfront and smuggling routes, and a union boss who expects favours. |
| **Back Office** | A bookkeeper who climbed the ranks: cheaper laundering and an accountant, but a thin crew. |

- **Two traits** chosen from a list, each with an **upside and a downside**, e.g. *Silver Tongue* (better deals, rivals expect you to bluff), *Iron Fist* (crews obey, ambitious lieutenants resent you), *Family Man* (high loyalty, family can be targeted), *Showman* (press loves you, more Federal Attention), *Paranoid* (spots moles early, loyal lieutenants feel the suspicion).

**This ties into succession:** when a lieutenant takes over (§6.5), *their* traits become the boss's traits. The family's character shifts with whoever is in charge.

---

## 7. The economy

### 7.1 Wards and businesses
**Protection and property are different things.**
- **Protection:** shops on your streets pay you every month to be left alone. You don't own them. Muscle signs them up and collects. Shops nobody collects from start to drift, and a rival can sign them up.
- **Property:** buildings you own, bought or taken over. Only property can hold a back room (Vice), a telephone, or launder money (Fixing). Owned buildings don't pay protection, but they can turn a small legit profit.

Each ward has 4–8 businesses. A building has a **front** (barber, laundry, cigar shop, garage, club) and a **back room** slot:
- **Speakeasy** · **gambling den** · **numbers bank** · **still / brewery** · **warehouse** · **"hotel"** (a brothel in all but name; see §13.1)

**Rackets:** protection · bootlegging (produce → transport → sell) · gambling · numbers · loansharking · and later, unions, construction and legit holdings.

### 7.2 Dirty and clean money
- Most income is **dirty**. Bribes and hood wages can be paid with dirty cash, but businesses, campaign donations and going legit need **clean** cash.
- **Laundering** goes through owned fronts, each with a capacity per month. Without an **accountant** (§6.4) it's slow and leaves a paper trail.
- **Unexplained wealth** (clean net worth well above legitimate income) builds **tax-case risk**, which rises sharply after 1931.

### 7.3 The Repeal curve
Bootlegging margins stay high until 1931, then fall every month. Legit holdings and diversified rackets keep their value. The economy shifts under you, and families that don't diversify lose ground.

---

## 8. Law and politics (medium depth)

### 8.1 Heat
- **Ward Heat** (local): from violence, raids and witnesses. High heat brings patrols, raids and arrests.
- **Federal Attention** (global): from your **share of the city** plus headline-making violence. See §9.

### 8.2 Officials
Beat cops · precinct captains · judges · the District Attorney · aldermen · the Police Chief · the Mayor. Each has:
- A **price** and a **disposition** (*Bent, Pragmatic, Straight, Crusader*)
- A monthly **payroll** cost if bought. Miss a payment or embarrass them and they turn on you.
- A **memory**: they hold grudges and they remember favours.

### 8.3 Arrests and trials
Arrested people go to trial. The outcome depends on the judge, the DA, evidence and **witnesses**, and witnesses can be paid, scared or made to disappear, each with heat consequences. Convicted lieutenants who face long sentences may **talk**.

### 8.4 Elections (every 2 years: 1928, 1930, 1932)
- Races: **Mayor, DA, and aldermen** by ward.
- You can **back a candidate** (clean cash), **get out the vote** (lieutenants on Charm), **intimidate** (heat), or **stuff ballot boxes** (risky, with high federal attention).
- Rivals do the same. Elections are major turning points in a run.

### 8.5 The Task Force
When one family pulls clearly ahead, an incorruptible federal agent and their squad arrive to **target the leading family**: wiretaps, raids, turning your people. You can slow them down but not buy them.

---

## 9. Anti-snowball brakes
1. **Federal Attention scales with your share** of the city, not just your size. The leader always has it worst.
2. **Internal ambition:** every ward you hand out makes a lieutenant stronger, and stronger lieutenants want more.
3. **Rival coalitions:** AI families **team up against the leader**: truces with each other, joint hits, tip-offs to the cops about your operations.

Together these should keep the last third of a run tense, not a cleanup.

---

## 10. Rival families

- **2–3 rivals per run**, each built from a **fixed archetype plus randomised traits** (leaders, quirks, starting turf):

| Archetype | Plays like |
|---|---|
| **The Old Don** | Patient and political. Owns judges, avoids headlines, and strikes once and decisively. |
| **The Bootlegger** | Fast, violent expansion. Rich in the early game, struggles toward Repeal. |
| **The Machine** | A political organisation first and a gang second. Owns cops and aldermen and fights through the law. |
| **The Syndicate** | Money people. Strong at laundering and legit business, and buys muscle as needed. |

- Rivals use the **same order system** as the player: same fog of war, same informants, and their own lieutenants with ambition. **A coup in a rival family is an opportunity for you.**
- **Diplomacy:** truces, territory deals, joint hits, betrayals. Any rival can break a deal, and the archetype decides how likely they are to.

---

## 11. Intel and fog of war
- You only see what **your people** see. Unexplored wards and rival operations stay dark.
- **Informants** (bent cops, bartenders, newsboys, a disgruntled rival hood) report on rival plans with a **confidence rating**.
- **Moles work both ways.** Rivals can plant one in your family, and you can plant one in theirs.
- Fog keeps the AI fair: it never cheats, it just has better informants than you sometimes.

---

## 12. Winning and losing

| Outcome | Condition |
|---|---|
| **Elimination** | Every rival family destroyed or absorbed. |
| **Own the City** | Hold the **Mayor + Police Chief + DA + a majority of aldermen** at the same time for 6 consecutive months. |
| **Go Legit** | Reach a clean net-worth threshold with low Federal Attention, then **retire**. You can end the run early on your own terms with a bonus to your legacy score. |
| **Repeal** (Dec 1933) | If nobody has won, the game ends and scores **Legacy**: clean wealth, territory, officials owned, family survival, and the boss alive and free. |
| **Defeat** | The family collapses (no turf and no money), or the boss falls with no viable successor. |

---

## 13. Tone and presentation
- **Pulpy and wry.** Period slang, nicknames ("Two-Tone" Benny, Mickey "the Accountant"), caricatured hoods, and front pages with dark humour.
- The newspaper is the game's narrator. It summarises what happened, with whatever slant the press is being paid for.
- Clarity comes first: the map and every number must be readable at a glance. Mood comes second.

### 13.1 Hays Code presentation
The violence and vice are **in the game**: people die, rackets include brothels and gambling, and bodies end up in the river. What changes is **what the camera shows**. We present it the way a 1934 studio picture would:
- **Violence happens off-screen or in silhouette.** On the map: muzzle flashes behind a window, a car speeding away, a hat left on the pavement. No blood, no gore, no lingering on bodies. The newspaper and the ledger tell you the cost.
- **Cut away at the moment of impact.** React cards and events use the movie grammar of the era: a door closes, a shadow on a wall, a jump to the next morning's headline.
- **Vice is implied, never shown.** A "hotel" with a lot of late-night callers and a "hostess" on the books. The ledger is honest about where the money comes from, and the art and text stay suggestive and period-polite.
- **Language is period-clean.** Slang and threats, no modern profanity. "You'll be sleeping with the fishes" fits; swearing doesn't.
- **Wry nod to the Code:** the Code said crime must not pay. The newspapers (and the Task Force) agree, and the moralising headlines are part of the joke. The game itself lets you decide whether crime pays.

### 13.2 Art direction
- **Isometric city.** A diorama-style isometric map of the city: brownstones, docks, rail yards, city hall. Wards are readable as districts, and fronts show their back-room trade through small details (a lookout on the corner, a truck at night).
- **Zoom from city to street.** Three levels:
  1. **City:** the whole map, coloured by family territory, with heat and Federal Attention overlays. Planning happens here.
  2. **Ward:** blocks, fronts, patrols and crews as small groups. The default view in the watch phase.
  3. **Street:** individual hoods, cars, doorways and people on the pavement. Scenes such as a collection, a tail, a raid or a meeting play out here, staged Hays Code style (§13.1).
- **Fog of war applies at every zoom level.** At street level you see only what your people see. Zooming into a ward with no informants shows dark windows and empty streets. Seeing more of the city is something you earn, and the zoom makes that visible.
- **Street-level details are clues.** A new car outside a lieutenant's house, a rival's truck making deliveries to "your" speakeasy, a stranger watching your front. The player who looks closely can spot betrayals before an informant reports them.
- **Art cost warning:** street level is the biggest art expense in the game. Keep it **modular**: a kit of building fronts, interiors-through-windows, vehicles and character sprites recombined procedurally, plus a small set of animated, staged scenes. Don't plan bespoke art per location.
- **Day and night.** The watch phase shows the month passing with lighting shifts. Most business happens after dark.
- **Character portraits** for the boss, lieutenants, officials and rival bosses: caricatured, pulp-illustration style to match the tone.
- **UI** in a period paper style (ledgers, telegrams, newspaper pages, dossiers) that stays clean and readable.

---

## 14. Between runs (roguelite meta-progression)

**Principle: unlocks give you new options, not more power.** Nothing carried between runs makes you stronger. It makes the next run *different*. The anti-snowball brakes (§9) stay meaningful no matter how many hours someone has played.

### 14.1 Deeds unlock content
Specific accomplishments unlock specific things, so playing in new ways is rewarded and players learn the systems as they go:

| Deed | Unlocks |
|---|---|
| Win an election by stuffing ballot boxes | Trait: *Ward Heeler* |
| Survive a coup attempt | Trait: *Sleeps With One Eye Open* |
| Go Legit before 1931 | Origin: *Old Money*, a society heir slumming it |
| Have a lieutenant turn informant and still win | Event pack: *The Rat* |
| Own every official in the city at once | Rival archetype: *The Reformer*, a crusading family that fights through the law |
| Run a ward with zero bodies for a year | Racket: *Insurance*, a legal front with an illegal model |

Deeds unlock **origins, traits, rival archetypes, rackets, city districts** (e.g. a racetrack or a port with an island) **and event packs**. A **Rogues' Gallery** shows locked deeds as rumours, with a hint of how to earn each one.

### 14.2 Legacy points buy cosmetics and convenience
The end-of-run Legacy score (§12) gives **legacy points**, spent only on things that don't change balance:
- Portrait styles, newspaper mastheads, map palettes, period music.
- **Saved boss presets** and **city seed selection** (replay a city you liked).
- **The Family Album:** a record of every past boss, lieutenant and front page.

### 14.3 Counts (the difficulty ladder)
Winning a run unlocks the next **Count**. Like charges stacking up on an indictment, each Count adds a modifier that stays for all higher Counts:

- **Count I:** standard game.
- **Count II:** officials' prices rise 25%.
- **Count III:** the Task Force arrives earlier.
- **Count IV:** a third rival family.
- **Count V:** lieutenants start with higher Ambition.
- …up to **Count X**, with a harsher Repeal curve, rivals forming coalitions sooner, and so on.

Counts give experienced players a long climb without making the first run punishing.

### 14.4 Every ending makes a good story
Every run, won or lost, ends with a **final front page**: an obituary, a trial verdict, a society-page retirement or a gangland "where are they now." It lists what the run unlocked. Losing always moves something forward, and the ending is something to remember (and screenshot).

---

## 15. Engineering notes
- **Orders are data.** The player and AI families submit the same order format, so the AI plays by the same rules.
- **Deterministic resolution** from a seeded RNG, so the same orders and seed always give the same month. That makes bugs reproducible, balance testing possible and seeds shareable.

---

## 16. Tutorial: learning the business
**The first run, with lessons switched on: "The Nephew."** It's January 1927. Uncle Aldo has been sent to Joliet and the police seized his café. You have $300, two cousins who can handle themselves, and his old street. The run starts from nothing like every other run (§4), and each lesson starts when you reach it. Each one ends with the option to **hire a lieutenant to take that area over**:

1. **Muscle.** The boss and the cousins sign up shops on one street and collect each month. *Teaches:* jobs, ranking priorities, posture, the watch phase, react cards. *Ends:* once five shops are paying, a candidate lieutenant comes asking for work. Hire them to run Muscle. *Teaches:* delegation and personality.
2. **Property.** With protection money coming in, buy your first building, maybe Aldo's old café back. Add a telephone. *Teaches:* property vs protection, and telephones (which matter in step 4).
3. **Vice.** Fit out a back room and open a speakeasy, then set up a still to supply it. *Teaches:* rackets, the supply chain, raids. *Ends:* hire someone to run Vice once you have two rackets.
4. **Trouble.** Calloway notices you. A hit on one of your shops triggers your first **Change of Plans**, and the telephone you bought decides how fast you can respond. *Teaches:* fights, Change of Plans, the Wire.
5. **Fixing.** Heat brings your first raid and an arrest. Pay off the precinct captain. *Ends:* hire someone to run Fixing.
6. **Specialists.** Your arrested man needs a **lawyer**: your first specialist. Soon after, the cash piling up needs an **accountant**. *Teaches:* family-wide services, and the risk of people who know too much.
7. **Ambition.** Your Muscle lieutenant, now running half your income, makes their first demand. *Teaches:* demands, loyalty signs, betrayal.

After that the lessons switch off, and the run carries on in the same city. Lessons trigger on progress, not on the calendar, so a player can go as fast or as slow as they like and skip any of them.

---

## 17. Vertical slice (the first prototype)
*v1, below, is built and playable. Playtesting led to the areas-and-jobs model (§5.2) and starting from nothing (§4, §16). v2 rebuilds the slice around them:*
- **v2:** one ward, one established rival, **twelve months** (all of 1927), starting with the boss and two hoods. Four areas with ranked job lists, hoods as capacity, the boss on the map, hiring lieutenants into areas, protection separate from property, and the tutorial lessons. Fixing is kept light (the precinct captain). Three specialists: lawyer, armourer and driver. Change of Plans, react cards, heat, the Wire and the Morning Edition carry over from v1.

*v1 scope:*
**Goal: prove the core loop is fun before building anything else.**
- **One ward, one rival family (the Bootlegger), three lieutenants each side, six months** (Jan–Jun 1927).
- **In:** lieutenant orders (goal + posture), personality deviations, the watch phase with react cards, Change of Plans with telephones and runners, heat with itemised causes, a simple economy (protection + three rackets), ambition, demands and betrayal, the AI rival using the same order system, fog of war on rival lieutenants, the Morning Edition.
- **Out:** politics, elections, trials, laundering, boss vulnerability and succession, the roguelite layer, isometric art (boxes on a grid).
- **Test questions:** Is it fun when lieutenants go off-script? Do Change of Plans moments create tension? Does the newspaper make you care what happened?

---

## 18. Open questions

1. **Deed list.** The full set of deeds and unlocks (§14.1). How many is enough at launch?
2. **Final origin and trait list** (§6.6).
3. **Change of Plans tuning** (§5.5). Is 1–2 per month right? Which events trigger one?
4. **Job lists.** How many jobs per area before it feels like micromanagement? Can hoods be lent between areas mid-month?
5. **Specialist roster.** Which specialists are in the full game, and can a specialist ever become a lieutenant (or the reverse)?
6. **Boss attention.** Is a shared crew enough of a limit on the boss running everything, or does the boss also need limited attention per month?
7. **Engine for the full game.** Godot or a web engine (e.g. PixiJS) for the isometric map. Decide after the vertical slice.

---

## Appendix A: decisions log (grilling session, 2026-11-19)

| Topic | Decision |
|---|---|
| Setting | Prohibition era, with modern design. |
| Core pillars | People > Orders/Watch > Economy > Politics |
| Platform | Design doc first, then a browser prototype of the core loop; final engine decided later |
| Opponents | Single-player vs AI rivals. **No multiplayer.** |
| Player family | Blank slate: choose the boss's origin + traits at the start |
| Content | Violence and vice stay in; shown Hays Code style (implied, off-screen, cutaways) |
| Art | Isometric city, pulp-illustration portraits, period-paper UI |
| Politics | Medium depth (elections, officials, trials), paid for by fewer rivals |
| Run length | 3–5 hours, procedurally generated city |
| Command model | Hybrid: lieutenants by default, costly direct orders |
| Watch phase | Fast map simulation + 2–5 react cards per month |
| Turn length | Monthly |
| Mid-month response | Change of Plans: big events pause the month for re-issuing orders; speed depends on telephones and runners |
| Boss creation | One origin + two traits |
| Meta-progression | New options, not power. Deeds unlock content, legacy points buy cosmetics and convenience, Counts I–X difficulty ladder, every ending a front page |
| Zoom | City → ward → street, with fog of war at every level |
| Lieutenant cap | 6 |
| Tutorial | First run with lessons switched on ("The Nephew"): learn each area in turn, hiring a lieutenant for each |
| Run start | Every run starts from the bottom: the boss, two or three hoods, no lieutenants. Origins change what you start with |
| Orders | Four areas (Muscle, Property, Vice, Fixing), each run by the boss or a lieutenant, with ranked standing jobs, optional targets and hoods as capacity |
| Specialists | Lawyer, accountant, armourer, doctor, driver, brewmaster and newsman serve the whole family. No crew, outside the lieutenant cap, and dangerous if they turn |
| Protection vs property | Separate: protection is shops that pay you; property is buildings you own, which can hold back rooms and telephones |
| Next step | Vertical slice v2: rebuild the prototype around areas, jobs and starting from nothing (§17) |
| Anti-snowball | Federal attention by share + internal ambition + rival coalitions |
| Clock | Hard end at Repeal, Dec 1933 |
| Boss | Character on the map + succession system |
| Tone | Pulpy and wry |
| Intel | Fog of war + informants with confidence ratings + moles both ways |
| Rivals | 2–3, archetype + random traits |
| Violence | Auto-resolve + one decisive react card |
| City | Procedural fictional city |
| Win conditions | Elimination · Own the City · Go Legit · Legacy score at Repeal |
