// The month engine (v2). Each person runs a ranked list of jobs across the
// branches they hold. Hoods and cars are handed out from the top of each list.
// A month runs day by day; any day can raise a Card the player must answer.

import { planFamily } from './ai';
import { advanceLessons } from './lessons';
import { chance, int, pick, rand } from './rng';
import { NICKS, POOL, blankJob, freshMarket, makeHood, makePerson, newGame, notableHood, streetOf } from './setup';
import type {
  Branch,
  Building,
  Card,
  CardOption,
  FamilyId,
  GameState,
  Hood,
  Job,
  JobKind,
  Person,
  Posture,
  ScheduledEvent,
  SpecialistKind,
} from './types';
import {
  BRANCHES,
  DAYS,
  FITOUT_COST,
  INCOME,
  PROMOTE_XP,
  onTurf,
  crewOf,
  crewSize,
  hood,
  hoodFirst,
  hoodLabel,
  ready,
  squadNames,
  JOBS,
  LIQUOR_PER_BAR,
  LT_CAP,
  MARKET_LIQUOR,
  MAX_BRANCHES,
  PHONE_COST,
  REWARD_COST,
  SPECIALISTS,
  STILL_OUTPUT,
  WAGE,
  WHOLESALE_LIQUOR,
  active,
  bossOf,
  branchesOf,
  building,
  carPrice,
  dist,
  first,
  gunPrice,
  has,
  hoodPrice,
  jobTitle,
  label,
  lieutenants,
  members,
  monthName,
  other,
  owned,
  person,
  price,
  protectedBy,
  protectedHomes,
  protectedShops,
  rackets,
  targets,
  totalHoods,
  gunHands,
  blockFree,
  blockName,
  blockOpen,
  blockCentre,
  isBlockId,
  isHome,
  stopsOf,
} from './util';

// ---------------------------------------------------------------- small helpers

const HEAT: Record<Posture, number> = { quiet: 1, firm: 4, loud: 9 };
/** Sign-up odds next to (or away from) our turf, and the extra days a job takes off it. */
export const TURF_BONUS = 0.15;
export const OFF_TURF_DAYS = 2;
/** Tenants say yes more easily than shopkeepers. */
export const HOME_EASE = 0.15;
const FORCE: Record<Posture, number> = { quiet: 0.8, firm: 1, loud: 1.3 };

function log(s: GameState, text: string, family: FamilyId | null): void {
  s.run?.log.push({ day: s.run.day, text, family });
}
function story(s: GameState, headline: string, body: string, weight: number): void {
  s.run?.news.push({ headline, body, weight });
}
export function addHeat(s: GameState, f: FamilyId, n: number, why: string): void {
  const fam = s.families[f];
  const before = fam.heat;
  fam.heat = Math.max(0, Math.min(100, fam.heat + n));
  if (fam.heat !== before) fam.heatLog.push({ label: why, amount: fam.heat - before });
}
export function spend(s: GameState, f: FamilyId, n: number, why: string): void {
  if (!n) return;
  s.families[f].cash -= n;
  s.families[f].ledger.push({ label: why, amount: -n });
}
function earn(s: GameState, f: FamilyId, n: number, why: string): void {
  if (!n) return;
  s.families[f].cash += n;
  s.families[f].ledger.push({ label: why, amount: n });
}
function card(s: GameState, c: Omit<Card, 'id' | 'day'>): void {
  const run = s.run!;
  run.queue.push({ ...c, id: run.nextCardId++, day: run.day });
}
const newId = (s: GameState) => `j${s.nextId++}`;
const runnerOf = (s: GameState, job: Job) => s.people.find((p) => p.jobs.includes(job));

/** Anyone who can be on a job: a hood, or the runner themselves. */
type Worker = { id: string; muscle: number; brains: number; nerve: number; charm: number };
const statOf = (w: Worker, kind: JobKind) => w[JOBS[kind].stat];
const workers = (s: GameState, ids: string[]): Worker[] =>
  ids.map((id) => hood(s, id) ?? person(s, id)).filter((w): w is Hood | Person => !!w);
/** The squad's best man at this kind of work sets the pace. */
function squadStat(s: GameState, j: Job, stat?: 'muscle' | 'brains' | 'nerve' | 'charm'): number {
  const ws = workers(s, j.squad);
  if (!ws.length) return 5;
  return Math.max(...ws.map((w) => (stat ? w[stat] : statOf(w, j.kind))));
}
const doormen = (n: number): Worker[] =>
  Array.from({ length: n }, (_, i) => ({ id: `door${i}`, muscle: 5, brains: 5, nerve: 5, charm: 5 }));

function gunFactor(s: GameState, f: FamilyId): number {
  const armed = Math.min(1, s.families[f].guns / Math.max(1, gunHands(s, f)));
  return (0.55 + 0.45 * armed) * (has(s, f, 'armourer') ? 1.15 : 1);
}
/** Fighting strength of a team: every man counts, by his own muscle. */
function force(s: GameState, f: FamilyId, team: Worker[], leader: Person | null, posture: Posture): number {
  const nerve = leader?.nerve ?? 5;
  return team.reduce((n, w) => n + (1 + w.muscle / 10), 0) * FORCE[posture] * gunFactor(s, f) + nerve * 0.25;
}

/** A job done well: everyone on it learns something. */
function seasoned(s: GameState, j: Job, stat?: 'muscle' | 'brains' | 'nerve' | 'charm'): void {
  for (const id of j.squad) {
    const h = hood(s, id);
    if (!h || h.status !== 'active') continue;
    h.xp++;
    const st = stat ?? JOBS[j.kind].stat;
    if (h[st] < 9 && chance(s, 0.3)) {
      h[st]++;
      if (h.family === 'player') log(s, `${hoodFirst(h)} is getting good at this (${st} ${h[st]}).`, 'player');
    }
    if (h.xp === PROMOTE_XP && h.family === 'player') log(s, `${hoodLabel(h)} has earned some respect: lieutenant material now.`, 'player');
  }
}

// ---------------------------------------------------------------- orders API (between months)

/** An order the player could give about one target (a building or a rival), e.g. from the map. */
export interface TargetOrder {
  kind: JobKind;
  target: string;
  /** Who would carry it out: whoever runs that job's branch. */
  runner: string;
  /** If it's already on someone's list: who, and which job. */
  queued: { person: string; job: string } | null;
}

/** Every order that makes sense about this target right now, in job-table order. */
export function ordersFor(s: GameState, targetId: string): TargetOrder[] {
  const out: TargetOrder[] = [];
  for (const kind of Object.keys(JOBS) as JobKind[]) {
    if (JOBS[kind].target === 'none') continue;
    if (!targets(s, 'player', kind).some((t) => t.id === targetId)) continue;
    let queued: TargetOrder['queued'] = null;
    for (const p of members(s, 'player')) {
      const j = p.jobs.find((x) => x.kind === kind && x.target === targetId && !x.done);
      if (j) queued = { person: p.id, job: j.id };
    }
    out.push({ kind, target: targetId, runner: s.families.player.branches[JOBS[kind].branch], queued });
  }
  return out;
}

export function addJob(s: GameState, personId: string, kind: JobKind, target: string | null, posture: Posture = 'firm'): Job | null {
  const p = person(s, personId);
  if (!p || p.family !== 'player') return null;
  if (!branchesOf(s, p).includes(JOBS[kind].branch)) return null;
  if (JOBS[kind].target === 'none' && p.jobs.some((j) => j.kind === kind)) return null;
  if (p.jobs.some((j) => j.kind === kind && j.target === target)) return null;
  const j = blankJob(newId(s), kind, target, posture);
  p.jobs.push(j);
  allocate(s, 'player');
  return j;
}

export function removeJob(s: GameState, personId: string, jobId: string): void {
  const p = person(s, personId);
  if (!p) return;
  p.jobs = p.jobs.filter((j) => j.id !== jobId);
  allocate(s, p.family);
}

export function moveJob(s: GameState, personId: string, jobId: string, dir: -1 | 1): void {
  const p = person(s, personId);
  if (!p) return;
  const i = p.jobs.findIndex((j) => j.id === jobId);
  const k = i + dir;
  if (i < 0 || k < 0 || k >= p.jobs.length) return;
  [p.jobs[i], p.jobs[k]] = [p.jobs[k], p.jobs[i]];
  allocate(s, p.family);
}

export function setPosture(s: GameState, personId: string, jobId: string, posture: Posture): void {
  const j = person(s, personId)?.jobs.find((x) => x.id === jobId);
  if (j) j.posture = posture;
}

export function canAssign(s: GameState, f: FamilyId, b: Branch, personId: string): string | null {
  const p = person(s, personId);
  if (!p || p.family !== f) return 'Not one of ours.';
  if (p.role === 'boss') return null;
  const has = branchesOf(s, p);
  if (has.includes(b)) return null;
  if (has.length >= MAX_BRANCHES) return `${first(p)} already runs ${MAX_BRANCHES} branches.`;
  return null;
}

/** Hand a branch (and its jobs) to someone. */
export function assignBranch(s: GameState, f: FamilyId, b: Branch, personId: string): string | null {
  const why = canAssign(s, f, b, personId);
  if (why) return why;
  const fam = s.families[f];
  const from = person(s, fam.branches[b]);
  const to = person(s, personId)!;
  if (from === to) return null;
  fam.branches[b] = to.id;
  if (from) {
    const moving = from.jobs.filter((j) => JOBS[j.kind].branch === b);
    from.jobs = from.jobs.filter((j) => JOBS[j.kind].branch !== b);
    to.jobs.push(...moving);
  }
  allocate(s, f);
  return null;
}

/** Move one hood into someone else's crew (between months only). */
export function moveHood(s: GameState, hoodId: string, toId: string): void {
  const h = hood(s, hoodId);
  const p = person(s, toId);
  if (!h || !p || h.family !== p.family || s.run || p.status === 'dead' || p.status === 'defected') return;
  h.under = p.id;
  allocate(s, p.family);
}

/** Move up to n working hoods from one crew to another. */
export function transferHoods(s: GameState, fromId: string, toId: string, n = 1): void {
  const a = person(s, fromId);
  if (!a) return;
  for (const h of ready(s, a).slice(0, n)) moveHood(s, h.id, toId);
}

/** What a hood off the market costs. Notables cost more. */
export function hoodCost(s: GameState, h: Hood): number {
  return POOL.some((p) => p.name === h.name) ? 200 : hoodPrice(s, h.family);
}

/**
 * Take on a hood. The player picks from the hiring hall; the AI takes
 * whoever walks in. New hoods join the given person's crew (the boss by default).
 */
export function hireHood(s: GameState, f: FamilyId, marketId?: string, toId?: string): string | null {
  const fam = s.families[f];
  const to = person(s, toId ?? fam.bossId);
  if (!to || to.family !== f) return 'Nobody to take them on.';
  let h: Hood | undefined;
  if (f === 'player') {
    h = s.market.find((x) => x.id === marketId);
    if (!h) return 'They found other work.';
  } else h = makeHood(s, `h${s.nextId++}`, f, to.id, has(s, f, 'recruiter') ? 1 : 0);
  const cost = hoodCost(s, h);
  if (fam.cash < cost) return 'Not enough cash.';
  spend(s, f, cost, `Took on ${h.name}`);
  h.family = f;
  h.under = to.id;
  s.hoods.push(h);
  s.market = s.market.filter((x) => x !== h);
  allocate(s, f);
  return null;
}

export type Purchase = 'gun' | 'car';

export function priceOf(s: GameState, what: Purchase): number {
  return what === 'gun' ? gunPrice(s, 'player') : carPrice(s, 'player');
}

export function purchase(s: GameState, f: FamilyId, what: Purchase): string | null {
  const fam = s.families[f];
  const cost = what === 'gun' ? gunPrice(s, f) : carPrice(s, f);
  if (fam.cash < cost) return 'Not enough cash.';
  if (what === 'gun') {
    fam.guns++;
    spend(s, f, cost, has(s, f, 'armourer') ? 'A pistol from the armourer' : 'A pistol, no questions asked');
  } else {
    fam.cars++;
    spend(s, f, cost, has(s, f, 'mechanic') ? 'A car from the mechanic' : 'A used sedan');
  }
  allocate(s, f);
  return null;
}

export type BossAction =
  | { kind: 'promote'; hood: string }
  | { kind: 'enlist'; pool: number }
  | { kind: 'specialist'; which: SpecialistKind }
  | { kind: 'grant'; lt: string }
  | { kind: 'reward'; lt: string }
  | { kind: 'demote'; lt: string };

/** What a lieutenant thinks of being sent back to the street. */
export const DEMOTE_LOYALTY = 25;

export function canAct(s: GameState, a: BossAction): string | null {
  const fam = s.families.player;
  if (s.run || s.over) return 'Not now.';
  // Taking on someone who came asking is free; everything else is a meeting.
  if (a.kind === 'enlist') return s.candidates.includes(a.pool) ? null : 'Not available.';
  if (fam.actions <= 0) return 'No meetings left this month.';
  switch (a.kind) {
    case 'promote': {
      const h = hood(s, a.hood);
      if (!h || h.family !== 'player') return 'Not one of ours.';
      if (h.status !== 'active') return 'Not while they are laid up or inside.';
      if (h.xp < PROMOTE_XP) return `Needs more experience (${h.xp} of ${PROMOTE_XP}).`;
      if (lieutenants(s, 'player').length >= LT_CAP) return 'Six lieutenants is the limit.';
      return null;
    }
    case 'specialist':
      if (fam.specialists.includes(a.which)) return 'Already on the payroll.';
      return fam.cash >= SPECIALISTS[a.which].retainer ? null : 'Not enough cash for the first month.';
    case 'grant': {
      const l = person(s, a.lt);
      if (!l?.demand) return 'Nothing to grant.';
      if (l.demand.kind === 'building' && building(s, l.demand.buildingId)?.owner !== 'player') return 'That building is no longer ours.';
      return null;
    }
    case 'reward':
      return fam.cash >= REWARD_COST ? null : 'Not enough cash.';
    case 'demote': {
      const l = person(s, a.lt);
      return l && l.family === 'player' && l.role === 'lt' && l.status !== 'dead' && l.status !== 'defected'
        ? null
        : 'Not one of our lieutenants.';
    }
  }
}

export function bossAction(s: GameState, a: BossAction): string {
  const why = canAct(s, a);
  if (why) return why;
  const fam = s.families.player;
  switch (a.kind) {
    case 'enlist': {
      s.candidates = s.candidates.filter((c) => c !== a.pool);
      const h = notableHood(a.pool, `h${s.nextId++}`, 'player', fam.bossId);
      s.hoods.push(h);
      allocate(s, 'player');
      advanceLessons(s);
      return `${hoodLabel(h)} is in your crew now.`;
    }
    case 'promote': {
      fam.actions--;
      const h = hood(s, a.hood)!;
      const boss = bossOf(s, 'player');
      // Everybody who gets made gets a name on the street.
      const nick =
        h.nickname ||
        pick(
          s,
          NICKS.filter((n) => !s.people.some((p) => p.nickname === n)),
        );
      const l = makePerson(`lt${s.nextId++}`, 'player', 'lt', h.name, nick, [h.muscle, h.brains, h.nerve, h.charm], [...h.traits], {
        x: boss.homeX,
        y: boss.homeY,
      });
      l.loyalty = Math.min(100, h.loyalty + 5);
      l.ambition = 20 + (h.traits.includes('ambitious') ? 15 : 0);
      s.people.push(l);
      s.hoods = s.hoods.filter((x) => x !== h);
      allocate(s, 'player');
      advanceLessons(s);
      return `${label(l)} is a lieutenant now. Give them a branch or two, and some hoods of their own.`;
    }
    case 'specialist': {
      fam.actions--;
      fam.specialists.push(a.which);
      spend(s, 'player', SPECIALISTS[a.which].retainer, `${SPECIALISTS[a.which].title}'s first retainer`);
      advanceLessons(s);
      return `${SPECIALISTS[a.which].name} is now the family's ${SPECIALISTS[a.which].title.toLowerCase()}.`;
    }
    case 'grant': {
      fam.actions--;
      const l = person(s, a.lt)!;
      const d = l.demand!;
      if (d.kind === 'raise') l.cut += d.amount;
      else l.ownBuilding = d.buildingId;
      l.loyalty = Math.min(100, l.loyalty + (d.kind === 'raise' ? 15 : 20));
      l.ambition = Math.max(0, l.ambition - 10);
      l.demand = null;
      if (l.loyalty >= 35) l.plotting = false;
      advanceLessons(s);
      return `${first(l)} got what they asked for. For now.`;
    }
    case 'reward': {
      fam.actions--;
      const l = person(s, a.lt)!;
      spend(s, 'player', REWARD_COST, `Envelope for ${first(l)}`);
      l.loyalty = Math.min(100, l.loyalty + 10);
      return `${first(l)} pockets the envelope with a nod.`;
    }
    case 'demote': {
      fam.actions--;
      demote(s, person(s, a.lt)!);
      advanceLessons(s);
      return 'Done. Nobody at the table looks at him.';
    }
  }
}

/**
 * Send a lieutenant back to the street: his branches (and their jobs) and his
 * crew come back to the boss, and he becomes a hood in the boss's crew, with
 * the experience to be made again one day. He won't forget it.
 */
export function demote(s: GameState, l: Person): Hood {
  const fam = s.families[l.family];
  for (const b of branchesOf(s, l)) assignBranch(s, l.family, b, fam.bossId);
  for (const h of crewOf(s, l)) h.under = fam.bossId;
  const h: Hood = {
    id: `h${s.nextId++}`,
    name: l.name,
    nickname: l.nickname,
    family: l.family,
    under: fam.bossId,
    muscle: l.muscle,
    brains: l.brains,
    nerve: l.nerve,
    charm: l.charm,
    traits: [...l.traits],
    loyalty: Math.max(0, l.loyalty - DEMOTE_LOYALTY),
    xp: PROMOTE_XP,
    status: l.status === 'wounded' || l.status === 'jailed' ? l.status : 'active',
    recover: l.recover,
    bio: `Ran ${l.nickname ? `things as "${l.nickname}"` : 'a crew'} until the boss took it back. Hasn't forgotten.`,
  };
  s.people = s.people.filter((p) => p !== l);
  s.hoods.push(h);
  allocate(s, l.family);
  return h;
}

/** Let a hood go, between months. One with loose lips talks on the way out. */
export function fireHood(s: GameState, f: FamilyId, id: string): string | null {
  if (s.run) return 'Not in the middle of a month.';
  const h = hood(s, id);
  if (!h || h.family !== f) return 'Not one of ours.';
  s.hoods = s.hoods.filter((x) => x !== h);
  if (h.traits.includes('looselips')) addHeat(s, f, FIRED_TALK, `${h.name}, let go, is telling everyone why`);
  allocate(s, f);
  return null;
}
export const FIRED_TALK = 4;

// ---------------------------------------------------------------- allocation

export function needFor(s: GameState, f: FamilyId, j: Job, p: Person): number {
  const k = j.kind;
  let n: number;
  switch (k) {
    case 'collect':
      n = Math.ceil(stopsOf(protectedBy(s, f)) / 5);
      break;
    case 'signup':
      n = building(s, j.target)?.protectedBy === other(f) ? 3 : 1;
      break;
    case 'block':
      n = 2;
      break;
    case 'guard':
      n = 2;
      break;
    case 'hit':
    case 'wreck':
      n = 3;
      break;
    case 'takeover':
      n = 4;
      break;
    case 'buy':
    case 'fitout':
    case 'phone':
      n = 1;
      break;
    case 'runSpeak':
      n = rackets(s, f, 'speakeasy').length;
      break;
    case 'runGamble':
      n = rackets(s, f, 'gambling').length;
      break;
    case 'distill':
      n = rackets(s, f, 'still').length;
      break;
    case 'supply':
      n = rackets(s, f, 'still').length && rackets(s, f, 'speakeasy').length ? 1 : 0;
      break;
    case 'payoff':
      n = 0;
      break;
  }
  if (JOBS[k].risky && p.traits.includes('cautious')) n = Math.max(1, n - 1);
  return n;
}

/**
 * Hand out hoods (per person) and cars (per family) from the top of each list
 * down. Each job takes the free hands best suited to it: the best talker on a
 * sign-up, the toughest on a takeover.
 */
export function allocate(s: GameState, f: FamilyId): void {
  let cars = s.families[f].cars;
  const runners = members(s, f).sort((a, b) => (a.role === 'boss' ? -1 : b.role === 'boss' ? 1 : 0));
  for (const p of runners) {
    // The runner works too: a crew of two is three pairs of hands.
    const pool: Worker[] = p.status === 'active' ? [...ready(s, p), p] : [];
    let left = pool.length;
    for (const j of p.jobs) {
      if (j.done) continue;
      j.need = needFor(s, f, j, p);
      j.hoods = 0;
      j.squad = [];
      j.car = false;
      j.stalled = null;
      if (p.status !== 'active') {
        j.stalled = p.status === 'wounded' ? `${first(p)} is laid up` : `${first(p)} is inside`;
        continue;
      }
      if (j.target && !targets(s, f, j.kind).some((t) => t.id === j.target)) {
        j.stalled = 'Target no longer valid';
        continue;
      }
      if (j.need === 0) continue;
      const cost =
        j.kind === 'buy' ? price(building(s, j.target)!, f) : j.kind === 'fitout' ? FITOUT_COST : j.kind === 'phone' ? PHONE_COST : 0;
      // Only jobs that cost money wait for it: collecting must never stall on debt.
      if (cost > 0 && cost > s.families[f].cash) {
        j.stalled = `Needs $${cost} (we have $${Math.max(0, Math.round(s.families[f].cash))})`;
        continue;
      }
      if (JOBS[j.kind].car) {
        if (cars <= 0) {
          j.stalled = 'No car';
          continue;
        }
      }
      const h = Math.min(j.need, left);
      if (!JOBS[j.kind].ongoing && h < j.need) {
        j.stalled = left ? `Needs ${j.need} hands, only ${left} free` : 'Nobody free';
        continue;
      }
      if (h === 0) {
        j.stalled = 'Nobody free';
        continue;
      }
      // Best suited first; the runner only goes if nobody better is free.
      pool.sort((a, b) => statOf(b, j.kind) - statOf(a, j.kind) || (a.id === p.id ? 1 : b.id === p.id ? -1 : 0));
      j.squad = pool.splice(0, h).map((w) => w.id);
      j.hoods = h;
      left -= h;
      if (JOBS[j.kind].car) {
        j.car = true;
        cars--;
      }
    }
  }
}

// ---------------------------------------------------------------- month start

export function startMonth(s: GameState): void {
  if (s.run || s.over) return;
  for (const b of s.buildings) {
    b.raided = false;
    b.refused = false;
  }
  for (const f of ['player', 'rival'] as const) {
    s.families[f].ledger = [];
    s.families[f].heatLog = [];
  }
  s.run = { day: 0, queue: [], scheduled: [], changesLeft: 2, rivalChangesLeft: 2, nextCardId: 1, log: [], news: [] };
  for (const f of ['player', 'rival'] as const) {
    allocate(s, f);
    const fam = s.families[f];
    const payer = members(s, f).find((p) => p.jobs.some((j) => j.kind === 'payoff' && !j.stalled));
    fam.captain = !!payer;
  }
  for (const p of s.people) {
    p.wins = 0;
    p.x = p.homeX;
    p.y = p.homeY;
    for (const j of p.jobs) prepare(s, p, j);
  }
  schedule(s);
}

function prepare(s: GameState, p: Person, j: Job): void {
  j.progress = 0;
  j.checked = false;
  j.x = p.homeX;
  j.y = p.homeY;
  const info = JOBS[j.kind];
  if (info.ongoing) {
    const t = building(s, j.target);
    if (t) {
      j.x = t.x;
      j.y = t.y;
    }
    j.days = 0;
    return;
  }
  j.days = workDays(s, p, j);
}

/** Days a one-off job takes once its squad is there (for a block: at the next door). */
function workDays(s: GameState, p: Person, j: Job): number {
  const info = JOBS[j.kind];
  if (j.kind === 'block') {
    const door = nextDoor(s, j);
    return door ? doorDays(s, p, j, door) : 1;
  }
  const adj = j.posture === 'quiet' ? 1 : j.posture === 'loud' ? -1 : 0;
  // Working off your own turf takes longer: nobody knows you there.
  const t = building(s, j.target);
  const away = (j.kind === 'signup' || j.kind === 'takeover') && t && !onTurf(s, p.family, t, t.id) ? OFF_TURF_DAYS : 0;
  return Math.max(
    1,
    info.work - Math.floor((squadStat(s, j) - 5) / 2) + adj + away + (info.risky && p.traits.includes('cautious') ? 2 : 0),
  );
}

export interface JobPlan {
  /** Day the squad sets out, or null if it won't this month. */
  start: number | null;
  /** Day it should be done (may run past the month). */
  end: number | null;
}

/**
 * A rough plan of a person's month, for the orders screen: hands go to jobs top
 * down, and hands freed by a finished job pick up the next one waiting (as they
 * do in the month itself). Ongoing jobs hold their hands all month. Travel and
 * work days are estimates; cards and fights will change things.
 */
export function forecast(s: GameState, p: Person): { jobs: Record<string, JobPlan>; freeFrom: number[] } {
  const hands = p.status === 'active' ? ready(s, p).length + 1 : 0;
  const free: number[] = Array.from({ length: hands }, () => 0);
  const jobs: Record<string, JobPlan> = {};
  const speedOf = (j: Job) => (JOBS[j.kind].car ? (has(s, p.family, 'mechanic') ? 3 : 2) : 1);
  for (const j of p.jobs) {
    if (j.done) continue;
    const none = { start: null, end: null };
    // Stalls that more hands won't fix (money, a car, the target) stay stalled.
    if (j.stalled && !/hands|Nobody free/.test(j.stalled)) {
      jobs[j.id] = none;
      continue;
    }
    if (JOBS[j.kind].ongoing) {
      let n = j.need;
      for (let i = 0; i < free.length && n > 0; i++) {
        if (free[i] === 0) {
          free[i] = DAYS + 1;
          n--;
        }
      }
      jobs[j.id] = j.need && n < j.need ? { start: 1, end: DAYS } : none;
      continue;
    }
    if (!j.need || j.need > hands) {
      jobs[j.id] = none;
      continue;
    }
    const order = free.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
    const crew = order.slice(0, j.need);
    const begin = crew[crew.length - 1].d;
    if (begin >= DAYS) {
      jobs[j.id] = none;
      continue;
    }
    let length: number;
    const home = { x: p.homeX, y: p.homeY };
    if (isBlockId(j.target)) {
      // Door to door, nearest first.
      let at = home;
      length = 0;
      const doors = blockOpen(s, j.target);
      while (doors.length) {
        doors.sort((a, b) => dist(a, at) - dist(b, at));
        const d = doors.shift()!;
        length += Math.ceil(dist(d, at) / speedOf(j)) + doorDays(s, p, j, d);
        at = d;
      }
      length = Math.max(1, length);
    } else {
      const there = Math.ceil(dist(home, targetPos(s, j)) / speedOf(j));
      length = Math.max(0, there - 1) + workDays(s, p, j);
    }
    const end = begin + length;
    for (const c of crew) free[c.i] = end;
    jobs[j.id] = { start: begin + 1, end };
  }
  return { jobs, freeFrom: free };
}

function schedule(s: GameState): void {
  const run = s.run!;
  const pf = s.families.player;
  const add = (kind: ScheduledEvent['kind'], ref: string | null = null, from = 3, to = 27) =>
    run.scheduled.push({ day: int(s, from, to), kind, ref });
  if (pf.heat >= 15 && chance(s, 0.25 + pf.heat / 150)) add('cop');
  const supply = members(s, 'player')
    .flatMap((p) => p.jobs)
    .find((j) => j.kind === 'supply' && j.hoods);
  if (supply && chance(s, has(s, 'player', 'mechanic') ? 0.25 : 0.5)) add('tail');
  if (s.month > 0) {
    const n = int(s, 1, 2);
    for (let i = 0; i < n; i++)
      add(pick(s, s.families.rival.notice ? (['offer', 'bail', 'snitch'] as const) : (['offer', 'bail'] as const)));
  }
  for (const p of s.people) if (p.plotting && p.status === 'active') add('defect', p.id, 6, 22);
  // Informants: rival moves against us get tipped off a few days early.
  for (const r of active(s, 'rival')) {
    for (const j of r.jobs) {
      if (JOBS[j.kind].ongoing || j.stalled || !targetsPlayer(s, j)) continue;
      const eta = Math.ceil(dist(r, targetPos(s, j)) / (j.car ? 2 : 1)) + j.days;
      if (eta > 3 && chance(s, 0.4 + (r.traits.includes('looselips') ? 0.3 : 0)))
        run.scheduled.push({ day: Math.max(1, eta - 3), kind: 'tip', ref: j.id });
    }
  }
}

function targetsPlayer(s: GameState, j: Job): boolean {
  const b = building(s, j.target);
  if (b) return b.owner === 'player' || b.protectedBy === 'player';
  return person(s, j.target)?.family === 'player';
}

function targetPos(s: GameState, j: Job): { x: number; y: number } {
  if (isBlockId(j.target)) return nextDoor(s, j) ?? blockCentre(s, j.target);
  return building(s, j.target) ?? person(s, j.target) ?? { x: j.x, y: j.y };
}

/** The nearest door on a block job's block still worth knocking on. */
function nextDoor(s: GameState, j: Job): Building | null {
  if (!isBlockId(j.target)) return null;
  const at = { x: j.x, y: j.y };
  return blockOpen(s, j.target).sort((a, b) => dist(a, at) - dist(b, at) || a.id.localeCompare(b.id))[0] ?? null;
}

/** Days at one door of a block job: a home is a quick chat, a shop takes longer. */
function doorDays(s: GameState, p: Person, j: Job, b: Building): number {
  const adj = j.posture === 'quiet' ? 1 : j.posture === 'loud' ? -1 : 0;
  const away = onTurf(s, p.family, b, b.id) ? 0 : OFF_TURF_DAYS;
  return Math.max(1, (isHome(b) ? 1 : 3) - Math.floor((squadStat(s, j) - 5) / 2) + adj + away);
}

/** The chance a shopkeeper (or a tenant) says yes. */
function signupOdds(s: GameState, f: FamilyId, j: Job, b: Building): number {
  return Math.max(
    0.15,
    Math.min(
      0.95,
      0.4 +
        squadStat(s, j, 'charm') * 0.04 +
        squadStat(s, j, 'muscle') * 0.02 +
        (j.posture === 'quiet' ? -0.1 : j.posture === 'loud' ? 0.15 : 0) +
        // Shopkeepers next to our turf have seen what happens to the ones who say no.
        (onTurf(s, f, b, b.id) ? TURF_BONUS : -TURF_BONUS) +
        (isHome(b) ? HOME_EASE : 0),
    ),
  );
}

// ---------------------------------------------------------------- the day loop

export type StepResult = 'card' | 'continue' | 'done';

export function stepDay(s: GameState): StepResult {
  const run = s.run;
  if (!run) return 'done';
  if (run.queue.length) return 'card';
  if (run.day >= DAYS) return 'done';
  const d = ++run.day;

  for (const p of s.people) {
    if (p.pending && p.pending.arriveDay <= d) {
      const jobs = p.pending.jobs;
      p.pending = null;
      if (p.status === 'active') applyJobs(s, p, jobs, 'runner');
    }
  }
  for (const ev of run.scheduled.filter((e) => e.day === d)) fire(s, ev);
  raids(s);

  for (const p of s.people) {
    if (p.status !== 'active') continue;
    let lead: Job | null = null;
    for (const j of p.jobs) {
      if (j.done || j.stalled || JOBS[j.kind].ongoing || !j.hoods) continue;
      // A job picked up mid-month is sized for the squad it actually got.
      if (!j.checked && !j.progress) j.days = workDays(s, p, j);
      personality(s, p, j);
      const t = targetPos(s, j);
      const speed = j.car ? (has(s, p.family, 'mechanic') ? 3 : 2) : 1;
      for (let i = 0; i < speed && (j.x !== t.x || j.y !== t.y); i++) {
        if (j.x !== t.x) j.x += Math.sign(t.x - j.x);
        else j.y += Math.sign(t.y - j.y);
      }
      if (!lead) lead = j;
      if (j.x === t.x && j.y === t.y) {
        j.progress++;
        if (j.progress >= j.days) {
          complete(s, p, j);
          // The squad is free: hand them on to whatever on the list is still waiting.
          if (j.done) allocate(s, p.family);
        }
      }
      if (run.queue.length) break;
    }
    // The runner rides with their most important job, or goes home.
    const goal = lead && !lead.done ? { x: lead.x, y: lead.y } : { x: p.homeX, y: p.homeY };
    for (let i = 0; i < 2 && (p.x !== goal.x || p.y !== goal.y); i++) {
      if (p.x !== goal.x) p.x += Math.sign(goal.x - p.x);
      else p.y += Math.sign(goal.y - p.y);
    }
    if (run.queue.length) break;
  }

  if (run.queue.length) return 'card';
  return d >= DAYS ? 'done' : 'continue';
}

function personality(s: GameState, p: Person, j: Job): void {
  if (j.checked) return;
  j.checked = true;
  if (
    p.traits.includes('hothead') &&
    j.posture !== 'loud' &&
    ['signup', 'hit', 'wreck', 'takeover'].includes(j.kind) &&
    chance(s, 0.6 - p.authority / 200)
  ) {
    if (p.family === 'player') {
      card(s, {
        kind: 'hothead',
        title: `${first(p)} wants to make an example`,
        text: `${label(p)} sends word about the ${jobTitle(s, j).toLowerCase()} job: "Quiet don't work in this neighbourhood, boss. Let me do this my way." Everyone knows what his way is.`,
        options: [
          { id: 'leash', label: 'Let him off the leash', hint: 'Posture becomes Loud: faster, stronger, much more heat' },
          { id: 'rein', label: 'Rein him in', hint: `${first(p)} loses face with his crew (Authority −8) and resents it` },
        ],
        ctx: { p: p.id, job: j.id },
        focus: targetPos(s, j),
      });
    } else {
      j.posture = 'loud';
      j.days = Math.max(1, j.days - 1);
    }
  }
}

function raids(s: GameState): void {
  for (const b of s.buildings) {
    if (!b.owner || !b.racket || b.raided) continue;
    const fam = s.families[b.owner];
    if (!chance(s, (fam.heat / 5000) * (fam.captain ? 0.5 : 1))) continue;
    b.raided = true;
    s.stats.raids += b.owner === 'player' ? 1 : 0;
    addHeat(s, b.owner, -5, `Raid on ${b.name} let off steam`);
    if (b.racket !== 'gambling' && fam.liquor) {
      const lost = Math.ceil(fam.liquor * 0.3);
      fam.liquor -= lost;
      log(s, `${lost} cases of liquor seized at ${b.name}.`, b.owner);
    }
    const mine = b.owner === 'player';
    log(s, `Police raid ${b.name}. The ${b.racket} is shut for the month.`, b.owner);
    story(
      s,
      `DRY AGENTS RAID ${b.front.toUpperCase()} ON ${streetOf(b).toUpperCase()}`,
      `Officers smashed ${b.racket === 'still' ? 'a copper still' : b.racket === 'gambling' ? 'a roulette wheel' : 'forty bottles of "cough syrup"'} at ${b.name}. The proprietor expressed shock that any of it was there.`,
      mine ? 6 : 3,
    );
    const there = active(s, b.owner).find((p) => p.x === b.x && p.y === b.y);
    if (there && chance(s, has(s, b.owner, 'lawyer') ? 0.2 : 0.4)) {
      arrest(s, there);
      if (mine)
        emergency(
          s,
          `${first(there)} has been arrested`,
          `${label(there)} was picked up in the raid on ${b.name}. Their jobs stop until they're out.`,
          b,
        );
      else rivalRespond(s);
    }
  }
}

function arrest(s: GameState, p: Person): void {
  p.status = 'jailed';
  p.recover = has(s, p.family, 'lawyer') ? 1 : 2;
  log(s, `${label(p)} was taken in.`, p.family);
  allocate(s, p.family);
}

// ---------------------------------------------------------------- scheduled events

function fire(s: GameState, ev: ScheduledEvent): void {
  const pf = s.families.player;
  switch (ev.kind) {
    case 'cop': {
      const b = pick(
        s,
        s.buildings.filter((x) => !isHome(x) && (x.owner === 'player' || x.protectedBy === 'player')),
      );
      if (!b) return;
      card(s, {
        kind: 'cop',
        title: 'A patrolman is asking questions',
        text: `Patrolman Kearney has been in ${b.name} three times this week and hasn't bought a thing. He's writing in a little notebook.`,
        options: [
          { id: 'bribe', label: 'Slip him $200', hint: 'Heat −6', disabled: pf.cash < 200 },
          { id: 'lean', label: 'Lean on him', hint: 'He might back off. He might complain to the captain.' },
          { id: 'ignore', label: 'Ignore him', hint: 'He might be nobody. He might be the start of a raid.' },
        ],
        ctx: { b: b.id },
        focus: b,
      });
      return;
    }
    case 'tail': {
      const still = rackets(s, 'player', 'still')[0];
      if (!still) return;
      card(s, {
        kind: 'tail',
        title: 'Your driver spots a tail',
        text: `A black sedan has been two cars behind the supply truck since it left ${still.name}.`,
        options: [
          { id: 'lose', label: 'Lose them', hint: 'Probably fine. Might crash the truck.' },
          { id: 'ambush', label: 'Lead them into an alley', hint: 'Whoever they are, they will regret it. Very loud.' },
          { id: 'dump', label: 'Dump the load', hint: 'Lose 20 cases, stay clean' },
        ],
        ctx: { b: still.id },
        focus: still,
      });
      return;
    }
    case 'offer': {
      const b = pick(
        s,
        s.buildings.filter((x) => !isHome(x) && x.owner === null && x.protectedBy !== 'rival'),
      );
      if (!b) return;
      const cost = Math.round(price(b, 'player') * 0.6);
      card(s, {
        kind: 'offer',
        title: 'A shopkeeper in trouble',
        text: `The owner of ${b.name} is behind on his loans to some very impatient people. He'll sign the place over for $${cost} if you square his debts.`,
        options: [
          { id: 'buy', label: `Buy him out ($${cost})`, hint: 'The building is ours, quietly', disabled: pf.cash < cost },
          { id: 'pass', label: 'Pass', hint: 'Someone else might not' },
        ],
        ctx: { b: b.id, cost },
        focus: b,
      });
      return;
    }
    case 'bail': {
      const h = pick(
        s,
        s.hoods.filter((x) => x.family === 'player' && x.status === 'active'),
      );
      const p = h && person(s, h.under);
      if (!h || !p) return;
      h.status = 'jailed';
      h.recover = 1;
      allocate(s, 'player');
      card(s, {
        kind: 'bail',
        title: `${hoodLabel(h)} is in the tank`,
        text: `${hoodFirst(h)}, from ${p.role === 'boss' ? 'your own' : `${first(p)}'s`} crew, broke a bottle over a sailor's head at a dance hall. ${hoodFirst(h)} is in a cell and scared, and scared people talk.`,
        options: [
          {
            id: 'pay',
            label: 'Pay the bail ($150)',
            hint: `${hoodFirst(h)} is back on the job tomorrow, and remembers who looked after them`,
            disabled: pf.cash < 150,
          },
          { id: 'leave', label: 'Let them sit', hint: 'Out of action for the month. Loyalty down. They might say something: heat +5.' },
        ],
        ctx: { p: p.id, h: h.id },
        focus: p,
      });
      return;
    }
    case 'snitch': {
      const r = active(s, 'rival').find((x) => x.jobs.some((j) => !JOBS[j.kind].ongoing && !j.done && !j.stalled));
      if (!r) return;
      card(s, {
        kind: 'snitch',
        title: 'A Calloway man wants to sell',
        text: `A driver for the Calloway Outfit says he knows what ${label(r)} is up to this month. He wants $150 and a promise you never saw him.`,
        options: [
          { id: 'buy', label: 'Pay him ($150)', hint: 'Learn their plan. You can change yours.', disabled: pf.cash < 150 },
          { id: 'pass', label: 'Send him away', hint: 'Could be a trap anyway' },
        ],
        ctx: { p: r.id },
        focus: null,
      });
      return;
    }
    case 'tip': {
      const j = s.people.flatMap((p) => p.jobs).find((x) => x.id === ev.ref);
      const r = j && runnerOf(s, j);
      if (!j || !r || j.done || j.stalled || r.status !== 'active') return;
      emergency(
        s,
        'Word on the street',
        `A bartender on ${streetOf(r)} says ${label(r)} is ${jobTitle(s, j).toLowerCase()}, maybe in three days. [Likely]`,
        targetPos(s, j),
      );
      return;
    }
    case 'defect': {
      const p = person(s, ev.ref);
      if (!p || p.status !== 'active' || !p.plotting) return;
      if (p.family === 'player') defect(s, p);
      else if (lieutenants(s, 'player').length < LT_CAP && p.role === 'lt') {
        card(s, {
          kind: 'betrayal',
          title: `${first(p)} wants to talk`,
          text: `${label(p)} of the Calloway Outfit is tired of Big Jim's scraps. They'll come over with their crew. Rats bite the hand that feeds them, of course.`,
          options: [
            { id: 'accept', label: 'Welcome them in', hint: 'Gain the lieutenant and their crew' },
            { id: 'refuse', label: 'Send them back', hint: 'Nothing changes' },
          ],
          ctx: { p: p.id },
          focus: p,
        });
      }
      return;
    }
  }
}

function defect(s: GameState, p: Person): void {
  const from = p.family;
  const to = other(from);
  // Shops pay whoever collects: a defecting collector takes half of them.
  const collects = p.jobs.some((j) => j.kind === 'collect' && j.hoods);
  const shops = collects ? protectedBy(s, from).filter((_, i) => i % 2 === 0) : [];
  for (const b of shops) b.protectedBy = to;
  const fam = s.families[from];
  for (const b of branchesOf(s, p)) assignBranch(s, from, b, fam.bossId);
  p.jobs = [];
  p.family = to;
  p.plotting = false;
  p.loyalty = 55;
  p.demand = null;
  p.ownBuilding = null;
  const dest = bossOf(s, to);
  p.homeX = dest.homeX;
  p.homeY = dest.homeY;
  // Their crew goes with them.
  const crew = crewOf(s, p);
  for (const h of crew) h.family = to;
  const men = crew.length === 1 ? `${hoodFirst(crew[0])}` : crew.length ? `${crew.length} of their crew` : 'nobody';
  const what = shops.length ? ` and ${shops.length} shops that used to pay us` : '';
  log(s, `${label(p)} has gone over to ${s.families[to].name}, taking ${men}${what}.`, from);
  story(
    s,
    `${p.nickname.toUpperCase()} CHANGES TEAMS`,
    `Associates of ${p.name} say the ${p.nickname} "just wanted a fresh start." The fresh start includes ${crew.length} men${what}.`,
    8,
  );
  if (from === 'player') {
    const who = crew.map(hoodFirst);
    emergency(
      s,
      `${first(p)} has betrayed you`,
      `${label(p)} walked out to the Calloway Outfit${who.length ? ` with ${who.join(', ')}` : ''}${what}. Their branches are back on your desk.`,
      p,
    );
    for (const m of lieutenants(s, 'player')) m.loyalty = Math.max(0, m.loyalty - 5);
  }
  allocate(s, from);
  allocate(s, to);
}

// ---------------------------------------------------------------- completing jobs

function complete(s: GameState, p: Person, j: Job): void {
  const f = p.family;
  const fam = s.families[f];
  const b = building(s, j.target);
  const name = first(p);
  j.done = true;
  switch (j.kind) {
    case 'signup': {
      if (!b || b.owner || b.protectedBy === f) return;
      if (b.protectedBy) return fightFor(s, p, j, b);
      if (chance(s, signupOdds(s, f, j, b))) {
        seasoned(s, j, squadStat(s, j, 'charm') >= squadStat(s, j, 'muscle') ? 'charm' : 'muscle');
        return signUp(s, b, p, j.posture, j);
      }
      if (f === 'player') {
        card(s, {
          kind: 'shopkeeper',
          title: 'The shopkeeper says no',
          text: `The ${isHome(b) ? 'landlord' : 'owner'} of ${b.name} told ${squadNames(s, j) || name} he's "already got insurance, thank you." He says it with a shaking voice.`,
          options: [
            { id: 'lean', label: 'Lean on him', hint: 'He sees sense. Heat +8.' },
            { id: 'sweeten', label: 'Sweeten it ($100)', hint: 'He sees sense, quietly.', disabled: fam.cash < 100 },
            { id: 'walk', label: 'Walk away', hint: 'Try again next month' },
          ],
          ctx: { p: p.id, b: b.id },
          focus: b,
        });
      } else if (j.posture !== 'quiet') {
        addHeat(s, f, 8, `Shopkeeper beaten at ${b.name}`);
        signUp(s, b, p, 'quiet');
      }
      return;
    }
    case 'block':
      return knock(s, p, j);
    case 'buy': {
      if (!b || b.owner) return;
      const cost = price(b, f);
      if (fam.cash < cost) return log(s, `${name} couldn't raise the $${cost} for ${b.name}.`, f);
      spend(s, f, cost, `Bought ${b.name}`);
      b.owner = f;
      b.protectedBy = null;
      p.wins++;
      seasoned(s, j);
      log(s, `${name} bought ${b.name}.`, f);
      if (f === 'player')
        story(
          s,
          `${b.name.toUpperCase()} CHANGES HANDS`,
          `${b.name} on ${streetOf(b)} has been sold to "a local businessman." The old owner is said to be delighted, and to be moving to Florida.`,
          4,
        );
      advanceLessons(s);
      return;
    }
    case 'fitout': {
      if (!b || b.owner !== f || b.racket) return;
      if (fam.cash < FITOUT_COST) return log(s, `${name} couldn't afford to fit out ${b.name}.`, f);
      spend(s, f, FITOUT_COST, `Back room fitted at ${b.name}`);
      b.racket = b.suits;
      p.wins++;
      seasoned(s, j);
      log(s, `${squadNames(s, j) || name} opened a ${b.racket} in the back of ${b.name}.`, f);
      if (f === 'player')
        story(
          s,
          `${b.front.toUpperCase()} DOES BRISK LATE TRADE`,
          `${b.name} on ${streetOf(b)} reports unusual demand for its services after 10 p.m.`,
          3,
        );
      allocate(s, f);
      advanceLessons(s);
      return;
    }
    case 'phone': {
      if (!b || b.owner !== f || b.telephone) return;
      if (fam.cash < PHONE_COST) return log(s, `${name} couldn't pay for the line at ${b.name}.`, f);
      spend(s, f, PHONE_COST, `Telephone at ${b.name}`);
      b.telephone = true;
      log(s, `A telephone line now runs into ${b.name}.`, f);
      return;
    }
    case 'hit': {
      const t = person(s, j.target);
      if (!t || t.status !== 'active' || t.family === f) return log(s, `${name}'s target went to ground.`, f);
      return fightFor(s, p, j, t);
    }
    case 'wreck':
    case 'takeover':
      if (b && b.owner === other(f)) return fightFor(s, p, j, b);
      return;
    default:
      return;
  }
}

/**
 * One door on a block job. Quiet crews take no for an answer (until next month);
 * firm or loud ones lean. Then on to the next door, until the block pays.
 */
function knock(s: GameState, p: Person, j: Job): void {
  const f = p.family;
  const b = nextDoor(s, j);
  const block = j.target!;
  if (b) {
    if (chance(s, signupOdds(s, f, j, b))) {
      seasoned(s, j, squadStat(s, j, 'charm') >= squadStat(s, j, 'muscle') ? 'charm' : 'muscle');
      signUp(s, b, p, j.posture, j);
    } else if (j.posture === 'quiet') {
      b.refused = true;
      log(s, `${b.name} turned ${squadNames(s, j) || first(p)} away. They'll try again next month.`, f);
    } else {
      addHeat(s, f, isHome(b) ? 2 : 8, `${isHome(b) ? 'Tenants' : 'Shopkeeper'} leaned on at ${b.name}`);
      signUp(s, b, p, 'quiet', j);
    }
  }
  const next = nextDoor(s, j);
  if (next) {
    j.done = false;
    j.progress = 0;
    j.days = doorDays(s, p, j, next);
  } else if (blockFree(s, block).length) {
    j.done = false;
    j.progress = 0;
    j.stalled = 'The rest of the block said no this month';
  } else {
    log(s, `Every door on ${blockName(s, block)} that was anybody's to sign now pays someone.`, f);
    advanceLessons(s);
  }
}

function signUp(s: GameState, b: Building, p: Person, posture: Posture, j?: Job): void {
  const f = p.family;
  b.protectedBy = f;
  b.uncollected = 0;
  p.wins++;
  // Tenants don't make the papers the way a shopkeeper does.
  const heat = isHome(b) ? Math.floor(HEAT[posture] / 4) : HEAT[posture];
  if (heat) addHeat(s, f, heat, `${b.name} "persuaded" (${posture})`);
  log(s, `${(j && squadNames(s, j)) || first(p)} signed up ${b.name}. It pays $${b.protection} a month.`, f);
  allocate(s, f);
  advanceLessons(s);
}

// ---------------------------------------------------------------- fights

interface FightCtx {
  [k: string]: string | number;
}

function guardsAt(s: GameState, b: Building): { p: Person; j: Job }[] {
  const f = b.owner ?? b.protectedBy;
  if (!f) return [];
  return active(s, f).flatMap((p) => p.jobs.filter((j) => j.kind === 'guard' && j.target === b.id && j.hoods).map((j) => ({ p, j })));
}

const onlyHoods = (s: GameState, ids: string[]) => ids.filter((id) => hood(s, id));

function fightFor(s: GameState, att: Person, j: Job, target: Building | Person): void {
  const af = att.family;
  const df = other(af);
  const isBuilding = 'front' in target;
  let D: number;
  let defenders: Person[] = [];
  let dsquad: string[] = [];
  if (isBuilding) {
    const g = guardsAt(s, target);
    defenders = g.map((x) => x.p);
    dsquad = g.flatMap((x) => onlyHoods(s, x.j.squad));
    D =
      force(s, df, doormen(target.owner ? 3 : 1), null, 'firm') +
      g.reduce((n, x) => n + force(s, df, workers(s, x.j.squad), x.p, 'firm') * 1.2, 0);
  } else {
    // A hit: whoever is with the target at the time, about half his crew.
    defenders = [target];
    const crew = ready(s, target);
    dsquad = crew.slice(0, Math.ceil(crew.length / 2)).map((h) => h.id);
    D = force(s, df, [target, ...workers(s, dsquad)], target, 'firm');
  }
  const A = force(s, af, workers(s, j.squad), att, j.posture) * (isBuilding ? 1 : 1.15);
  const ctx: FightCtx = {
    att: att.id,
    job: j.id,
    target: target.id,
    a: A,
    d: D,
    defs: defenders.map((x) => x.id).join(','),
    squad: onlyHoods(s, j.squad).join(','),
    dsquad: dsquad.join(','),
    posture: j.posture,
    kind: j.kind,
    hoods: j.hoods,
  };
  const playerInvolved =
    af === 'player' || (isBuilding ? target.owner === 'player' || target.protectedBy === 'player' : target.family === 'player');
  if (playerInvolved && (defenders.length || af === 'player')) fightCard(s, ctx, target);
  else resolveFight(s, ctx, 0);
}

const names = (s: GameState, csv: string | number) =>
  String(csv)
    .split(',')
    .map((id) => hood(s, id))
    .filter((h): h is Hood => !!h)
    .map(hoodFirst);

function fightCard(s: GameState, ctx: FightCtx, where: { x: number; y: number }): void {
  const att = person(s, String(ctx.att))!;
  const attacking = att.family === 'player';
  const defs = String(ctx.defs)
    .split(',')
    .filter(Boolean)
    .map((id) => person(s, id)!);
  const odds = Math.round((Number(ctx.a) / (Number(ctx.a) + Number(ctx.d))) * 100);
  const ours = attacking ? odds : 100 - odds;
  const b = building(s, String(ctx.target));
  const place = b ? b.name : streetOf(where);
  let options: CardOption[];
  if (attacking) {
    options = [
      { id: 'push', label: 'Push in', hint: 'Better odds, more bodies on both sides' },
      { id: 'steady', label: 'Play it as it lies', hint: `About ${ours}% in our favour` },
      { id: 'back', label: 'Pull back', hint: 'Live to fight another day' },
    ];
  } else {
    const helper = helperFor(s, where, defs);
    options = [
      { id: 'stand', label: 'Stand and fight', hint: `About ${ours}% in our favour, a little better dug in` },
      {
        id: 'help',
        label: helper ? `Call ${first(helper)} by telephone` : 'Call for help',
        hint: helper ? `${first(helper)} is by a telephone and close enough to come` : 'Nobody close enough by a telephone',
        disabled: !helper,
      },
      { id: 'give', label: b ? 'Give it up' : 'Scatter', hint: b ? 'Lose it, keep the men' : 'Run for it, lose some pride' },
    ];
    if (helper) ctx.helper = helper.id;
  }
  const ourMen = names(s, attacking ? ctx.squad : ctx.dsquad);
  const theirs = attacking ? (defs.length ? defs.map(label).join(' and ') : 'a couple of hired men on the door') : label(att);
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  card(s, {
    kind: 'fight',
    title: attacking ? `${first(att)} is about to hit ${place}` : `${label(att)} is coming for ${place}`,
    text: attacking
      ? `${list(ourMen) || first(att)} ${ourMen.length > 1 ? 'are' : 'is'} outside ${place}. ${theirs} inside. Once it starts it can't be stopped.`
      : `Cars pull up outside ${place}: ${theirs}, with ${Number(ctx.hoods) || 'a few'} men. Ours inside: ${list([...defs.map(first), ...ourMen]) || 'just the shopkeeper'}.`,
    options,
    ctx,
    focus: where,
  });
}

function helperFor(s: GameState, where: { x: number; y: number }, exclude: Person[]): Person | undefined {
  return active(s, 'player')
    .filter((p) => !exclude.includes(p) && crewSize(s, p) > 0 && dist(p, where) <= 4)
    .filter((p) => s.buildings.some((b) => b.telephone && b.owner === 'player' && b.x === p.x && b.y === p.y))
    .sort((a, b) => dist(a, where) - dist(b, where))[0];
}

/** What happened to one man. Hays Code: the paper reports it; nobody sees it. */
function casualty(s: GameState, h: Hood, posture: Posture): string {
  const r = rand(s);
  const dead = posture === 'loud' ? 0.4 : posture === 'firm' ? 0.3 : 0.2;
  const fam = s.families[h.family];
  if (r < dead) {
    h.status = 'dead';
    fam.guns = Math.max(0, fam.guns - 1);
    return `${h.name} (found in the river)`;
  }
  if (r < dead + 0.45 || (has(s, h.family, 'lawyer') && chance(s, 0.5))) {
    h.status = 'wounded';
    h.recover = 1;
    return `${h.name} (in hospital, "fell down some stairs")`;
  }
  h.status = 'jailed';
  h.recover = has(s, h.family, 'lawyer') ? 1 : 2;
  fam.guns = Math.max(0, fam.guns - 1);
  return `${h.name} (arrested at the scene)`;
}

function resolveFight(s: GameState, ctx: FightCtx, mod: number): void {
  const att = person(s, String(ctx.att))!;
  const af = att.family;
  const df = other(af);
  const job = att.jobs.find((x) => x.id === ctx.job);
  const b = building(s, String(ctx.target));
  const target = b ? null : person(s, String(ctx.target))!;
  const defs = String(ctx.defs)
    .split(',')
    .filter(Boolean)
    .map((id) => person(s, id)!)
    .filter((d) => d.status === 'active');
  const posture = String(ctx.posture) as Posture;
  const A = Number(ctx.a);
  const D = Number(ctx.d);
  const win = rand(s) < Math.max(0.05, Math.min(0.95, A / (A + D) + mod));
  const place = b ? b.name : streetOf(att);
  if (af === 'player' || df === 'player') s.stats.fights++;

  addHeat(s, af, posture === 'loud' ? 18 : posture === 'firm' ? 10 : 5, `Gunfire at ${place}`);
  if (defs.length) addHeat(s, df, 4, `Gunfire at ${place}`);

  // Named hoods lost on each side: the losers lose more.
  const side = (csv: string | number) =>
    String(csv)
      .split(',')
      .map((id) => hood(s, id))
      .filter((h): h is Hood => !!h && h.status === 'active');
  const ourSide = side(ctx.squad);
  const theirSide = side(ctx.dsquad);
  const fates: { h: Hood; text: string }[] = [];
  const lose = (pool: Hood[], n: number) => {
    for (const h of shuffleCopy(s, pool).slice(0, n)) fates.push({ h, text: casualty(s, h, posture) });
  };
  if (win) {
    lose(theirSide, int(s, 1, posture === 'loud' ? 3 : 2));
    lose(ourSide, int(s, 0, 1));
  } else {
    lose(ourSide, int(s, 1, posture === 'loud' ? 3 : 2));
    lose(theirSide, int(s, 0, 1));
  }

  // The bosses and lieutenants who were there.
  const hurt: Person[] = [];
  const losers = win ? defs : [att];
  for (const l of losers) {
    const r = rand(s);
    const kill = l.role === 'boss' ? 0 : posture === 'loud' ? 0.15 : 0.08;
    if (target && l === target && win) {
      if (l.role !== 'boss' && r < (posture === 'loud' ? 0.6 : 0.45)) kill_(s, l);
      else wound(s, l);
      hurt.push(l);
    } else if (r < kill) {
      kill_(s, l);
      hurt.push(l);
    } else if (r < kill + 0.22) {
      wound(s, l);
      hurt.push(l);
    }
  }
  if (posture === 'loud' && chance(s, s.families[af].heat / 220)) {
    const nab = pick(
      s,
      [att, ...defs].filter((p) => p.status === 'active'),
    );
    if (nab && !(has(s, nab.family, 'lawyer') && chance(s, 0.5))) {
      arrest(s, nab);
      hurt.push(nab);
    }
  }

  if (job) {
    // The winners come away harder and wiser.
    if (win) seasoned(s, job, 'muscle');
    job.done = true;
  }
  if (!win) for (const h of theirSide) if (h.status === 'active') h.xp++;

  if (b) {
    if (win) {
      att.wins++;
      if (ctx.kind === 'wreck') {
        log(s, `${first(att)}'s crew wrecked the ${b.racket} at ${b.name}.`, af);
        b.racket = null;
      } else if (ctx.kind === 'takeover') {
        b.owner = af;
        b.protectedBy = null;
        log(s, `${first(att)} took ${b.name} from ${s.families[df].name}.`, af);
      } else {
        b.protectedBy = af;
        b.uncollected = 0;
        log(s, `${first(att)} muscled in on ${b.name}. It pays us now.`, af);
      }
    } else log(s, `${first(att)} was driven off from ${b.name}.`, af);
  } else if (target) {
    log(s, win ? `${first(att)}'s hit on ${first(target)} went through.` : `${first(target)} saw ${first(att)} coming.`, af);
    if (win) att.wins++;
  }

  const told = [
    ...hurt.map(
      (l) =>
        `${l.name} (${l.status === 'dead' ? 'found in the river' : l.status === 'jailed' ? 'arrested at the scene' : 'in hospital, "fell down some stairs"'})`,
    ),
    ...fates.map((x) => x.text),
  ].join('; ');
  story(
    s,
    pick(s, ['SHOTS RING OUT ON ', 'NIGHT OF TERROR ON ', 'GANGLAND FLARE-UP ON ']) + streetOf(b ?? att).toUpperCase(),
    `Residents of ${streetOf(b ?? att)} report "a sound like a dozen typewriters" near ${place} at around 2 a.m. ` +
      (told ? `Police later confirmed: ${told}. ` : 'No bodies were found, which police called "a pleasant change." ') +
      'Captain Hollis assured the public that crime does not pay.',
    7,
  );
  for (const x of fates) log(s, `${x.text.replace(/ \(/, ': ').replace(/\)$/, '')}.`, x.h.family);

  allocate(s, 'player');
  allocate(s, 'rival');

  const ours = hurt.filter((l) => l.family === 'player');
  const ourHoods = fates.filter((x) => x.h.family === 'player');
  const lost = b && win && df === 'player';
  if (ours.length || lost || ourHoods.some((x) => x.h.status !== 'wounded')) {
    const what = [
      lost ? `we lost ${b!.name}` : '',
      ...ours.map((l) => `${label(l)} is ${l.status === 'dead' ? 'dead' : l.status === 'jailed' ? 'in a cell' : 'in hospital'}`),
      ...ourHoods.map(
        (x) => `${hoodLabel(x.h)} is ${x.h.status === 'dead' ? 'dead' : x.h.status === 'jailed' ? 'in a cell' : 'in hospital'}`,
      ),
    ]
      .filter(Boolean)
      .join('; ');
    emergency(s, 'Bad night', `${what[0].toUpperCase()}${what.slice(1)}.`, b ?? att);
  }
  if (hurt.some((l) => l.family === 'player' && l.status === 'dead') || ourHoods.some((x) => x.h.status === 'dead'))
    s.families.player.grudge = true;
  const theyBled = hurt.some((l) => l.family === 'rival') || fates.some((x) => x.h.family === 'rival');
  if (theyBled || (b && win && df === 'rival')) {
    if (hurt.some((l) => l.family === 'rival' && l.status === 'dead') || fates.some((x) => x.h.family === 'rival' && x.h.status === 'dead'))
      s.families.rival.grudge = true;
    s.families.rival.notice = true;
    rivalRespond(s, b ?? undefined);
  }
}

function shuffleCopy<T>(s: GameState, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(rand(s) * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

function kill_(s: GameState, p: Person): void {
  p.status = 'dead';
  const fam = s.families[p.family];
  for (const b of branchesOf(s, p)) assignBranch(s, p.family, b, fam.bossId);
  for (const m of members(s, p.family)) if (m.role === 'lt') m.loyalty = Math.max(0, m.loyalty - 3);
  // The crew drifts back to the boss.
  for (const h of crewOf(s, p)) h.under = fam.bossId;
}

function wound(s: GameState, p: Person): void {
  p.status = 'wounded';
  p.recover = 1;
  allocate(s, p.family);
}

// ---------------------------------------------------------------- Change of Plans

function emergency(s: GameState, title: string, text: string, where: { x: number; y: number }): void {
  const left = s.run!.changesLeft;
  card(s, {
    kind: 'emergency',
    title,
    text,
    options: [
      {
        id: 'replan',
        label: 'Change of Plans',
        hint: left > 0 ? `Re-rank or add jobs now (${left} left; costs a meeting next month)` : 'No more changes this month',
        disabled: left <= 0,
      },
      { id: 'carry', label: 'Carry on', hint: 'The plan stands' },
    ],
    ctx: {},
    focus: where,
  });
}

export interface Reach {
  kind: 'now' | 'phone' | 'runner' | 'unavailable';
  days: number;
  text: string;
}

export function reach(s: GameState, id: string): Reach {
  const p = person(s, id);
  if (!p || p.status !== 'active') return { kind: 'unavailable', days: 0, text: p?.status === 'jailed' ? 'In a cell' : 'Laid up' };
  if (p.role === 'boss') return { kind: 'now', days: 0, text: 'Your own jobs: changes happen at once' };
  const phone = s.buildings.find((b) => b.telephone && b.owner === p.family && b.x === p.x && b.y === p.y);
  if (phone) return { kind: 'phone', days: 0, text: `At ${phone.name}, which has a telephone: orders arrive now` };
  const boss = bossOf(s, p.family);
  const days = 2 + Math.floor(dist(p, boss) / 4);
  return { kind: 'runner', days, text: `Out on the street: a runner reaches them in ${days} days` };
}

/** Replace a person's job list mid-month, keeping progress on jobs that stay. */
function applyJobs(s: GameState, p: Person, jobs: Job[], how: 'now' | 'phone' | 'runner'): void {
  if (p.traits.includes('hothead') && jobs.length < p.jobs.length && chance(s, 0.3)) {
    log(s, `${first(p)} got the message${how === 'runner' ? ' from the runner' : ''} and ignored it.`, p.family);
    return;
  }
  const old = new Map(p.jobs.map((j) => [j.id, j]));
  p.jobs = jobs.map((j) => {
    const prev = old.get(j.id);
    if (prev) return Object.assign(prev, { posture: j.posture });
    const fresh = { ...j };
    prepare(s, p, fresh);
    fresh.x = p.x;
    fresh.y = p.y;
    return fresh;
  });
  allocate(s, p.family);
  if (p.role !== 'boss')
    log(s, `${first(p)} has new orders (${how === 'phone' ? 'by telephone' : how === 'runner' ? 'by runner' : 'in person'}).`, p.family);
}

/** A blank job the UI can add to a draft list during a Change of Plans. */
export function draftJob(s: GameState, kind: JobKind, target: string | null, posture: Posture = 'firm'): Job {
  return blankJob(newId(s), kind, target, posture);
}

export function changePlans(s: GameState, drafts: Record<string, Job[]>): void {
  const run = s.run;
  if (!run || run.changesLeft <= 0) return;
  run.changesLeft--;
  s.stats.changes++;
  s.families.player.actionDebt++;
  for (const [id, jobs] of Object.entries(drafts)) {
    const p = person(s, id);
    if (!p || p.family !== 'player') continue;
    const r = reach(s, id);
    if (r.kind === 'now' || r.kind === 'phone') applyJobs(s, p, jobs, r.kind);
    else if (r.kind === 'runner') {
      p.pending = { jobs, arriveDay: run.day + r.days };
      log(s, `A runner is on the way to ${first(p)} (day ${run.day + r.days}).`, 'player');
    }
  }
  advanceLessons(s);
}

/** The rival's own Change of Plans: send someone to retake or retaliate. */
function rivalRespond(s: GameState, b?: Building): void {
  const run = s.run;
  if (!run || run.rivalChangesLeft <= 0 || !s.families.rival.notice) return;
  const cands = active(s, 'rival')
    .filter((p) => crewSize(s, p) >= 2)
    .map((p) => ({ p, r: reach(s, p.id) }))
    .filter((c) => c.r.kind !== 'unavailable')
    .sort((a, b2) => a.r.days - b2.r.days || crewSize(s, b2.p) - crewSize(s, a.p));
  const c = cands[0];
  if (!c) return;
  const tgt =
    b && (b.owner === 'player' || b.protectedBy === 'player')
      ? b
      : s.buildings.filter((x) => x.protectedBy === 'player' && !x.owner).sort((x, y) => dist(x, c.p) - dist(y, c.p))[0];
  if (!tgt) return;
  run.rivalChangesLeft--;
  const kind: JobKind = tgt.owner === 'player' ? 'takeover' : 'signup';
  const job = blankJob(newId(s), kind, tgt.id, 'loud');
  const jobs = [job, ...c.p.jobs];
  if (c.r.kind === 'runner') c.p.pending = { jobs, arriveDay: run.day + c.r.days };
  else applyJobs(s, c.p, jobs, c.r.kind as 'now' | 'phone');
}

// ---------------------------------------------------------------- answering cards

export function answer(s: GameState, cardId: number, optionId: string): Card | null {
  const run = s.run;
  if (!run) return null;
  const i = run.queue.findIndex((c) => c.id === cardId);
  if (i < 0) return null;
  const c = run.queue[i];
  const opt = c.options.find((o) => o.id === optionId);
  if (!opt || opt.disabled) return null;
  run.queue.splice(i, 1);
  const p = person(s, String(c.ctx.p ?? ''));
  const b = building(s, String(c.ctx.b ?? ''));

  switch (c.kind) {
    case 'hothead': {
      const j = p?.jobs.find((x) => x.id === c.ctx.job);
      if (!p || !j) break;
      if (optionId === 'leash') {
        j.posture = 'loud';
        j.days = Math.max(1, j.days - 1);
        log(s, `${first(p)} is off the leash.`, 'player');
      } else {
        p.authority = Math.max(0, p.authority - 8);
        p.loyalty = Math.max(0, p.loyalty - 6);
        log(s, `${first(p)} grumbles and does it quietly.`, 'player');
      }
      break;
    }
    case 'shopkeeper': {
      if (!p || !b) break;
      if (optionId === 'lean') {
        addHeat(s, 'player', 8, `Shopkeeper roughed up at ${b.name}`);
        signUp(s, b, p, 'quiet');
      } else if (optionId === 'sweeten') {
        spend(s, 'player', 100, `Sweetener for ${b.name}`);
        signUp(s, b, p, 'quiet');
      } else log(s, `${first(p)} walked away from ${b.name}.`, 'player');
      break;
    }
    case 'cop': {
      if (optionId === 'bribe') {
        spend(s, 'player', 200, 'Patrolman Kearney');
        addHeat(s, 'player', -6, 'Patrolman Kearney paid off');
      } else if (optionId === 'lean') {
        if (chance(s, 0.5)) addHeat(s, 'player', -3, 'Patrolman Kearney scared off');
        else addHeat(s, 'player', 12, 'Patrolman Kearney complained to the captain');
      } else if (b && b.owner === 'player' && b.racket && chance(s, 0.4)) {
        b.raided = true;
        addHeat(s, 'player', 4, `Kearney's raid on ${b.name}`);
        log(s, `Kearney came back with friends. ${b.name} is shut.`, 'player');
      }
      break;
    }
    case 'tail': {
      const fam = s.families.player;
      if (optionId === 'lose') {
        if (chance(s, 0.35)) {
          const lost = Math.min(fam.liquor, 20);
          fam.liquor -= lost;
          fam.cars = Math.max(0, fam.cars - 1);
          log(s, `The truck wrapped itself round a lamppost: ${lost} cases and a car gone.`, 'player');
          story(s, 'TRUCK SPILLS "MAPLE SYRUP" ON DOCK ROAD', 'Witnesses say the syrup smelled strongly of rye.', 4);
          allocate(s, 'player');
        } else log(s, 'The driver lost the tail in the rail yards.', 'player');
      } else if (optionId === 'ambush') {
        addHeat(s, 'player', 15, 'Ambush in an alley');
        const tail = pick(
          s,
          s.hoods.filter((x) => x.family === 'rival' && x.status === 'active'),
        );
        if (tail) tail.status = 'dead';
        const boss = tail && person(s, tail.under);
        log(
          s,
          tail
            ? `The tail was ${tail.name}, one of ${boss ? first(boss) : 'Calloway'}'s men. Was.`
            : 'The tail will not be following anyone again.',
          'player',
        );
        story(s, 'CAR FOUND ABANDONED IN ALLEY', 'Police are looking for its owner. They expect to be looking for some time.', 5);
      } else fam.liquor = Math.max(0, fam.liquor - 20);
      break;
    }
    case 'offer': {
      if (optionId === 'buy' && b && !b.owner) {
        spend(s, 'player', Number(c.ctx.cost), `Bought out ${b.name}`);
        b.owner = 'player';
        b.protectedBy = null;
        log(s, `${b.name} signed over to the family.`, 'player');
        allocate(s, 'player');
        advanceLessons(s);
      }
      break;
    }
    case 'bail': {
      const h = hood(s, String(c.ctx.h ?? ''));
      if (!p || !h) break;
      if (optionId === 'pay') {
        spend(s, 'player', 150, `Bail for ${h.name}`);
        h.status = 'active';
        h.recover = 0;
        h.loyalty = Math.min(100, h.loyalty + 10);
        if (p.role === 'lt') p.authority = Math.min(100, p.authority + 3);
        log(s, `${hoodFirst(h)} is out, and grateful.`, 'player');
      } else {
        h.loyalty = Math.max(0, h.loyalty - 20);
        addHeat(s, 'player', 5, `${h.name} talking in a cell`);
        log(s, `${hoodFirst(h)} sits out the month in a cell.`, 'player');
      }
      allocate(s, 'player');
      break;
    }
    case 'snitch': {
      if (optionId !== 'buy' || !p) break;
      spend(s, 'player', 150, 'A Calloway driver');
      const j = p.jobs.find((x) => !JOBS[x.kind].ongoing && !x.done && !x.stalled);
      emergency(
        s,
        'What the driver said',
        `${label(p)} is ${j ? jobTitle(s, j).toLowerCase() : 'sitting tight'}. [Confirmed]`,
        j ? targetPos(s, j) : p,
      );
      break;
    }
    case 'fight': {
      const att = person(s, String(c.ctx.att));
      const attacking = att?.family === 'player';
      if (attacking) {
        if (optionId === 'back') {
          const j = att!.jobs.find((x) => x.id === c.ctx.job);
          if (j) j.done = true;
          log(s, 'Our crew pulled back.', 'player');
          break;
        }
        resolveFight(s, c.ctx, optionId === 'push' ? 0.12 : 0);
      } else {
        if (optionId === 'give') {
          if (b && att) {
            if (c.ctx.kind === 'takeover') b.owner = att.family;
            else if (c.ctx.kind === 'wreck') b.racket = null;
            else b.protectedBy = att.family;
            log(s, `We gave up ${b.name} without a fight.`, 'player');
          } else log(s, 'Our people scattered.', 'player');
          const j = att?.jobs.find((x) => x.id === c.ctx.job);
          if (j) j.done = true;
          allocate(s, 'player');
          break;
        }
        let mod = -0.08;
        if (optionId === 'help') {
          const h = person(s, String(c.ctx.helper));
          if (h) {
            const theirs = ready(s, h);
            c.ctx.d = Number(c.ctx.d) + force(s, 'player', [h, ...theirs], h, 'firm');
            c.ctx.defs = `${c.ctx.defs},${h.id}`.replace(/^,/, '');
            c.ctx.dsquad = [String(c.ctx.dsquad), ...theirs.map((x) => x.id)].filter(Boolean).join(',');
            mod = -0.05;
          }
        }
        resolveFight(s, c.ctx, mod);
      }
      break;
    }
    case 'betrayal': {
      if (!p) break;
      if (optionId === 'accept') {
        defect(s, p);
        story(
          s,
          'CALLOWAY OUTFIT "UNAFFECTED" BY DEPARTURE',
          `Big Jim Calloway says ${p.name} "was never really one of us." He then broke a chair.`,
          6,
        );
      } else {
        p.plotting = false;
        log(s, `We sent ${first(p)} back.`, 'player');
      }
      break;
    }
    case 'emergency':
      break;
  }
  return c;
}

// ---------------------------------------------------------------- month end

export function endMonth(s: GameState): void {
  const run = s.run;
  if (!run || run.queue.length || run.day < DAYS) return;
  for (const f of ['player', 'rival'] as const) settle(s, f);
  people(s);
  // A month on the job is a month of experience; the laid-up mend.
  const worked = new Set(s.people.flatMap((p) => p.jobs.filter((j) => !j.stalled && j.hoods).flatMap((j) => j.squad)));
  for (const h of s.hoods) {
    if (h.status === 'wounded' || h.status === 'jailed') {
      if (--h.recover <= 0) h.status = 'active';
    } else if (h.status === 'active' && worked.has(h.id)) {
      h.xp++;
      if (h.xp === PROMOTE_XP && h.family === 'player')
        s.run!.news.push({
          headline: `WHO IS ${h.name.toUpperCase()}?`,
          body: `Shopkeepers on the west side say a new face has been "very persuasive" this year. ${hoodFirst(h)} declined to comment, persuasively.`,
          weight: 2,
        });
    }
  }
  s.hoods = s.hoods.filter((h) => h.status !== 'dead');
  freshMarket(s);
  for (const p of s.people) {
    p.jobs = p.jobs.filter((j) => !j.done);
    p.pending = null;
    p.x = p.homeX;
    p.y = p.homeY;
  }
  planFamily(s, 'rival');
  wire(s);
  s.news = [...run.news].sort((a, b) => b.weight - a.weight).slice(0, 6);
  if (!s.news.length)
    s.news = [
      {
        headline: 'QUIET MONTH IN THE WARD',
        body: 'Police report "nothing of note." Several shopkeepers report the same, a little too quickly.',
        weight: 1,
      },
    ];
  s.run = null;
  checkOver(s);
  s.month++;
  for (const f of ['player', 'rival'] as const) {
    const fam = s.families[f];
    fam.actions = Math.max(0, 2 + (lieutenants(s, f).length >= 3 ? 1 : 0) - fam.actionDebt);
    fam.actionDebt = 0;
    allocate(s, f);
  }
  advanceLessons(s);
}

function jobOf(s: GameState, f: FamilyId, kind: JobKind): { p: Person; j: Job } | null {
  for (const p of members(s, f)) for (const j of p.jobs) if (j.kind === kind) return { p, j };
  return null;
}

function skim(s: GameState, f: FamilyId, p: Person | undefined, income: number, where: string): void {
  if (!p || !p.traits.includes('greedy') || p.role === 'boss' || !income || !chance(s, 0.6)) return;
  spend(s, f, Math.round(income * 0.15), `${where}: takings came up short`);
}

function settle(s: GameState, f: FamilyId): void {
  const fam = s.families[f];

  // Protection: the collectors get round as many doors as they can (five shops,
  // or ten homes, a pair of hands), best payers first.
  const shops = protectedBy(s, f).sort((a, b) => b.protection - a.protection);
  const col = jobOf(s, f, 'collect');
  let room = col && !col.j.stalled ? col.j.hoods * 5 : 0;
  let take = 0;
  let got = 0;
  shops.forEach((b) => {
    const cost = stopsOf([b]);
    if (room >= cost) {
      room -= cost;
      take += b.protection;
      got++;
      b.uncollected = 0;
    } else {
      b.uncollected++;
      if (b.uncollected >= 2 && chance(s, 0.5)) {
        b.protectedBy = null;
        b.uncollected = 0;
        log(s, `${b.name} stopped paying. Nobody had been round in months.`, f);
      }
    }
  });
  if (take) earn(s, f, take, `Protection from ${got} of ${shops.length} shops and homes`);
  skim(s, f, col?.p, take, 'Protection');
  if (shops.length > got) fam.ledger.push({ label: `${shops.length - got} not collected (short of hoods)`, amount: 0 });

  // Stills, then bars, then the dens.
  const dist_ = jobOf(s, f, 'distill');
  const stills = rackets(s, f, 'still').filter((b) => !b.raided);
  const making = dist_ && !dist_.j.stalled ? Math.min(stills.length, dist_.j.hoods) : 0;
  if (making) {
    fam.liquor += making * STILL_OUTPUT;
    fam.ledger.push({ label: `${making * STILL_OUTPUT} cases distilled`, amount: 0 });
  }
  const bars = rackets(s, f, 'speakeasy').filter((b) => !b.raided);
  const run_ = jobOf(s, f, 'runSpeak');
  const open = run_ && !run_.j.stalled ? Math.min(bars.length, run_.j.hoods) : 0;
  if (open) {
    let need = open * LIQUOR_PER_BAR;
    const sup = jobOf(s, f, 'supply');
    if (sup && sup.j.hoods && sup.j.car) {
      const used = Math.min(fam.liquor, need);
      fam.liquor -= used;
      need -= used;
    }
    if (need) spend(s, f, need * MARKET_LIQUOR, `${need} cases bought on the open market`);
    let inc = 0;
    for (const b of bars.slice(0, open)) inc += ownCut(s, f, b, INCOME.speakeasy);
    earn(s, f, inc, `${open} speakeas${open === 1 ? 'y' : 'ies'}`);
    skim(s, f, run_!.p, inc, 'Speakeasies');
  }
  if (bars.length > open) fam.ledger.push({ label: `${bars.length - open} bar(s) shut: nobody to run them`, amount: 0 });
  const dens = rackets(s, f, 'gambling').filter((b) => !b.raided);
  const gam = jobOf(s, f, 'runGamble');
  const dealing = gam && !gam.j.stalled ? Math.min(dens.length, gam.j.hoods) : 0;
  if (dealing) {
    let inc = 0;
    for (const b of dens.slice(0, dealing)) inc += ownCut(s, f, b, INCOME.gambling);
    earn(s, f, inc, `${dealing} gambling den${dealing === 1 ? '' : 's'}`);
    skim(s, f, gam!.p, inc, 'Gambling');
  }
  for (const b of owned(s, f).filter((b) => b.raided)) fam.ledger.push({ label: `${b.name}: shut by a raid`, amount: 0 });
  if (fam.liquor > 40) {
    const sell = fam.liquor - 40;
    fam.liquor = 40;
    earn(s, f, sell * WHOLESALE_LIQUOR, `${sell} spare cases sold to other bars`);
  }
  const fronts = owned(s, f).length;
  if (fronts) earn(s, f, fronts * 50, `Legit trade at ${fronts} front${fronts === 1 ? '' : 's'}`);

  // Costs.
  const pay = jobOf(s, f, 'payoff');
  if (fam.captain && pay) spend(s, f, Math.max(150, 250 - pay.p.charm * 10), 'Captain Hollis');
  const crew = totalHoods(s, f);
  if (crew) spend(s, f, crew * WAGE, `Wages for ${crew} hoods`);
  for (const l of lieutenants(s, f))
    spend(s, f, l.status === 'jailed' ? 100 : l.cut, l.status === 'jailed' ? `Lawyer's fees for ${first(l)}` : `${first(l)}'s cut`);
  for (const k of fam.specialists) spend(s, f, SPECIALISTS[k].retainer, `${SPECIALISTS[k].title}'s retainer`);

  // Heat.
  addHeat(s, f, -6, 'The newspapers moved on');
  if (fam.captain) addHeat(s, f, -5, 'Captain looking the other way');
  const share = (owned(s, f).length + protectedBy(s, f).length) / s.buildings.length;
  if (share > 0.4) addHeat(s, f, Math.round((share - 0.4) * 40), 'Papers asking who runs the ward');
}

/** A lieutenant given a building of their own keeps half its takings. */
function ownCut(s: GameState, f: FamilyId, b: Building, inc: number): number {
  const keeper = lieutenants(s, f).find((l) => l.ownBuilding === b.id);
  if (!keeper) return inc;
  s.families[f].ledger.push({ label: `${first(keeper)} kept half of ${b.name}`, amount: 0 });
  return Math.round(inc / 2);
}

function people(s: GameState): void {
  for (const p of s.people) {
    if (p.status === 'dead' || p.status === 'defected') continue;
    if (p.status === 'wounded' || p.status === 'jailed') {
      if (--p.recover <= 0) {
        if (p.status === 'jailed')
          story(s, `${p.name.toUpperCase()} RELEASED`, 'Charges were dropped after the key witness "remembered nothing."', 3);
        p.status = 'active';
      }
      continue;
    }
    if (p.role === 'boss') continue;
    const fam = s.families[p.family];
    const branches = branchesOf(s, p).length;
    p.ambition = Math.min(100, p.ambition + branches * 2 + p.wins * 3 + (p.traits.includes('ambitious') ? 4 : 0));
    const soft = p.traits.includes('loyal') ? 0.5 : 1;
    if (p.demand) {
      p.demand.age++;
      p.loyalty = Math.max(0, p.loyalty - Math.round(8 * soft));
      if (p.family === 'rival' && chance(s, 0.5)) {
        if (p.demand.kind === 'raise') p.cut += p.demand.amount;
        p.loyalty += 15;
        p.demand = null;
      }
    }
    if (fam.cash < 0) p.loyalty = Math.max(0, p.loyalty - Math.round(5 * soft));
    if (p.wins) p.loyalty = Math.min(100, p.loyalty + 2);
    if (!p.demand && p.ambition >= 50 && chance(s, 0.5)) {
      const want = owned(s, p.family).find((b) => b.racket && !lieutenants(s, p.family).some((l) => l.ownBuilding === b.id));
      p.demand = want
        ? {
            kind: 'building',
            amount: 0,
            buildingId: want.id,
            text: `wants ${want.name} as their own: they'd keep half of what it makes`,
            age: 0,
          }
        : { kind: 'raise', amount: 50, buildingId: null, text: 'wants a bigger cut: +$50 a month', age: 0 };
      if (p.family === 'player') s.stats.demandsSeen++;
    }
    p.plotting = (p.loyalty < 30 && p.ambition > 50) || (!!p.demand && p.demand.age >= 3 && p.loyalty < 40) || p.loyalty < 15;
  }
}

function wire(s: GameState): void {
  const w: GameState['wire'] = [];
  if (s.families.rival.notice) {
    for (const r of active(s, 'rival')) {
      for (const j of r.jobs) {
        if (JOBS[j.kind].ongoing || !targetsPlayer(s, j)) continue;
        if (!chance(s, 0.45 + (r.traits.includes('looselips') ? 0.3 : 0))) continue;
        const b = building(s, j.target);
        if (b && chance(s, 0.5)) w.push({ confidence: 'Rumour', text: `Calloway's people are looking at shops on ${streetOf(b)}.` });
        else w.push({ confidence: 'Likely', text: `${label(r)} is planning: ${jobTitle(s, j).toLowerCase()}.` });
      }
    }
  }
  for (const l of lieutenants(s, 'player')) {
    if (l.status !== 'active') continue;
    if (l.plotting && chance(s, 0.75))
      w.push({ confidence: 'Likely', text: `${first(l)} was seen having coffee with Calloway's people. Twice.` });
    else if (l.loyalty < 45 && chance(s, 0.5))
      w.push({ confidence: 'Rumour', text: `${first(l)} has been complaining about the boss to the crew.` });
    if (l.traits.includes('greedy') && chance(s, 0.3))
      w.push({ confidence: 'Rumour', text: `${first(l)} turned up in a new Packard. On what we pay?` });
  }
  const rp = active(s, 'rival').find((l) => l.plotting);
  if (rp && chance(s, 0.6)) w.push({ confidence: 'Rumour', text: `${first(rp)} isn't happy over at Calloway's.` });
  s.wire = w;
}

export function score(s: GameState, f: FamilyId): number {
  return (
    owned(s, f).length * 600 +
    rackets(s, f).length * 500 +
    protectedShops(s, f).length * 250 +
    protectedHomes(s, f).length * 60 +
    Math.max(0, s.families[f].cash) / 2
  );
}

function checkOver(s: GameState): void {
  const p = s.families.player;
  const when = monthName(s.month);
  const rivalLeft = owned(s, 'rival').length + protectedBy(s, 'rival').length;
  if (rivalLeft === 0) {
    s.over = {
      result: 'win',
      headline: 'CALLOWAY OUTFIT FINISHED',
      text: `By ${when} the Calloway Outfit had nothing left in the ward. Big Jim was last seen boarding a train to Florida. The ward belongs to ${bossOf(s, 'player').name}.`,
    };
  } else if (p.cash < -1000) {
    s.over = {
      result: 'loss',
      headline: 'RUSSO NEPHEW SKIPS TOWN',
      text: `By ${when} the debts were bigger than the family. ${bossOf(s, 'player').name} was last seen leaving town owing money to everyone.`,
    };
  } else if (s.month >= s.lastMonth) {
    // Year one is about becoming a family: judged on what you built.
    const us = score(s, 'player');
    const tally = `${owned(s, 'player').length} buildings, ${rackets(s, 'player').length} rackets and ${protectedShops(s, 'player').length} shops and ${protectedHomes(s, 'player').length} homes paying protection (Calloway: ${owned(s, 'rival').length}, ${rackets(s, 'rival').length}, ${protectedShops(s, 'rival').length} and ${protectedHomes(s, 'rival').length})`;
    s.over =
      us >= WIN_SCORE
        ? {
            result: 'win',
            headline: 'RUSSO NAME RISES IN THE WARD',
            text: `A year ago the Nephew had $300 and two cousins. Now: ${tally}. Calloway has started locking his door at night.`,
          }
        : us >= DRAW_SCORE
          ? {
              result: 'draw',
              headline: 'NEPHEW STILL STANDING',
              text: `A year ago the Nephew had $300 and two cousins. Now: ${tally}. A small outfit, but a real one.`,
            }
          : {
              result: 'loss',
              headline: "CALLOWAY'S WARD, STILL",
              text: `A year on: ${tally}. The Nephew is a nuisance, not a rival. Aldo will hear about this in Joliet.`,
            };
  }
}

export const WIN_SCORE = 5000;
export const DRAW_SCORE = 2500;

// ---------------------------------------------------------------- new game

export function createGame(seed: number, boss?: string, lessons = true): GameState {
  const s = newGame(seed, boss);
  s.lessons.on = lessons;
  planFamily(s, 'rival');
  allocate(s, 'rival');
  allocate(s, 'player');
  advanceLessons(s);
  // The first lesson seeds the boss's opening jobs: give them their squads.
  allocate(s, 'player');
  freshMarket(s);
  return s;
}

export { BRANCHES };
