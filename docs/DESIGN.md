# CAPO — Game Design Document

*v0.1 · working draft · Prohibition-era crime management*

---

## 1. Pitch

It's 1927. Booze is illegal, everyone wants it, and the city is up for grabs.

You run a crime family from the first speakeasy to Repeal in December 1933. Each turn you give orders to your **lieutenants** and meet the people who matter. Then you **watch the month play out** across the city and step in when something goes wrong, which it will, because your lieutenants have their own ideas.

A run is **3–5 hours** in a **procedurally generated city** against **2–3 rival families**. You win by wiping out the opposition, by owning city hall, by getting out clean, or by surviving to Repeal with the strongest legacy.

**Inspiration:** the crime-management genre of the late 90s, with its orders phase followed by a watch phase. We keep that core and rebuild the parts that frustrated players: micromanagement, opaque systems, passive AI and a won game that still needs hours of cleanup.

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
- **Turn length:** **one month**, which gives about 84 turns at 2–4 minutes each, or roughly 3–5 hours. *(See open question Q1: weekly turns are more faithful but don't fit the run length.)*
- **Fixed historical events** give each run its shape. These are fictionalised and contain no real people:
  - **Oct 1929: the Crash.** Legit businesses lose value, desperate people make good recruits, and gambling and loansharking boom.
  - **1931: a federal tax case** against a big-name boss sets precedent, and unexplained wealth becomes a serious risk from then on.
  - **1932–33: Repeal approaches.** Booze margins slide each month. Families still relying on liquor in 1933 are in trouble.
- **The city:** about 12–16 wards, procedurally generated each run. Each run gets a new layout, new businesses, new officials and new rival leaders.

## 5. The turn loop

### 5.1 The Morning Edition (report, about 30s)
The month opens with a newspaper front page in a wry, pulpy voice:
- **Headlines** about what happened, written with a slant (the press may be on someone's payroll).
- **The Ledger:** income, expenses, dirty and clean cash, all fully itemised.
- **The Wire:** intel reports from informants, each with a confidence rating: *Rumour / Likely / Confirmed*.
- **Trouble at Home:** lieutenant demands, grudges and warning signs.

### 5.2 Orders (planning, about 1–2 min)
**Lieutenant directives.** Each lieutenant gets:
- A **goal**: *Expand* (ward), *Hold*, *Earn* (racket), *Hit* (target), *Escort*, *Lie low*, *Recruit*
- A **posture**: *Quiet / Firm / Loud*, which sets how much violence and heat they're allowed
- **Resources**: crew size, cash, weapons, vehicles

The lieutenant then makes their own tactical decisions **based on their personality**. A *Hothead* told to "Expand, Firm" may still torch a rival's speakeasy, and a *Cautious* lieutenant told to go Loud may hold back.

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

### 5.5 Fallout (automatic)
Loyalty, Ambition, Heat, Federal Attention and official relationships update, the AI families commit their next orders, and the next newspaper is written.

---

## 6. People

### 6.1 Lieutenants (3–6)
The core of the game. Each one has:
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

### 6.4 The Boss and succession
**You are a character on the map.** The boss can be shot, arrested, convicted or indicted for tax evasion.
- When the boss falls, **succession** happens: the lieutenant with the strongest claim (Authority, Loyalty, crew size) takes over. **That may be the one who arranged it.**
- The run continues with the new boss's traits, and loyalties reshuffle. Some lieutenants won't accept the new boss and leave.
- **Game over** only if no viable successor exists or the family collapses.

---

## 7. The economy

### 7.1 Wards and businesses
Each ward has 4–8 businesses. A business has a **front** (barber, laundry, cigar shop, garage, club) and a **back room** slot:
- **Speakeasy** · **gambling den** · **numbers bank** · **still / brewery** · **warehouse** · **brothel** (optional; depends on content rating, see Q6)

**Rackets:** protection · bootlegging (produce → transport → sell) · gambling · numbers · loansharking · and later, unions, construction and legit holdings.

### 7.2 Dirty and clean money
- Most income is **dirty**. Bribes and hood wages can be paid with dirty cash, but businesses, campaign donations and going legit need **clean** cash.
- **Laundering** goes through fronts, each with a capacity per month. An accountant improves the rate.
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
- Art direction is not yet decided (see Q3).

---

## 14. Built for multiplayer later
The single-player game against AI comes first, but the architecture should allow **async multiplayer**:
- **Orders are data.** Player and AI submit the same order format.
- **Simultaneous, deterministic resolution** from a seeded RNG, so the same orders and seed always give the same month.
- AI families are **just players** using the same interface.
- The hard part is react cards in multiplayer (see Q2).

---

## 15. Open questions

1. **Turn length.** Monthly (fits 3–5 hours) vs weekly (closer to the original, but about 360 turns). Could weekly work with fast-forward through quiet weeks?
2. **React cards in multiplayer.** Contingency orders set ahead ("if tailed, lose them")? Timed live prompts? Or the lieutenant's personality decides?
3. **Art direction and camera.** Top-down 2D map, isometric, or stylised graphic board?
4. **Does the player's family have an archetype**, with a starting perk and trait, or is it a blank slate?
5. **Lieutenant cap.** Is 6 the right maximum before it turns back into micromanagement?
6. **Content limits.** How explicit is the violence? Are vice rackets in or out?
7. **Meta-progression between runs**, like a roguelite (unlock archetypes, starting lieutenants), or none?
8. **Tutorial.** A scripted first run or a guided sandbox?

---

## Appendix A: decisions log (grilling session, 2026-11-19)

| Topic | Decision |
|---|---|
| Setting | Prohibition era, with modern design. |
| Core pillars | People > Orders/Watch > Economy > Politics |
| Platform | Design doc only for now |
| Opponents | AI rivals first, multiplayer-ready architecture |
| Politics | Medium depth (elections, officials, trials), paid for by fewer rivals |
| Run length | 3–5 hours, procedurally generated city |
| Command model | Hybrid: lieutenants by default, costly direct orders |
| Watch phase | Fast map simulation + 2–5 react cards per month |
| Anti-snowball | Federal attention by share + internal ambition + rival coalitions |
| Clock | Hard end at Repeal, Dec 1933 |
| Boss | Character on the map + succession system |
| Tone | Pulpy and wry |
| Intel | Fog of war + informants with confidence ratings + moles both ways |
| Rivals | 2–3, archetype + random traits |
| Violence | Auto-resolve + one decisive react card |
| City | Procedural fictional city |
| Win conditions | Elimination · Own the City · Go Legit · Legacy score at Repeal |
