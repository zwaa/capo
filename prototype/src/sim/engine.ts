// The month engine (v2). Each person runs a ranked list of jobs across the
// branches they hold. Hoods and cars are handed out from the top of each list.
// A month runs day by day; any day can raise a Card the player must answer.

import { planFamily } from './ai';
import { advanceLessons } from './lessons';
import { chance, int, pick, rand } from './rng';
import { POOL, blankJob, makePerson, newGame, streetOf } from './setup';
import type { Branch, Building, Card, CardOption, FamilyId, GameState, Job, JobKind, Person, Posture, ScheduledEvent, SpecialistKind } from './types';
import {
  BRANCHES,
  DAYS,
  FITOUT_COST,
  HIRE_COST,
  INCOME,
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
  branchInfo,
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
  rackets,
  targets,
  totalHoods,
} from './util';

// ---------------------------------------------------------------- small helpers

const HEAT: Record<Posture, number> = { quiet: 1, firm: 4, loud: 9 };
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
const statFor = (p: Person, kind: JobKind) => p[branchInfo(JOBS[kind].branch).stat];

function gunFactor(s: GameState, f: FamilyId): number {
  const armed = Math.min(1, s.families[f].guns / Math.max(1, totalHoods(s, f)));
  return (0.55 + 0.45 * armed) * (has(s, f, 'armourer') ? 1.15 : 1);
}
function force(s: GameState, f: FamilyId, hoods: number, p: Person | null, posture: Posture): number {
  const muscle = p?.muscle ?? 5;
  const nerve = p?.nerve ?? 5;
  return hoods * (1 + muscle / 10) * FORCE[posture] * gunFactor(s, f) + nerve * 0.25;
}

// ---------------------------------------------------------------- orders API (between months)

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

export function transferHoods(s: GameState, fromId: string, toId: string, n = 1): void {
  const a = person(s, fromId);
  const b = person(s, toId);
  if (!a || !b || a.family !== b.family || s.run) return;
  const k = Math.min(n, a.crew);
  a.crew -= k;
  b.crew += k;
  allocate(s, a.family);
}

export type Purchase = 'hood' | 'gun' | 'car';

export function priceOf(s: GameState, what: Purchase): number {
  return what === 'hood' ? hoodPrice(s, 'player') : what === 'gun' ? gunPrice(s, 'player') : carPrice(s, 'player');
}

export function purchase(s: GameState, f: FamilyId, what: Purchase, forId?: string): string | null {
  const fam = s.families[f];
  const cost = what === 'hood' ? hoodPrice(s, f) : what === 'gun' ? gunPrice(s, f) : carPrice(s, f);
  if (fam.cash < cost) return 'Not enough cash.';
  if (what === 'hood') {
    const p = person(s, forId ?? fam.bossId);
    if (!p || p.family !== f) return 'Nobody to take them on.';
    p.crew++;
    spend(s, f, cost, has(s, f, 'recruiter') ? 'A hood, through the recruiter' : 'A hood off the street');
  } else if (what === 'gun') {
    fam.guns++;
    spend(s, f, cost, has(s, f, 'armourer') ? 'A pistol from the armourer' : 'A pistol, no questions asked');
  } else {
    fam.cars++;
    spend(s, f, cost, has(s, f, 'mechanic') ? 'A car from the mechanic' : 'A used sedan');
  }
  allocate(s, f);
  return null;
}

export type BossAction = { kind: 'hire'; pool: number } | { kind: 'specialist'; which: SpecialistKind } | { kind: 'grant'; lt: string } | { kind: 'reward'; lt: string };

export function canAct(s: GameState, a: BossAction): string | null {
  const fam = s.families.player;
  if (s.run || s.over) return 'Not now.';
  const freeCandidate = a.kind === 'hire' && s.candidates.includes(a.pool);
  if (fam.actions <= 0 && !freeCandidate) return 'No meetings left this month.';
  switch (a.kind) {
    case 'hire':
      if (lieutenants(s, 'player').length >= LT_CAP) return 'Six lieutenants is the limit.';
      if (!POOL[a.pool] || s.people.some((p) => p.name === POOL[a.pool].name)) return 'Not available.';
      return freeCandidate || fam.cash >= HIRE_COST ? null : 'Not enough cash.';
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
  }
}

export function bossAction(s: GameState, a: BossAction): string {
  const why = canAct(s, a);
  if (why) return why;
  const fam = s.families.player;
  switch (a.kind) {
    case 'hire': {
      const free = s.candidates.includes(a.pool);
      if (free) s.candidates = s.candidates.filter((c) => c !== a.pool);
      else {
        fam.actions--;
        spend(s, 'player', HIRE_COST, `Signing on ${POOL[a.pool].name}`);
      }
      const r = POOL[a.pool];
      const boss = bossOf(s, 'player');
      const l = makePerson(`lt${s.nextId++}`, 'player', 'lt', r.name, r.nickname, r.s, r.traits, 0, { x: boss.homeX, y: boss.homeY });
      s.people.push(l);
      advanceLessons(s);
      return `${label(l)} has joined the family. Give them a branch or two, and some hoods.`;
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
  }
}

// ---------------------------------------------------------------- allocation

export function needFor(s: GameState, f: FamilyId, j: Job, p: Person): number {
  const k = j.kind;
  let n: number;
  switch (k) {
    case 'collect':
      n = Math.ceil(protectedBy(s, f).length / 5);
      break;
    case 'signup':
      n = building(s, j.target)?.protectedBy === other(f) ? 3 : 1;
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

/** Hand out hoods (per person) and cars (per family) from the top of each list down. */
export function allocate(s: GameState, f: FamilyId): void {
  let cars = s.families[f].cars;
  const runners = members(s, f).sort((a, b) => (a.role === 'boss' ? -1 : b.role === 'boss' ? 1 : 0));
  for (const p of runners) {
    // The runner works too: a crew of two is three pairs of hands.
    let left = p.status === 'active' ? p.crew + 1 : 0;
    for (const j of p.jobs) {
      if (j.done) continue;
      j.need = needFor(s, f, j, p);
      j.hoods = 0;
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
      const cost = j.kind === 'buy' ? price(building(s, j.target)!, f) : j.kind === 'fitout' ? FITOUT_COST : j.kind === 'phone' ? PHONE_COST : 0;
      if (cost > s.families[f].cash) {
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
  for (const b of s.buildings) b.raided = false;
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
  const adj = j.posture === 'quiet' ? 1 : j.posture === 'loud' ? -1 : 0;
  j.days = Math.max(1, info.work - Math.floor((statFor(p, j.kind) - 5) / 2) + adj + (info.risky && p.traits.includes('cautious') ? 2 : 0));
}

function schedule(s: GameState): void {
  const run = s.run!;
  const pf = s.families.player;
  const add = (kind: ScheduledEvent['kind'], ref: string | null = null, from = 3, to = 27) => run.scheduled.push({ day: int(s, from, to), kind, ref });
  if (pf.heat >= 15 && chance(s, 0.25 + pf.heat / 150)) add('cop');
  const supply = members(s, 'player').flatMap((p) => p.jobs).find((j) => j.kind === 'supply' && j.hoods);
  if (supply && chance(s, has(s, 'player', 'mechanic') ? 0.25 : 0.5)) add('tail');
  if (s.month > 0) {
    const n = int(s, 1, 2);
    for (let i = 0; i < n; i++) add(pick(s, s.families.rival.notice ? (['offer', 'bail', 'snitch'] as const) : (['offer', 'bail'] as const)));
  }
  for (const p of s.people) if (p.plotting && p.status === 'active') add('defect', p.id, 6, 22);
  // Informants: rival moves against us get tipped off a few days early.
  for (const r of active(s, 'rival')) {
    for (const j of r.jobs) {
      if (JOBS[j.kind].ongoing || j.stalled || !targetsPlayer(s, j)) continue;
      const eta = Math.ceil(dist(r, targetPos(s, j)) / (j.car ? 2 : 1)) + j.days;
      if (eta > 3 && chance(s, 0.4 + (r.traits.includes('looselips') ? 0.3 : 0))) run.scheduled.push({ day: Math.max(1, eta - 3), kind: 'tip', ref: j.id });
    }
  }
}

function targetsPlayer(s: GameState, j: Job): boolean {
  const b = building(s, j.target);
  if (b) return b.owner === 'player' || b.protectedBy === 'player';
  return person(s, j.target)?.family === 'player';
}

function targetPos(s: GameState, j: Job): { x: number; y: number } {
  return building(s, j.target) ?? person(s, j.target) ?? { x: j.x, y: j.y };
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
        if (j.progress >= j.days) complete(s, p, j);
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
  if (p.traits.includes('hothead') && j.posture !== 'loud' && ['signup', 'hit', 'wreck', 'takeover'].includes(j.kind) && chance(s, 0.6 - p.authority / 200)) {
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
      if (mine) emergency(s, `${first(there)} has been arrested`, `${label(there)} was picked up in the raid on ${b.name}. Their jobs stop until they're out.`, b);
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
      const b = pick(s, s.buildings.filter((x) => x.owner === 'player' || x.protectedBy === 'player'));
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
      const b = pick(s, s.buildings.filter((x) => x.owner === null && x.protectedBy !== 'rival'));
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
      const p = pick(s, active(s, 'player').filter((x) => x.crew > 1));
      if (!p) return;
      card(s, {
        kind: 'bail',
        title: `One of ${first(p)}'s boys is in the tank`,
        text: `Young Tony from ${p.role === 'boss' ? 'your' : `${first(p)}'s`} crew broke a bottle over a sailor's head at a dance hall. He's in a cell and he's scared, and scared men talk.`,
        options: [
          { id: 'pay', label: 'Pay his bail ($150)', hint: 'The crew sees you look after your own', disabled: pf.cash < 150 },
          { id: 'leave', label: 'Let him sit', hint: 'Lose a hood. He might say something. Heat +5.' },
        ],
        ctx: { p: p.id },
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
      emergency(s, 'Word on the street', `A bartender on ${streetOf(r)} says ${label(r)} is ${jobTitle(s, j).toLowerCase()}, maybe in three days. [Likely]`, targetPos(s, j));
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
  const what = shops.length ? ` and ${shops.length} shops that used to pay us` : '';
  log(s, `${label(p)} has gone over to ${s.families[to].name}, taking ${p.crew} hoods${what}.`, from);
  story(s, `${p.nickname.toUpperCase()} CHANGES TEAMS`, `Associates of ${p.name} say the ${p.nickname} "just wanted a fresh start." The fresh start includes ${p.crew} men${what}.`, 8);
  if (from === 'player') {
    emergency(s, `${first(p)} has betrayed you`, `${label(p)} walked out to the Calloway Outfit with ${p.crew} hoods${what}. Their branches are back on your desk.`, p);
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
      const pr = Math.max(0.15, Math.min(0.95, 0.4 + p.charm * 0.04 + p.muscle * 0.02 + (j.posture === 'quiet' ? -0.1 : j.posture === 'loud' ? 0.15 : 0)));
      if (chance(s, pr)) return signUp(s, b, p, j.posture);
      if (f === 'player') {
        card(s, {
          kind: 'shopkeeper',
          title: 'The shopkeeper says no',
          text: `The owner of ${b.name} told ${name} he's "already got insurance, thank you." He says it with a shaking voice.`,
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
    case 'buy': {
      if (!b || b.owner) return;
      const cost = price(b, f);
      if (fam.cash < cost) return log(s, `${name} couldn't raise the $${cost} for ${b.name}.`, f);
      spend(s, f, cost, `Bought ${b.name}`);
      b.owner = f;
      b.protectedBy = null;
      p.wins++;
      log(s, `${name} bought ${b.name}.`, f);
      if (f === 'player') story(s, `${b.name.toUpperCase()} CHANGES HANDS`, `${b.name} on ${streetOf(b)} has been sold to "a local businessman." The old owner is said to be delighted, and to be moving to Florida.`, 4);
      advanceLessons(s);
      return;
    }
    case 'fitout': {
      if (!b || b.owner !== f || b.racket) return;
      if (fam.cash < FITOUT_COST) return log(s, `${name} couldn't afford to fit out ${b.name}.`, f);
      spend(s, f, FITOUT_COST, `Back room fitted at ${b.name}`);
      b.racket = b.suits;
      p.wins++;
      log(s, `${name} opened a ${b.racket} in the back of ${b.name}.`, f);
      if (f === 'player') story(s, `${b.front.toUpperCase()} DOES BRISK LATE TRADE`, `${b.name} on ${streetOf(b)} reports unusual demand for its services after 10 p.m.`, 3);
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

function signUp(s: GameState, b: Building, p: Person, posture: Posture): void {
  const f = p.family;
  b.protectedBy = f;
  b.uncollected = 0;
  p.wins++;
  addHeat(s, f, HEAT[posture], `${b.name} "persuaded" (${posture})`);
  log(s, `${first(p)} signed up ${b.name}. It pays $${b.protection} a month.`, f);
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

function fightFor(s: GameState, att: Person, j: Job, target: Building | Person): void {
  const af = att.family;
  const df = other(af);
  const isBuilding = 'front' in target;
  let D: number;
  let defenders: Person[] = [];
  if (isBuilding) {
    const g = guardsAt(s, target);
    defenders = g.map((x) => x.p);
    const base = target.owner ? 2.5 : 1;
    D = force(s, df, base, null, 'firm') + g.reduce((n, x) => n + force(s, df, x.j.hoods, x.p, 'firm') * 1.2, 0);
  } else {
    defenders = [target];
    D = force(s, df, Math.ceil(target.crew * 0.5), target, 'firm');
  }
  const A = force(s, af, j.hoods, att, j.posture) * (isBuilding ? 1 : 1.15);
  const ctx: FightCtx = { att: att.id, job: j.id, target: target.id, a: A, d: D, defs: defenders.map((x) => x.id).join(','), posture: j.posture, kind: j.kind, hoods: j.hoods };
  const playerInvolved = af === 'player' || (isBuilding ? target.owner === 'player' || target.protectedBy === 'player' : target.family === 'player');
  if (playerInvolved && (defenders.length || af === 'player')) fightCard(s, ctx, target);
  else resolveFight(s, ctx, 0);
}

function fightCard(s: GameState, ctx: FightCtx, where: { x: number; y: number }): void {
  const att = person(s, String(ctx.att))!;
  const attacking = att.family === 'player';
  const defs = String(ctx.defs).split(',').filter(Boolean).map((id) => person(s, id)!);
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
      { id: 'help', label: helper ? `Call ${first(helper)} by telephone` : 'Call for help', hint: helper ? `${first(helper)} is by a telephone and close enough to come` : 'Nobody close enough by a telephone', disabled: !helper },
      { id: 'give', label: b ? 'Give it up' : 'Scatter', hint: b ? 'Lose it, keep the men' : 'Run for it, lose some pride' },
    ];
    if (helper) ctx.helper = helper.id;
  }
  const them = attacking ? (defs.length ? defs.map(label).join(' and ') : 'a couple of hired men') : label(att);
  card(s, {
    kind: 'fight',
    title: attacking ? `${first(att)} is about to hit ${place}` : `${label(att)} is coming for ${place}`,
    text: attacking ? `${first(att)}'s crew is outside ${place}. ${them} inside. Once it starts it can't be stopped.` : `Cars pull up outside ${place}: ${them}, with ${ctx.hoods} hoods. Ours inside: ${defs.map(first).join(', ') || 'just the shop'}.`,
    options,
    ctx,
    focus: where,
  });
}

function helperFor(s: GameState, where: { x: number; y: number }, exclude: Person[]): Person | undefined {
  return active(s, 'player')
    .filter((p) => !exclude.includes(p) && p.crew > 0 && dist(p, where) <= 4)
    .filter((p) => s.buildings.some((b) => b.telephone && b.owner === 'player' && b.x === p.x && b.y === p.y))
    .sort((a, b) => dist(a, where) - dist(b, where))[0];
}

function resolveFight(s: GameState, ctx: FightCtx, mod: number): void {
  const att = person(s, String(ctx.att))!;
  const af = att.family;
  const df = other(af);
  const job = att.jobs.find((x) => x.id === ctx.job);
  const b = building(s, String(ctx.target));
  const target = b ? null : person(s, String(ctx.target))!;
  const defs = String(ctx.defs).split(',').filter(Boolean).map((id) => person(s, id)!).filter((d) => d.status === 'active');
  const posture = String(ctx.posture) as Posture;
  const A = Number(ctx.a);
  const D = Number(ctx.d);
  const win = rand(s) < Math.max(0.05, Math.min(0.95, A / (A + D) + mod));
  const place = b ? b.name : streetOf(att);
  if (af === 'player' || df === 'player') s.stats.fights++;

  addHeat(s, af, posture === 'loud' ? 18 : posture === 'firm' ? 10 : 5, `Gunfire at ${place}`);
  if (defs.length) addHeat(s, df, 4, `Gunfire at ${place}`);

  // Hoods lost, and their guns with them.
  const lose = (p: Person, n: number) => {
    const k = Math.min(p.crew, n);
    p.crew -= k;
    s.families[p.family].guns = Math.max(0, s.families[p.family].guns - k);
  };
  if (win) {
    for (const d of defs) lose(d, int(s, 1, posture === 'loud' ? 3 : 2));
    lose(att, int(s, 0, 1));
  } else {
    lose(att, int(s, 1, posture === 'loud' ? 3 : 2));
    for (const d of defs) lose(d, int(s, 0, 1));
  }

  // Hays Code: we never see it. We hear about it.
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
    const nab = pick(s, [att, ...defs].filter((p) => p.status === 'active'));
    if (nab && !(has(s, nab.family, 'lawyer') && chance(s, 0.5))) {
      arrest(s, nab);
      hurt.push(nab);
    }
  }

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
  if (job) job.done = true;

  const fates = hurt.map((l) => `${l.name} (${l.status === 'dead' ? 'found in the river' : l.status === 'jailed' ? 'arrested at the scene' : 'in hospital, "fell down some stairs"'})`).join('; ');
  story(
    s,
    pick(s, ['SHOTS RING OUT ON ', 'NIGHT OF TERROR ON ', 'GANGLAND FLARE-UP ON ']) + streetOf(b ?? att).toUpperCase(),
    `Residents of ${streetOf(b ?? att)} report "a sound like a dozen typewriters" near ${place} at around 2 a.m. ` +
      (fates ? `Police later confirmed: ${fates}. ` : 'No bodies were found, which police called "a pleasant change." ') +
      'Captain Hollis assured the public that crime does not pay.',
    7,
  );

  allocate(s, 'player');
  allocate(s, 'rival');

  const ours = hurt.filter((l) => l.family === 'player');
  const lost = b && win && df === 'player';
  if (ours.length || lost) {
    const what = [lost ? `we lost ${b!.name}` : '', ...ours.map((l) => `${label(l)} is ${l.status === 'dead' ? 'dead' : l.status === 'jailed' ? 'in a cell' : 'in hospital'}`)].filter(Boolean).join('; ');
    emergency(s, 'Bad night', `${what[0].toUpperCase()}${what.slice(1)}.`, b ?? att);
  }
  if (hurt.some((l) => l.family === 'player' && l.status === 'dead')) s.families.player.grudge = true;
  if (hurt.some((l) => l.family === 'rival') || (b && win && df === 'rival')) {
    if (hurt.some((l) => l.family === 'rival' && l.status === 'dead')) s.families.rival.grudge = true;
    s.families.rival.notice = true;
    rivalRespond(s, b ?? undefined);
  }
}

function kill_(s: GameState, p: Person): void {
  p.status = 'dead';
  const fam = s.families[p.family];
  for (const b of branchesOf(s, p)) assignBranch(s, p.family, b, fam.bossId);
  for (const m of members(s, p.family)) if (m.role === 'lt') m.loyalty = Math.max(0, m.loyalty - 3);
  // The crew drifts back to the boss.
  bossOf(s, p.family).crew += p.crew;
  p.crew = 0;
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
      { id: 'replan', label: 'Change of Plans', hint: left > 0 ? `Re-rank or add jobs now (${left} left; costs a meeting next month)` : 'No more changes this month', disabled: left <= 0 },
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
  if (p.role !== 'boss') log(s, `${first(p)} has new orders (${how === 'phone' ? 'by telephone' : how === 'runner' ? 'by runner' : 'in person'}).`, p.family);
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
    .filter((p) => p.crew >= 3)
    .map((p) => ({ p, r: reach(s, p.id) }))
    .filter((c) => c.r.kind !== 'unavailable')
    .sort((a, b2) => a.r.days - b2.r.days || b2.p.crew - a.p.crew);
  const c = cands[0];
  if (!c) return;
  const tgt = b && (b.owner === 'player' || b.protectedBy === 'player') ? b : s.buildings.filter((x) => x.protectedBy === 'player' && !x.owner).sort((x, y) => dist(x, c.p) - dist(y, c.p))[0];
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
        const r = active(s, 'rival').sort((a, b2) => b2.crew - a.crew)[0];
        if (r && r.crew) r.crew--;
        log(s, r ? `The tail was one of ${first(r)}'s men. Was.` : 'The tail will not be following anyone again.', 'player');
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
      if (!p) break;
      if (optionId === 'pay') {
        spend(s, 'player', 150, `Bail for one of ${first(p)}'s boys`);
        p.loyalty = Math.min(100, p.loyalty + 4);
        p.authority = Math.min(100, p.authority + 3);
      } else {
        p.crew = Math.max(0, p.crew - 1);
        addHeat(s, 'player', 5, 'A scared hood talking in a cell');
        allocate(s, 'player');
      }
      break;
    }
    case 'snitch': {
      if (optionId !== 'buy' || !p) break;
      spend(s, 'player', 150, 'A Calloway driver');
      const j = p.jobs.find((x) => !JOBS[x.kind].ongoing && !x.done && !x.stalled);
      emergency(s, 'What the driver said', `${label(p)} is ${j ? jobTitle(s, j).toLowerCase() : 'sitting tight'}. [Confirmed]`, j ? targetPos(s, j) : p);
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
            c.ctx.d = Number(c.ctx.d) + force(s, 'player', h.crew, h, 'firm');
            c.ctx.defs = `${c.ctx.defs},${h.id}`.replace(/^,/, '');
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
        story(s, 'CALLOWAY OUTFIT "UNAFFECTED" BY DEPARTURE', `Big Jim Calloway says ${p.name} "was never really one of us." He then broke a chair.`, 6);
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
  for (const p of s.people) {
    p.jobs = p.jobs.filter((j) => !j.done);
    p.pending = null;
    p.x = p.homeX;
    p.y = p.homeY;
  }
  planFamily(s, 'rival');
  wire(s);
  s.news = [...run.news].sort((a, b) => b.weight - a.weight).slice(0, 6);
  if (!s.news.length) s.news = [{ headline: 'QUIET MONTH IN THE WARD', body: 'Police report "nothing of note." Several shopkeepers report the same, a little too quickly.', weight: 1 }];
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

  // Protection: the collectors get round as many shops as they can.
  const shops = protectedBy(s, f).sort((a, b) => b.protection - a.protection);
  const col = jobOf(s, f, 'collect');
  const reached = col && !col.j.stalled ? col.j.hoods * 5 : 0;
  let take = 0;
  shops.forEach((b, i) => {
    if (i < reached) {
      take += b.protection;
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
  if (take) earn(s, f, take, `Protection from ${Math.min(reached, shops.length)} of ${shops.length} shops`);
  skim(s, f, col?.p, take, 'Protection');
  if (shops.length > reached && shops.length) fam.ledger.push({ label: `${shops.length - Math.min(reached, shops.length)} shops not collected (short of hoods)`, amount: 0 });

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
  for (const l of lieutenants(s, f)) spend(s, f, l.status === 'jailed' ? 100 : l.cut, l.status === 'jailed' ? `Lawyer's fees for ${first(l)}` : `${first(l)}'s cut`);
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
        if (p.status === 'jailed') story(s, `${p.name.toUpperCase()} RELEASED`, 'Charges were dropped after the key witness "remembered nothing."', 3);
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
        ? { kind: 'building', amount: 0, buildingId: want.id, text: `wants ${want.name} as their own: they'd keep half of what it makes`, age: 0 }
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
    if (l.plotting && chance(s, 0.75)) w.push({ confidence: 'Likely', text: `${first(l)} was seen having coffee with Calloway's people. Twice.` });
    else if (l.loyalty < 45 && chance(s, 0.5)) w.push({ confidence: 'Rumour', text: `${first(l)} has been complaining about the boss to the crew.` });
    if (l.traits.includes('greedy') && chance(s, 0.3)) w.push({ confidence: 'Rumour', text: `${first(l)} turned up in a new Packard. On what we pay?` });
  }
  const rp = active(s, 'rival').find((l) => l.plotting);
  if (rp && chance(s, 0.6)) w.push({ confidence: 'Rumour', text: `${first(rp)} isn't happy over at Calloway's.` });
  s.wire = w;
}

export function score(s: GameState, f: FamilyId): number {
  return owned(s, f).length * 600 + rackets(s, f).length * 500 + protectedBy(s, f).length * 250 + Math.max(0, s.families[f].cash) / 2;
}

function checkOver(s: GameState): void {
  const p = s.families.player;
  const when = monthName(s.month);
  const rivalLeft = owned(s, 'rival').length + protectedBy(s, 'rival').length;
  if (rivalLeft === 0) {
    s.over = { result: 'win', headline: 'CALLOWAY OUTFIT FINISHED', text: `By ${when} the Calloway Outfit had nothing left in the ward. Big Jim was last seen boarding a train to Florida. The ward belongs to ${bossOf(s, 'player').name}.` };
  } else if (p.cash < -1000) {
    s.over = { result: 'loss', headline: 'RUSSO NEPHEW SKIPS TOWN', text: `By ${when} the debts were bigger than the family. ${bossOf(s, 'player').name} was last seen leaving town owing money to everyone.` };
  } else if (s.month >= s.lastMonth) {
    // Year one is about becoming a family: judged on what you built.
    const us = score(s, 'player');
    const tally = `${owned(s, 'player').length} buildings, ${rackets(s, 'player').length} rackets and ${protectedBy(s, 'player').length} shops paying protection (Calloway: ${owned(s, 'rival').length}, ${rackets(s, 'rival').length} and ${protectedBy(s, 'rival').length})`;
    s.over =
      us >= WIN_SCORE
        ? { result: 'win', headline: 'RUSSO NAME RISES IN THE WARD', text: `A year ago the Nephew had $300 and two cousins. Now: ${tally}. Calloway has started locking his door at night.` }
        : us >= DRAW_SCORE
          ? { result: 'draw', headline: 'NEPHEW STILL STANDING', text: `A year ago the Nephew had $300 and two cousins. Now: ${tally}. A small outfit, but a real one.` }
          : { result: 'loss', headline: "CALLOWAY'S WARD, STILL", text: `A year on: ${tally}. The Nephew is a nuisance, not a rival. Aldo will hear about this in Joliet.` };
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
  return s;
}

export { BRANCHES };
