// Family AI. Calloway uses it every month; the autoplay script uses it for the
// Russo side too. It builds ranked job lists in the same format the player
// does, and only targets what its people could know about.

import { chance } from './rng';
import { blankJob, makeHood } from './setup';
import type { FamilyId, GameState, JobKind, Person, Posture } from './types';
import {
  JOBS,
  active,
  allBlocks,
  branchesOf,
  blockCentre,
  blockFree,
  carPrice,
  isHome,
  crewSize,
  dist,
  gunPrice,
  has,
  hoodPrice,
  members,
  other,
  owned,
  price,
  protectedBy,
  rackets,
  runner,
  targets,
  gunHands,
} from './util';

/** How often a family that's at odds leans on one of the other side's doors, per month. */
export const LEAN_CHANCE = 0.6;
/** At most this many of the other side's doors leaned on in a month. */
export const LEANS_PER_MONTH = 2;

/** How angry (see Family.provoked) a family must be before it takes buildings by force. */
export const TAKEOVER_ANGER = 2;

export function planFamily(s: GameState, f: FamilyId): void {
  const fam = s.families[f];
  const foe = other(f);
  const aggressive = f === 'rival' ? fam.notice : s.families.rival.notice;
  const id = () => `j${s.nextId++}`;

  for (const p of members(s, f))
    p.jobs = p.jobs.filter((j) => !j.done && (!j.target || targets(s, f, j.kind).some((t) => t.id === j.target)));

  const ensure = (kind: JobKind, want: boolean) => {
    const r = runner(s, f, JOBS[kind].branch);
    const has = r.jobs.some((j) => j.kind === kind);
    if (want && !has) r.jobs.push(blankJob(id(), kind));
    if (!want && has) r.jobs = r.jobs.filter((j) => j.kind !== kind);
  };
  const bars = rackets(s, f, 'speakeasy').length;
  const stills = rackets(s, f, 'still').length;
  ensure('collect', protectedBy(s, f).length > 0);
  ensure('runSpeak', bars > 0);
  ensure('runGamble', rackets(s, f, 'gambling').length > 0);
  ensure('distill', stills > 0);
  ensure('supply', stills > 0 && bars > 0 && fam.cars > 0);
  ensure('payoff', fam.heat > 25 && fam.cash > 400);

  const oneOff = (kind: JobKind, target: string | null, posture: Posture = 'firm', max = 1) => {
    const r = runner(s, f, JOBS[kind].branch);
    if (r.jobs.filter((j) => j.kind === kind && !JOBS[kind].ongoing).length >= max || r.jobs.some((j) => j.target === target && target))
      return;
    r.jobs.push(blankJob(id(), kind, target, posture));
  };
  const home = runner(s, f, 'protection');
  const near = <T extends { x: number; y: number }>(xs: T[], from: Person = home) => xs.sort((a, b) => dist(a, from) - dist(b, from));

  // Protection: sign up the nearest free shop; once at war, muscle in on theirs.
  // Before the war, Calloway keeps to the east end of the ward.
  const inReach = (b: { x: number }) => aggressive || f === 'player' || b.x >= s.width / 2;
  const free = near(s.buildings.filter((b) => !isHome(b) && b.owner === null && b.protectedBy === null && inReach(b)));
  for (const b of free.slice(0, 2)) if (dist(b, home) <= 7) oneOff('signup', b.id, home.traits.includes('hothead') ? 'loud' : 'firm', 2);
  // Homes come a block at a time: the nearest block with the most doors that pay nobody.
  const blocks = allBlocks(s)
    .map((id) => ({ id, at: blockCentre(s, id), n: blockFree(s, id).filter(isHome).length }))
    .filter((x) => x.n >= 2 && inReach(x.at) && dist(x.at, home) <= 6)
    .sort((a, b) => dist(a.at, home) - a.n - (dist(b.at, home) - b.n));
  if (blocks[0] && crewSize(s, home) >= 2) oneOff('block', blocks[0].id, 'firm');
  // Once at odds, now and then lean on one of theirs: pressure, not shooting.
  if (aggressive) {
    const r = runner(s, f, 'protection');
    for (const b of near(protectedBy(s, foe)).slice(0, LEANS_PER_MONTH)) {
      if ((fam.provoked > 0 || chance(s, LEAN_CHANCE)) && !r.jobs.some((j) => j.target === b.id))
        r.jobs.push(blankJob(id(), 'signup', b.id, 'firm'));
    }
  }

  // Property: buy when there's money; take by force once at war.
  const acq = runner(s, f, 'acquisitions');
  // An established outfit buys slowly; the newcomer buys whenever it can.
  const cap = f === 'rival' ? (fam.notice ? 8 : 5) : 99;
  const margin = f === 'rival' ? 800 : 250;
  const forSale = near(
    s.buildings.filter((b) => b.owner === null && b.protectedBy !== foe && inReach(b) && fam.cash > price(b, f) + margin),
    acq,
  );
  if (forSale[0] && owned(s, f).length < cap && (f === 'player' || chance(s, 0.25))) oneOff('buy', forSale[0].id);
  // Real violence only while provoked: after we hurt his people or took or wrecked his property.
  if (fam.provoked >= TAKEOVER_ANGER && f === 'rival' && fam.cash > 1200 && chance(s, 0.35)) {
    const prize = near(owned(s, foe), acq)[0];
    if (prize) oneOff('takeover', prize.id, 'loud');
  }
  const bare = owned(s, f).find((b) => !b.racket);
  if (bare && fam.cash > 450 && (f === 'player' || chance(s, 0.4))) oneOff('fitout', bare.id);
  const hq = owned(s, f)[0];
  if (hq && !hq.telephone && fam.cash > 900) oneOff('phone', hq.id);

  // Enforcement: guard the best place if the enemy is close; settle grudges.
  const enf = runner(s, f, 'enforcement');
  const prized = owned(s, f)
    .filter((b) => b.racket)
    .sort((a, b) => Math.min(...active(s, foe).map((p) => dist(p, a)), 99) - Math.min(...active(s, foe).map((p) => dist(p, b)), 99))[0];
  if (aggressive && prized && !enf.jobs.some((j) => j.kind === 'guard')) enf.jobs.push(blankJob(id(), 'guard', prized.id));
  if (fam.grudge) {
    const victim = targets(s, f, 'hit')[0];
    if (victim) oneOff('hit', victim.id, 'loud');
  }

  // Supplies: arm everyone, keep a car, hire enough hoods for the lists.
  const buy = (what: 'hood' | 'gun' | 'car', to?: Person) => {
    const cost = what === 'hood' ? hoodPrice(s, f) : what === 'gun' ? gunPrice(s, f) : carPrice(s, f);
    fam.cash -= cost;
    fam.ledger.push({ label: what === 'hood' ? 'New hood' : what === 'gun' ? 'A pistol' : 'A car', amount: -cost });
    if (what === 'hood') {
      // The player's side picks the best of the hiring hall; Calloway takes whoever walks in.
      const pickd =
        f === 'player'
          ? [...s.market].sort((a, b) => b.muscle + b.brains + b.nerve + b.charm - (a.muscle + a.brains + a.nerve + a.charm))[0]
          : makeHood(s, `h${s.nextId++}`, f, to!.id, has(s, f, 'recruiter') ? 1 : 0);
      if (!pickd) {
        fam.cash += cost;
        fam.ledger.pop();
        return;
      }
      pickd.family = f;
      pickd.under = to!.id;
      s.hoods.push(pickd);
      s.market = s.market.filter((x) => x !== pickd);
    } else if (what === 'gun') fam.guns++;
    else fam.cars++;
  };
  if (fam.cars < 1 && fam.cash > carPrice(s, f) + 600) buy('car');
  for (let i = 0; i < 6; i++) {
    const short = members(s, f)
      .filter((p) => p.status === 'active')
      .map((p) => ({ p, gap: p.jobs.reduce((n, j) => n + (JOBS[j.kind].ongoing ? 1 : j.kind === 'takeover' ? 4 : 2), 0) - crewSize(s, p) }))
      .sort((a, b) => b.gap - a.gap)[0];
    if (!short || short.gap <= 0 || fam.cash < hoodPrice(s, f) + 250) break;
    if (f === 'player' && !s.market.length) break;
    buy('hood', short.p);
  }
  while (fam.guns < gunHands(s, f) && fam.cash > gunPrice(s, f) + 300) buy('gun');

  // Standing orders for idle hoods: whoever runs Protection drums up business; everyone else watches the turf.
  for (const p of members(s, f)) p.idle = branchesOf(s, p).includes('protection') ? 'canvass' : 'patrol';

  // Ongoing work first, then one-off jobs.
  for (const p of members(s, f)) p.jobs.sort((a, b) => Number(!JOBS[a.kind].ongoing) - Number(!JOBS[b.kind].ongoing));
  fam.grudge = false;
  fam.provoked = Math.max(0, fam.provoked - 1);
}
