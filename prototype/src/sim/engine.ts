// The month engine. A month runs day by day; any day can raise a Card that the
// player must answer before the month continues. Everything is deterministic
// given the seed and the answers.

import { planFamily } from './ai';
import { chance, int, pick, rand } from './rng';
import { RECRUITS, addressOf, makeLt, newGame } from './setup';
import type {
  Business,
  Card,
  CardOption,
  FamilyId,
  GameState,
  Lieutenant,
  Op,
  Order,
  Posture,
  ScheduledEvent,
} from './types';
import {
  CAPTAIN_COST,
  DAYS_IN_MONTH,
  HIRE_COST,
  LT_CAP,
  PHONE_COST,
  PHONE_UPKEEP,
  RACKET_COST,
  RACKET_INCOME,
  REWARD_COST,
  WAGE,
  activeLts,
  biz,
  dist,
  first,
  hqOf,
  label,
  ltById,
  lts,
  monthName,
  needsTarget,
  other,
  owned,
  validTargets,
} from './util';

// ---------------------------------------------------------------- helpers

const POSTURE_HEAT: Record<Posture, number> = { quiet: 1, firm: 4, loud: 9 };
const POSTURE_FORCE: Record<Posture, number> = { quiet: 0.8, firm: 1, loud: 1.3 };

function log(s: GameState, text: string, family: FamilyId | null): void {
  s.run?.log.push({ day: s.run.day, text, family });
}

function story(s: GameState, headline: string, body: string, weight: number): void {
  s.run?.news.push({ headline, body, weight });
}

export function addHeat(s: GameState, f: FamilyId, amount: number, why: string): void {
  const fam = s.families[f];
  const before = fam.heat;
  fam.heat = Math.max(0, Math.min(100, fam.heat + amount));
  const real = fam.heat - before;
  if (real !== 0) fam.heatLog.push({ label: why, amount: real });
}

export function spend(s: GameState, f: FamilyId, amount: number, why: string): void {
  s.families[f].cash -= amount;
  s.families[f].ledger.push({ label: why, amount: -amount });
}

function earn(s: GameState, f: FamilyId, amount: number, why: string): void {
  s.families[f].cash += amount;
  s.families[f].ledger.push({ label: why, amount });
}

function card(s: GameState, c: Omit<Card, 'id' | 'day'>): void {
  const run = s.run!;
  run.queue.push({ ...c, id: run.nextCardId++, day: run.day });
}

function strength(l: Lieutenant, posture: Posture): number {
  return (l.crew + 1) * (1 + l.muscle / 10) * POSTURE_FORCE[posture] + l.nerve * 0.3;
}

function daysNeeded(l: Lieutenant, o: Order): number {
  const p = o.posture === 'quiet' ? 2 : o.posture === 'loud' ? -2 : 0;
  switch (o.goal) {
    case 'expand':
      return Math.max(3, 9 - Math.floor(l.brains / 3) + p);
    case 'earn':
      return Math.max(3, 7 - Math.floor(l.brains / 4));
    case 'hit':
      return Math.max(2, 5 + p);
    case 'recruit':
      return 6;
    default:
      return 999; // hold / lie low: continuous
  }
}

function newOp(l: Lieutenant, o: Order): Op {
  return {
    ltId: l.id,
    goal: o.goal,
    target: o.target,
    posture: o.posture,
    daysNeeded: daysNeeded(l, o),
    progress: 0,
    done: false,
    pending: null,
    checked: false,
  };
}

function opPos(s: GameState, l: Lieutenant, op: Op): { x: number; y: number } {
  if (op.goal === 'hit') {
    const t = ltById(s, op.target);
    if (t) return t.status === 'active' ? t : l;
  }
  const b = biz(s, op.target);
  if (b) return b;
  return hqOf(s, l.family) ?? l;
}

/** Sanitise an order (targets can vanish between planning and execution). */
export function fixOrder(s: GameState, l: Lieutenant, o: Order): Order {
  if (!needsTarget(o.goal)) return { ...o, target: null };
  if (validTargets(s, l, o.goal).some((t) => t.id === o.target)) return o;
  const hq = hqOf(s, l.family);
  return { goal: 'hold', target: hq?.owner === l.family ? hq.id : null, posture: o.posture };
}

// ---------------------------------------------------------------- orders & boss actions

export function setOrder(s: GameState, ltId: string, o: Order): void {
  const l = ltById(s, ltId);
  if (!l || l.family !== 'player' || s.run) return;
  l.order = o;
}

export type BossAction =
  | { kind: 'phone'; biz: string }
  | { kind: 'grant'; lt: string }
  | { kind: 'reward'; lt: string }
  | { kind: 'captain' }
  | { kind: 'hire' };

export function canAct(s: GameState, a: BossAction): string | null {
  const fam = s.families.player;
  if (s.run || s.over) return 'Not now.';
  if (fam.actions <= 0) return 'No meetings left this month.';
  switch (a.kind) {
    case 'phone': {
      const b = biz(s, a.biz);
      if (!b || b.owner !== 'player') return 'Not our shop.';
      if (b.telephone) return 'Already has a line.';
      return fam.cash >= PHONE_COST ? null : 'Not enough cash.';
    }
    case 'grant': {
      const l = ltById(s, a.lt);
      if (!l?.demand) return 'Nothing to grant.';
      if (l.demand.kind === 'business') {
        const b = biz(s, l.demand.businessId);
        if (!b || b.owner !== 'player') return 'That shop is no longer ours.';
      }
      return null;
    }
    case 'reward':
      return fam.cash >= REWARD_COST ? null : 'Not enough cash.';
    case 'captain':
      return fam.captainPaid ? 'Captain is already on the payroll.' : fam.cash >= CAPTAIN_COST ? null : 'Not enough cash.';
    case 'hire':
      if (lts(s, 'player').length >= LT_CAP) return `Six lieutenants is the limit.`;
      if (!RECRUITS.some((r) => !s.lts.some((l) => l.name === r.name))) return 'Nobody left to hire.';
      return fam.cash >= HIRE_COST ? null : 'Not enough cash.';
  }
}

export function bossAction(s: GameState, a: BossAction): string {
  const why = canAct(s, a);
  if (why) return why;
  const fam = s.families.player;
  fam.actions--;
  switch (a.kind) {
    case 'phone': {
      const b = biz(s, a.biz)!;
      b.telephone = true;
      spend(s, 'player', PHONE_COST, `Telephone installed at ${b.name}`);
      return `A telephone line now runs into ${b.name}.`;
    }
    case 'grant': {
      const l = ltById(s, a.lt)!;
      const d = l.demand!;
      if (d.kind === 'raise') {
        l.cut += d.amount;
        l.loyalty = Math.min(100, l.loyalty + 15);
      } else {
        const b = biz(s, d.businessId)!;
        l.ownBusiness = b.id;
        b.managedBy = l.id;
        l.loyalty = Math.min(100, l.loyalty + 20);
      }
      l.ambition = Math.max(0, l.ambition - 10);
      l.demand = null;
      l.plotting = l.loyalty < 30 && l.plotting;
      return `${first(l)} got what they asked for. For now.`;
    }
    case 'reward': {
      const l = ltById(s, a.lt)!;
      spend(s, 'player', REWARD_COST, `Envelope for ${first(l)}`);
      l.loyalty = Math.min(100, l.loyalty + 10);
      return `${first(l)} pockets the envelope with a nod.`;
    }
    case 'captain':
      fam.captainPaid = true;
      spend(s, 'player', CAPTAIN_COST, 'Precinct captain (first envelope)');
      return 'Captain Hollis is now a friend of the family. Friends get paid monthly.';
    case 'hire': {
      const r = RECRUITS.find((r) => !s.lts.some((l) => l.name === r.name))!;
      const hq = hqOf(s, 'player')!;
      const l = makeLt(`hire${s.lts.length}`, 'player', r.name, r.nickname, r.s, r.traits, 60, 25, 3, hq.x, hq.y);
      l.order = { goal: 'hold', target: hq.id, posture: 'firm' };
      s.lts.push(l);
      spend(s, 'player', HIRE_COST, `Signing bonus for ${first(l)}`);
      return `${label(l)} joins the family with three hoods.`;
    }
  }
}

export function stopCaptain(s: GameState): void {
  const fam = s.families.player;
  if (!fam.captainPaid || s.run) return;
  fam.captainPaid = false;
  addHeat(s, 'player', 10, 'Captain Hollis took the snub personally');
}

// ---------------------------------------------------------------- month start

export function startMonth(s: GameState): void {
  if (s.run || s.over) return;
  for (const b of s.businesses) {
    b.raided = false;
    b.pushed = false;
  }
  for (const f of ['player', 'rival'] as const) {
    s.families[f].ledger = [];
    s.families[f].heatLog = [];
  }
  s.run = {
    day: 0,
    ops: {},
    queue: [],
    scheduled: [],
    changesLeft: 2,
    rivalChangesLeft: 2,
    nextCardId: 1,
    log: [],
    news: [],
  };
  for (const l of s.lts) {
    l.wins = 0;
    if (l.status !== 'active') continue;
    l.order = fixOrder(s, l, l.order);
    s.run.ops[l.id] = newOp(l, l.order);
  }
  schedule(s);
}

function schedule(s: GameState): void {
  const run = s.run!;
  const pf = s.families.player;
  if (pf.heat >= 15 && chance(s, 0.25 + pf.heat / 150)) run.scheduled.push({ day: int(s, 4, 24), kind: 'cop', family: 'player', ref: null });
  if (owned(s, 'player').some((b) => b.racket === 'still') && chance(s, 0.5))
    run.scheduled.push({ day: int(s, 4, 26), kind: 'tail', family: 'player', ref: null });

  for (const l of s.lts) {
    if (l.plotting && l.status === 'active') run.scheduled.push({ day: int(s, 6, 22), kind: 'defect', family: l.family, ref: l.id });
  }

  // Informants: some rival moves against us are tipped off a few days early.
  for (const r of activeLts(s, 'rival')) {
    const op = run.ops[r.id];
    if (!op) continue;
    const targetsUs =
      (op.goal === 'expand' && biz(s, op.target)?.owner === 'player') || (op.goal === 'hit' && (ltById(s, op.target) || biz(s, op.target)));
    if (!targetsUs) continue;
    const travel = Math.ceil(dist(r, opPos(s, r, op)) / 2);
    const eta = travel + op.daysNeeded;
    if (eta > 3 && chance(s, 0.45 + (r.traits.includes('looselips') ? 0.3 : 0))) {
      run.scheduled.push({ day: Math.max(1, eta - 3), kind: 'tip', family: 'player', ref: r.id });
    }
  }
}

// ---------------------------------------------------------------- the day loop

export type StepResult = 'card' | 'continue' | 'done';

export function stepDay(s: GameState): StepResult {
  const run = s.run;
  if (!run) return 'done';
  if (run.queue.length) return 'card';
  if (run.day >= DAYS_IN_MONTH) return 'done';
  run.day++;
  const d = run.day;

  // Orders arriving by runner.
  for (const op of Object.values(run.ops)) {
    if (op.pending && op.pending.arriveDay <= d) {
      const l = ltById(s, op.ltId)!;
      const o = op.pending.order;
      op.pending = null;
      if (l.status === 'active') applyOrder(s, l, o, 'runner');
    }
  }

  for (const ev of run.scheduled.filter((e) => e.day === d)) fire(s, ev);

  raids(s);

  for (const l of s.lts) {
    const op = run.ops[l.id];
    if (!op || op.done || l.status !== 'active') continue;
    personality(s, l, op);
    const pos = opPos(s, l, op);
    // Move up to two blocks a day.
    for (let i = 0; i < 2 && (l.x !== pos.x || l.y !== pos.y); i++) {
      if (l.x !== pos.x) l.x += Math.sign(pos.x - l.x);
      else l.y += Math.sign(pos.y - l.y);
    }
    if (l.x === pos.x && l.y === pos.y) {
      op.progress++;
      if (op.progress >= op.daysNeeded) complete(s, l, op);
    }
  }

  if (run.queue.length) return 'card';
  return d >= DAYS_IN_MONTH ? 'done' : 'continue';
}

function personality(s: GameState, l: Lieutenant, op: Op): void {
  if (op.checked) return;
  op.checked = true;
  const name = first(l);
  if (l.traits.includes('hothead') && op.posture !== 'loud' && ['expand', 'hold', 'hit'].includes(op.goal)) {
    if (chance(s, 0.6 - l.authority / 200)) {
      if (l.family === 'player') {
        card(s, {
          kind: 'hothead',
          title: `${name} wants to make an example`,
          text: `${label(l)} sends word: "Quiet don't work in this neighbourhood, boss. Let me do this my way." Everyone knows what his way is.`,
          options: [
            { id: 'leash', label: 'Let him off the leash', hint: 'Posture becomes Loud: faster, stronger, much more heat' },
            { id: 'rein', label: 'Rein him in', hint: `${name} loses face with his crew (Authority −8) and resents it` },
          ],
          ctx: { lt: l.id },
          focus: { x: l.x, y: l.y },
        });
      } else {
        op.posture = 'loud';
        op.daysNeeded = Math.max(2, op.daysNeeded - 2);
      }
    }
  }
  if (l.traits.includes('cautious') && op.posture === 'loud' && chance(s, 0.5)) {
    op.posture = 'firm';
    op.daysNeeded += 3;
    log(s, `${name} hung back. Too loud for their taste.`, l.family);
  }
}

function applyOrder(s: GameState, l: Lieutenant, o: Order, how: 'phone' | 'runner'): void {
  const run = s.run!;
  const name = first(l);
  // A hothead told to calm down may not.
  if (l.traits.includes('hothead') && (o.goal === 'lielow' || o.posture === 'quiet') && chance(s, 0.3)) {
    log(s, `${name} got the message${how === 'runner' ? ' from the runner' : ''} and ignored it.`, l.family);
    return;
  }
  o = fixOrder(s, l, o);
  l.order = o;
  run.ops[l.id] = newOp(l, o);
  log(s, `${name} has new orders (${how === 'phone' ? 'by telephone' : 'by runner'}): ${o.goal}.`, l.family);
}

function raids(s: GameState): void {
  for (const b of s.businesses) {
    if (!b.owner || !b.racket || b.raided) continue;
    const fam = s.families[b.owner];
    const p = (fam.heat / 5000) * (fam.captainPaid ? 0.5 : 1);
    if (!chance(s, p)) continue;
    b.raided = true;
    addHeat(s, b.owner, -5, `Raid on ${b.name} let off steam`);
    const there = activeLts(s, b.owner).find((l) => l.x === b.x && l.y === b.y);
    const mine = b.owner === 'player';
    log(s, `Police raid ${b.name}. The ${b.racket} is shut for the month.`, b.owner);
    story(
      s,
      `DRY AGENTS RAID ${b.front.toUpperCase()} ON ${addressOf(b).toUpperCase()}`,
      `Officers smashed ${b.racket === 'still' ? 'a copper still' : b.racket === 'gambling' ? 'a roulette wheel' : 'forty bottles of "cough syrup"'} at ${b.name}. The proprietor expressed shock that any of it was there.`,
      mine ? 6 : 3,
    );
    if (there && chance(s, 0.4)) {
      there.status = 'jailed';
      there.recover = 2;
      log(s, `${label(there)} was taken in.`, b.owner);
      if (mine) emergency(s, `${first(there)} has been arrested`, `${label(there)} was picked up in the raid on ${b.name}. Their crew is waiting for someone to tell them what to do.`, b);
      else rivalRespond(s, b);
    }
  }
}

// ---------------------------------------------------------------- scheduled events

function fire(s: GameState, ev: ScheduledEvent): void {
  switch (ev.kind) {
    case 'cop': {
      const b = pick(s, owned(s, 'player'));
      if (!b) return;
      const cash = s.families.player.cash;
      card(s, {
        kind: 'cop',
        title: 'A patrolman is asking questions',
        text: `Patrolman Kearney has been in ${b.name} three times this week and hasn't bought a thing. He's writing in a little notebook.`,
        options: [
          { id: 'bribe', label: 'Slip him $200', hint: 'Heat −6', disabled: cash < 200 },
          { id: 'lean', label: 'Lean on him', hint: 'He might back off. He might complain to the captain.' },
          { id: 'ignore', label: 'Ignore him', hint: 'He might be nobody. He might be the start of a raid.' },
        ],
        ctx: { biz: b.id },
        focus: b,
      });
      return;
    }
    case 'tail': {
      const still = owned(s, 'player').find((b) => b.racket === 'still');
      if (!still) return;
      card(s, {
        kind: 'tail',
        title: 'Your driver spots a tail',
        text: `A black sedan has been two cars behind the delivery truck from ${still.name} since ${addressOf(still)}.`,
        options: [
          { id: 'lose', label: 'Lose them', hint: 'Probably fine. Might crash the truck.' },
          { id: 'ambush', label: 'Lead them to the warehouse', hint: 'Whoever they are, they will regret it. Very loud.' },
          { id: 'dump', label: 'Dump the load', hint: 'Lose $300 of product, stay clean' },
        ],
        ctx: { biz: still.id },
        focus: still,
      });
      return;
    }
    case 'tip': {
      const r = ltById(s, ev.ref);
      const op = r && s.run!.ops[r.id];
      if (!r || !op || op.done || r.status !== 'active') return;
      const t = op.goal === 'hit' ? (ltById(s, op.target) ? label(ltById(s, op.target)!) : biz(s, op.target)?.name) : biz(s, op.target)?.name;
      const what = op.goal === 'hit' ? `a hit on ${t}` : `a move on ${t}`;
      emergency(
        s,
        'Word on the street',
        `A bartender on ${addressOf(r)} says ${label(r)} is planning ${what}, maybe in three days. [Likely]`,
        biz(s, op.target) ?? r,
      );
      return;
    }
    case 'defect': {
      const l = ltById(s, ev.ref);
      if (!l || l.status !== 'active' || !l.plotting) return;
      if (l.family === 'player') defect(s, l);
      else {
        // A plotting rival lieutenant offers to come over.
        if (lts(s, 'player').length >= LT_CAP) return;
        card(s, {
          kind: 'betrayal',
          title: `${first(l)} wants to talk`,
          text: `${label(l)} of the Calloway Outfit sends word: they're tired of Big Jim's scraps. They'll bring their crew and their shops over to you. Rats bite the hand that feeds them, of course.`,
          options: [
            { id: 'accept', label: 'Welcome them in', hint: 'Gain the lieutenant, crew and the shops they run' },
            { id: 'refuse', label: 'Send them back', hint: 'Nothing changes' },
          ],
          ctx: { lt: l.id },
          focus: l,
        });
      }
      return;
    }
  }
}

function defect(s: GameState, l: Lieutenant): void {
  const from = l.family;
  const to = other(from);
  const shops = s.businesses.filter((b) => b.managedBy === l.id && b.owner === from);
  for (const b of shops) b.owner = to;
  l.family = to;
  l.plotting = false;
  l.loyalty = 55;
  l.demand = null;
  l.ownBusiness = null;
  const op = s.run!.ops[l.id];
  if (op) op.done = true;
  const names = shops.map((b) => b.name).join(', ') || 'no shops';
  log(s, `${label(l)} has gone over to ${s.families[to].name}, taking ${names}.`, from);
  story(
    s,
    `${l.nickname.toUpperCase()} CHANGES TEAMS`,
    `Associates of ${l.name} say the ${l.nickname} "just wanted a fresh start" with ${s.families[to].name}. The fresh start includes ${names}.`,
    8,
  );
  if (from === 'player') {
    emergency(s, `${first(l)} has betrayed you`, `${label(l)} walked out to ${s.families.rival.name} with their crew and ${names}. The rest of the family is watching how you take it.`, l);
    for (const m of lts(s, 'player')) m.loyalty = Math.max(0, m.loyalty - 5);
  }
}

// ---------------------------------------------------------------- completing ops

function complete(s: GameState, l: Lieutenant, op: Op): void {
  const f = l.family;
  const name = first(l);
  const fam = s.families[f];
  switch (op.goal) {
    case 'expand': {
      op.done = true;
      const b = biz(s, op.target);
      if (!b) return;
      if (b.owner === f) {
        log(s, `${name} found ${b.name} already ours.`, f);
        return;
      }
      if (b.owner === null) {
        const p = Math.max(0.1, Math.min(0.95, 0.35 + l.charm * 0.05 + l.crew * 0.02 + (op.posture === 'quiet' ? -0.1 : op.posture === 'loud' ? 0.15 : 0)));
        if (chance(s, p)) {
          addHeat(s, f, POSTURE_HEAT[op.posture], `${b.name} "persuaded" (${op.posture})`);
          capture(s, b, l);
        } else if (f === 'player') {
          card(s, {
            kind: 'shopkeeper',
            title: 'The shopkeeper says no',
            text: `The owner of ${b.name} told ${name} he's "already got insurance, thank you." He says it with a shaking voice.`,
            options: [
              { id: 'lean', label: 'Lean on him', hint: 'He sees sense. Heat +8.' },
              { id: 'sweeten', label: 'Sweeten the deal ($300)', hint: 'He sees sense, quietly.', disabled: fam.cash < 300 },
              { id: 'walk', label: 'Walk away', hint: 'Try again next month' },
            ],
            ctx: { lt: l.id, biz: b.id },
            focus: b,
          });
        } else if (op.posture !== 'quiet') {
          addHeat(s, f, 8, `Shopkeeper beaten at ${b.name}`);
          capture(s, b, l);
        }
        return;
      }
      fightForBusiness(s, l, op, b);
      return;
    }
    case 'earn': {
      op.done = true;
      const b = biz(s, op.target);
      if (!b || b.owner !== f) {
        log(s, `${name} couldn't work ${b?.name ?? 'the shop'}: it isn't ours any more.`, f);
        return;
      }
      if (!b.racket) {
        if (fam.cash < RACKET_COST) {
          log(s, `${name} couldn't afford to fit out ${b.name}.`, f);
          return;
        }
        spend(s, f, RACKET_COST, `Fitting out a ${b.suits} at ${b.name}`);
        b.racket = b.suits;
        l.wins++;
        log(s, `${name} opened a ${b.racket} in the back of ${b.name}.`, f);
        if (f === 'player') story(s, `NEW ${b.front.toUpperCase()} DOES BRISK LATE TRADE`, `${b.name} on ${addressOf(b)} reports unusual demand for its services after 10 p.m.`, 3);
      } else {
        b.pushed = true;
        addHeat(s, f, op.posture === 'loud' ? 6 : 3, `Pushing product at ${b.name}`);
        l.wins++;
        log(s, `${name} squeezed extra out of the ${b.racket} at ${b.name}.`, f);
      }
      return;
    }
    case 'recruit': {
      op.done = true;
      const n = Math.min(2 + Math.floor(l.charm / 4), Math.floor(Math.max(0, fam.cash) / 100));
      if (n <= 0) {
        log(s, `${name} couldn't pay anyone to sign up.`, f);
        return;
      }
      spend(s, f, n * 100, `${name} signs up ${n} hoods`);
      l.crew += n;
      log(s, `${name} signed up ${n} new hoods.`, f);
      return;
    }
    case 'hit': {
      op.done = true;
      const t = ltById(s, op.target);
      if (t) {
        if (t.status !== 'active' || t.family === f) {
          log(s, `${name}'s target went to ground.`, f);
          return;
        }
        fightPeople(s, l, op, t);
        return;
      }
      const b = biz(s, op.target);
      if (b && b.owner && b.owner !== f) fightForBusiness(s, l, op, b, true);
      return;
    }
    default:
      return;
  }
}

function defenders(s: GameState, b: Business): Lieutenant[] {
  if (!b.owner) return [];
  const run = s.run!;
  return activeLts(s, b.owner).filter((d) => {
    const op = run.ops[d.id];
    return (d.x === b.x && d.y === b.y) || (op && !op.done && op.goal === 'hold' && op.target === b.id && dist(d, b) <= 1);
  });
}

function fightForBusiness(s: GameState, att: Lieutenant, op: Op, b: Business, wreck = false): void {
  const defs = defenders(s, b);
  const A = strength(att, op.posture);
  // Every shop has a couple of hoods on the door; a telephone brings help faster.
  const garrison = 5 + (b.telephone ? 3 : 0);
  const D = garrison + defs.reduce((n, d) => n + strength(d, 'firm') * 1.2, 0);
  const ctx = { att: att.id, defs: defs.map((d) => d.id).join(','), biz: b.id, a: A, d: D, wreck: wreck ? 1 : 0, posture: op.posture };
  const playerInvolved = att.family === 'player' || b.owner === 'player';
  if (playerInvolved && defs.length) {
    fightCard(s, ctx, b);
    return;
  }
  resolveFight(s, ctx, 0);
}

function fightPeople(s: GameState, att: Lieutenant, op: Op, target: Lieutenant): void {
  const near = activeLts(s, target.family).filter((d) => d.id !== target.id && dist(d, target) <= 1);
  const defs = [target, ...near];
  const A = strength(att, op.posture) * 1.15; // surprise
  const D = defs.reduce((n, d) => n + strength(d, 'firm'), 0);
  const ctx = { att: att.id, defs: defs.map((d) => d.id).join(','), biz: '', a: A, d: D, wreck: 0, posture: op.posture, target: target.id };
  if (att.family === 'player' || target.family === 'player') {
    fightCard(s, ctx, target);
    return;
  }
  resolveFight(s, ctx, 0);
}

function fightCard(s: GameState, ctx: Record<string, string | number>, where: { x: number; y: number }): void {
  const att = ltById(s, String(ctx.att))!;
  const attacking = att.family === 'player';
  const defs = String(ctx.defs).split(',').filter(Boolean).map((id) => ltById(s, id)!);
  const odds = Math.round((Number(ctx.a) / (Number(ctx.a) + Number(ctx.d))) * 100);
  const ourOdds = attacking ? odds : 100 - odds;
  const b = biz(s, String(ctx.biz));
  const place = b ? b.name : addressOf(where);
  const them = attacking ? defs.map(label).join(' and ') : label(att);
  let options: CardOption[];
  if (attacking) {
    options = [
      { id: 'push', label: 'Push in', hint: 'Better odds, more bodies on both sides' },
      { id: 'steady', label: 'Play it as it lies', hint: `About ${ourOdds}% in our favour` },
      { id: 'back', label: 'Pull back', hint: 'Live to fight another day' },
    ];
  } else {
    const helper = nearestHelper(s, where, defs);
    options = [
      { id: 'stand', label: 'Stand and fight', hint: `About ${ourOdds}% in our favour, a little better dug in` },
      {
        id: 'help',
        label: helper ? `Call ${first(helper)} by telephone` : 'Call for help',
        hint: helper ? `${first(helper)} is near a telephone and close enough to come running` : 'Nobody close enough with a telephone',
        disabled: !helper,
      },
      { id: 'give', label: b ? 'Give it up' : 'Scatter', hint: b ? 'Lose the shop, keep the men' : 'Run for it, lose some pride' },
    ];
    if (helper) ctx.helper = helper.id;
  }
  card(s, {
    kind: 'fight',
    title: attacking ? `${first(att)} is about to hit ${place}` : `${label(att)} is coming for ${place}`,
    text: attacking ? `${first(att)}'s crew is outside ${place}. ${them} are inside. Once it starts it can't be stopped.` : `Cars pull up outside ${place}. ${them}, with ${att.crew} hoods. Your people inside: ${defs.map(first).join(', ')}.`,
    options,
    ctx,
    focus: where,
  });
}

function nearestHelper(s: GameState, where: { x: number; y: number }, exclude: Lieutenant[]): Lieutenant | undefined {
  const run = s.run!;
  return activeLts(s, 'player')
    .filter((l) => !exclude.includes(l) && dist(l, where) <= 4 && run.ops[l.id]?.goal !== 'lielow')
    .filter((l) => s.businesses.some((b) => b.telephone && b.owner === 'player' && b.x === l.x && b.y === l.y))
    .sort((a, b) => dist(a, where) - dist(b, where))[0];
}

/** mod: bonus to the attacker's odds (negative helps defenders). */
function resolveFight(s: GameState, ctx: Record<string, string | number>, mod: number): void {
  const att = ltById(s, String(ctx.att))!;
  const defs = String(ctx.defs).split(',').filter(Boolean).map((id) => ltById(s, id)!).filter((d) => d.status === 'active');
  const b = biz(s, String(ctx.biz));
  const posture = String(ctx.posture) as Posture;
  const A = Number(ctx.a);
  const D = Number(ctx.d);
  const p = Math.max(0.05, Math.min(0.95, A / (A + D) + mod));
  const win = rand(s) < p;
  const af = att.family;
  const df = other(af);
  const place = b ? b.name : addressOf(att);

  const heatA = posture === 'loud' ? 18 : posture === 'firm' ? 10 : 5;
  addHeat(s, af, heatA, `Gunfire at ${place}`);
  if (defs.length) addHeat(s, df, 4, `Gunfire at ${place}`);

  const loser = win ? defs : [att];
  const winner = win ? [att] : defs;
  for (const l of loser) l.crew = Math.max(0, l.crew - int(s, 1, posture === 'loud' ? 3 : 2));
  for (const l of winner) l.crew = Math.max(0, l.crew - int(s, 0, 1));

  // Hays Code: we never see it. We hear about it.
  const casualties: Lieutenant[] = [];
  for (const l of loser) {
    const r = rand(s);
    const kill = posture === 'loud' ? 0.18 : posture === 'firm' ? 0.1 : 0.05;
    const hurt = kill + 0.25;
    if (ctx.target && l.id === ctx.target && win) {
      // A successful hit.
      if (r < (posture === 'loud' ? 0.6 : 0.45)) kill_(s, l);
      else wound(s, l);
      casualties.push(l);
    } else if (r < kill) {
      kill_(s, l);
      casualties.push(l);
    } else if (r < hurt) {
      wound(s, l);
      casualties.push(l);
    }
  }
  // Loud fights bring the police.
  if (posture === 'loud' && chance(s, s.families[af].heat / 220)) {
    const nab = pick(s, [att, ...defs].filter((l) => l.status === 'active'));
    if (nab) {
      nab.status = 'jailed';
      nab.recover = 2;
      casualties.push(nab);
    }
  }

  if (b && !ctx.target) {
    if (win) {
      if (Number(ctx.wreck)) {
        log(s, `${first(att)}'s crew wrecked the ${b.racket} at ${b.name}.`, af);
        b.racket = null;
        att.wins++;
      } else {
        capture(s, b, att);
      }
    } else {
      log(s, `${first(att)} was driven off from ${b.name}.`, af);
    }
  } else if (ctx.target) {
    const t = ltById(s, String(ctx.target))!;
    log(s, win ? `${first(att)}'s hit on ${first(t)} went through.` : `${first(t)} saw ${first(att)} coming.`, af);
    if (win) att.wins++;
  }

  const fates = casualties.map((l) => `${l.name} (${l.status === 'dead' ? 'found in the river' : l.status === 'jailed' ? 'arrested at the scene' : 'in hospital, "fell down some stairs"'})`).join('; ');
  story(
    s,
    pick(s, ['SHOTS RING OUT ON ', 'NIGHT OF TERROR ON ', 'GANGLAND FLARE-UP ON ']) + addressOf(b ?? att).toUpperCase(),
    `Residents of ${addressOf(b ?? att)} report "a sound like a dozen typewriters" near ${place} at around 2 a.m. ` +
      (fates ? `Police later confirmed: ${fates}. ` : 'No bodies were found, which police called "a pleasant change." ') +
      'Captain Hollis assured the public that crime does not pay.',
    7,
  );

  // Big events on our side open a Change of Plans; the rival reacts too.
  const ourLoss = casualties.filter((l) => l.family === 'player');
  const lostShop = b && win && df === 'player' && !Number(ctx.wreck);
  if (ourLoss.length || lostShop) {
    const what = [lostShop ? `we lost ${b!.name}` : '', ...ourLoss.map((l) => `${label(l)} is ${l.status === 'dead' ? 'dead' : l.status === 'jailed' ? 'in a cell' : 'in hospital'}`)].filter(Boolean).join('; ');
    emergency(s, 'Bad night', `${what[0].toUpperCase()}${what.slice(1)}.`, b ?? att);
  }
  const theirLoss = casualties.some((l) => l.family === 'rival') || (b && win && df === 'rival');
  if (ourLoss.some((l) => l.status === 'dead')) s.families.player.grudge = 'rival';
  if (theirLoss) {
    if (casualties.some((l) => l.family === 'rival' && l.status === 'dead')) s.families.rival.grudge = 'player';
    rivalRespond(s, b ?? undefined);
  }
}

function kill_(s: GameState, l: Lieutenant): void {
  l.status = 'dead';
  for (const b of s.businesses) if (b.managedBy === l.id) b.managedBy = null;
  const op = s.run?.ops[l.id];
  if (op) op.done = true;
  for (const m of lts(s, l.family)) m.loyalty = Math.max(0, m.loyalty - 3);
}

function wound(s: GameState, l: Lieutenant): void {
  l.status = 'wounded';
  l.recover = 1;
  const op = s.run?.ops[l.id];
  if (op) op.done = true;
}

function capture(s: GameState, b: Business, l: Lieutenant): void {
  const prev = b.owner;
  b.owner = l.family;
  b.managedBy = l.id;
  b.raided = false;
  for (const x of s.lts) if (x.ownBusiness === b.id) x.ownBusiness = null;
  l.wins++;
  log(s, `${first(l)} took ${b.name}${prev ? ` from ${s.families[prev].name}` : ''}.`, l.family);
  if (l.family === 'player') {
    story(
      s,
      `${b.name.toUpperCase()} UNDER NEW MANAGEMENT`,
      `Regulars at ${b.name} on ${addressOf(b)} report new faces behind the counter. The proprietor declined to comment, citing "a bad back."`,
      prev ? 6 : 4,
    );
  } else if (prev === 'player') {
    story(s, `CALLOWAY MEN SEEN AT ${b.name.toUpperCase()}`, `${b.name} has changed hands. A Calloway spokesman described the transfer as "amicable."`, 6);
  }
}

// ---------------------------------------------------------------- Change of Plans

function emergency(s: GameState, title: string, text: string, where: { x: number; y: number }): void {
  const run = s.run!;
  const left = run.changesLeft;
  card(s, {
    kind: 'emergency',
    title,
    text,
    options: [
      { id: 'replan', label: 'Change of Plans', hint: left > 0 ? `Re-issue orders now (${left} left; costs a meeting next month)` : 'No more changes this month', disabled: left <= 0 },
      { id: 'carry', label: 'Carry on', hint: 'The plan stands' },
    ],
    ctx: {},
    focus: where,
  });
}

export interface Reach {
  kind: 'phone' | 'runner' | 'unreachable' | 'unavailable';
  days: number;
  text: string;
}

export function reach(s: GameState, ltId: string): Reach {
  const l = ltById(s, ltId);
  if (!l || l.status !== 'active') return { kind: 'unavailable', days: 0, text: 'Not available' };
  const op = s.run?.ops[l.id];
  if (op && op.goal === 'lielow' && !op.done) return { kind: 'unreachable', days: 0, text: 'Lying low: nobody knows where' };
  const phone = s.businesses.find((b) => b.telephone && b.owner === l.family && b.x === l.x && b.y === l.y);
  if (phone) return { kind: 'phone', days: 0, text: `At ${phone.name}, which has a telephone: orders arrive now` };
  const hq = hqOf(s, l.family);
  const days = 2 + Math.floor((hq ? dist(l, hq) : 6) / 4);
  return { kind: 'runner', days, text: `Out on the street: a runner reaches them in ${days} days` };
}

export function changePlans(s: GameState, orders: Record<string, Order>): string[] {
  const run = s.run;
  if (!run || run.changesLeft <= 0) return ['No changes left this month.'];
  run.changesLeft--;
  s.families.player.actionDebt++;
  const out: string[] = [];
  for (const [id, o] of Object.entries(orders)) {
    const l = ltById(s, id);
    if (!l || l.family !== 'player') continue;
    const r = reach(s, id);
    if (r.kind === 'phone') applyOrder(s, l, o, 'phone');
    else if (r.kind === 'runner') {
      const op = run.ops[id];
      if (op) op.pending = { order: o, arriveDay: run.day + r.days };
      else run.ops[id] = { ...newOp(l, l.order), done: true, pending: { order: o, arriveDay: run.day + r.days } };
      out.push(`A runner is on the way to ${first(l)} (day ${run.day + r.days}).`);
    }
  }
  return out;
}

/**
 * An AI Change of Plans: send the quickest-reachable lieutenant to retake or
 * retaliate. The rival uses this automatically; the player gets the same
 * rules through the Change of Plans screen (and autoplay uses this helper).
 */
export function aiChangePlans(s: GameState, f: FamilyId, b?: Business): void {
  const run = s.run;
  if (!run) return;
  const left = f === 'rival' ? run.rivalChangesLeft : run.changesLeft;
  if (left <= 0) return;
  const foe = other(f);
  const cands = activeLts(s, f)
    .map((l) => ({ l, r: reach(s, l.id) }))
    .filter((c) => (c.r.kind === 'phone' || c.r.kind === 'runner') && c.l.crew >= 2)
    .sort((a, b) => a.r.days - b.r.days || b.l.crew - a.l.crew);
  const c = cands[0];
  if (!c) return;
  const target = b && b.owner === foe ? b : owned(s, foe).sort((x, y) => dist(x, c.l) - dist(y, c.l))[0];
  if (!target) return;
  if (f === 'rival') run.rivalChangesLeft--;
  else {
    run.changesLeft--;
    s.families.player.actionDebt++;
  }
  const o: Order = { goal: 'expand', target: target.id, posture: 'loud' };
  if (c.r.kind === 'phone') applyOrder(s, c.l, o, 'phone');
  else {
    const op = run.ops[c.l.id];
    if (op) op.pending = { order: o, arriveDay: run.day + c.r.days };
  }
}

function rivalRespond(s: GameState, b?: Business): void {
  aiChangePlans(s, 'rival', b);
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
  const l = ltById(s, String(c.ctx.lt ?? ''));
  const b = biz(s, String(c.ctx.biz ?? ''));

  switch (c.kind) {
    case 'hothead': {
      const op = l && run.ops[l.id];
      if (!l || !op) break;
      if (optionId === 'leash') {
        op.posture = 'loud';
        op.daysNeeded = Math.max(2, op.daysNeeded - 2);
        log(s, `${first(l)} is off the leash.`, 'player');
      } else {
        l.authority = Math.max(0, l.authority - 8);
        l.loyalty = Math.max(0, l.loyalty - 6);
        log(s, `${first(l)} grumbles and does it quietly.`, 'player');
      }
      break;
    }
    case 'shopkeeper': {
      if (!l || !b) break;
      if (optionId === 'lean') {
        addHeat(s, 'player', 8, `Shopkeeper roughed up at ${b.name}`);
        capture(s, b, l);
      } else if (optionId === 'sweeten') {
        spend(s, 'player', 300, `Sweetener for ${b.name}`);
        capture(s, b, l);
      } else log(s, `${first(l)} walked away from ${b.name}.`, 'player');
      break;
    }
    case 'cop': {
      if (optionId === 'bribe') {
        spend(s, 'player', 200, 'Patrolman Kearney');
        addHeat(s, 'player', -6, 'Patrolman Kearney paid off');
      } else if (optionId === 'lean') {
        if (chance(s, 0.5)) {
          addHeat(s, 'player', -3, 'Patrolman Kearney scared off');
          log(s, 'Kearney has found another beat.', 'player');
        } else {
          addHeat(s, 'player', 12, 'Patrolman Kearney complained to the captain');
          log(s, 'Kearney went straight to the captain.', 'player');
        }
      } else if (b && b.racket && chance(s, 0.4)) {
        b.raided = true;
        addHeat(s, 'player', 4, `Kearney's raid on ${b.name}`);
        log(s, `Kearney came back with friends. ${b.name} is shut.`, 'player');
        story(s, `PATROLMAN'S HUNCH PAYS OFF`, `Patrolman Kearney, acting "on a feeling," led a raid on ${b.name}.`, 5);
      }
      break;
    }
    case 'tail': {
      if (optionId === 'lose') {
        if (chance(s, 0.35)) {
          spend(s, 'player', 400, 'Delivery truck wrapped round a lamppost');
          story(s, 'TRUCK SPILLS "MAPLE SYRUP" ON DOCK ROAD', 'Witnesses say the syrup smelled strongly of rye.', 4);
        } else log(s, 'The driver lost the tail in the rail yards.', 'player');
      } else if (optionId === 'ambush') {
        addHeat(s, 'player', 15, 'Ambush at the warehouse');
        const r = activeLts(s, 'rival').sort((a, b2) => b2.crew - a.crew)[0];
        if (r) {
          r.crew = Math.max(0, r.crew - 1);
          log(s, `The tail was one of ${first(r)}'s men. Was.`, 'player');
        }
        story(s, 'CAR FOUND ABANDONED NEAR WAREHOUSE', 'Police are looking for its owner. They expect to be looking for some time.', 5);
      } else spend(s, 'player', 300, 'Load dumped in the canal');
      break;
    }
    case 'fight': {
      const attacking = ltById(s, String(c.ctx.att))?.family === 'player';
      if (attacking) {
        if (optionId === 'back') {
          log(s, 'Our crew pulled back.', 'player');
          break;
        }
        resolveFight(s, c.ctx, optionId === 'push' ? 0.12 : 0);
        if (optionId === 'push') {
          const a = ltById(s, String(c.ctx.att));
          if (a) a.crew = Math.max(0, a.crew - 1);
        }
      } else {
        if (optionId === 'give') {
          const att = ltById(s, String(c.ctx.att))!;
          if (b) capture(s, b, att);
          else log(s, 'Our people scattered.', 'player');
          for (const d of String(c.ctx.defs).split(',')) {
            const x = ltById(s, d);
            if (x) x.authority = Math.max(0, x.authority - 5);
          }
          break;
        }
        let mod = -0.08;
        if (optionId === 'help') {
          const h = ltById(s, String(c.ctx.helper));
          if (h) {
            c.ctx.d = Number(c.ctx.d) + strength(h, 'firm');
            c.ctx.defs = `${c.ctx.defs},${h.id}`;
            h.x = b?.x ?? h.x;
            h.y = b?.y ?? h.y;
            mod = -0.05;
          }
        }
        resolveFight(s, c.ctx, mod);
      }
      break;
    }
    case 'betrayal': {
      if (!l) break;
      if (optionId === 'accept') {
        defect(s, l);
        story(s, 'CALLOWAY OUTFIT "UNAFFECTED" BY DEPARTURE', `Big Jim Calloway says ${l.name} "was never really one of us." He then broke a chair.`, 6);
      } else {
        l.plotting = false;
        log(s, `We sent ${first(l)} back. Calloway will hear about it eventually.`, 'player');
      }
      break;
    }
    case 'emergency':
      // 'replan' is handled by the UI opening the Change of Plans screen.
      break;
  }
  return c;
}

// ---------------------------------------------------------------- month end

export function endMonth(s: GameState): void {
  const run = s.run;
  if (!run || run.queue.length || run.day < DAYS_IN_MONTH) return;
  for (const f of ['player', 'rival'] as const) settle(s, f);
  people(s);
  planFamily(s, 'rival');
  wire(s);

  const news = [...run.news].sort((a, b) => b.weight - a.weight);
  s.news = news.slice(0, 6);
  if (!s.news.length) {
    s.news = [{ headline: 'QUIET MONTH IN THE WARD', body: 'Police report "nothing of note." Several shopkeepers report the same, a little too quickly.', weight: 1 }];
  }
  s.run = null;
  checkOver(s);
  s.month++;
  for (const f of ['player', 'rival'] as const) {
    const fam = s.families[f];
    fam.actions = Math.max(0, 2 - fam.actionDebt);
    fam.actionDebt = 0;
  }
}

function settle(s: GameState, f: FamilyId): void {
  const fam = s.families[f];
  const mine = owned(s, f);
  const prot = mine.reduce((n, b) => n + b.protection, 0);
  if (prot) earn(s, f, prot, `Protection from ${mine.length} shop${mine.length === 1 ? '' : 's'}`);
  const speaks = mine.filter((b) => b.racket === 'speakeasy' && !b.raided).length;
  let stills = 0;
  for (const b of mine) {
    if (!b.racket) continue;
    if (b.raided) {
      fam.ledger.push({ label: `${b.name}: shut by a raid`, amount: 0 });
      continue;
    }
    let inc = RACKET_INCOME[b.racket];
    if (b.racket === 'still') {
      stills++;
      if (stills <= Math.ceil(speaks / 2)) inc += 100 * Math.min(2, speaks);
    }
    if (b.pushed) inc = Math.round(inc * 1.5);
    const manager = ltById(s, b.managedBy);
    if (manager && manager.ownBusiness === b.id && manager.family === f) {
      earn(s, f, Math.round(inc / 2), `${b.racket[0].toUpperCase()}${b.racket.slice(1)} at ${b.name} (half; ${first(manager)}'s cut)`);
    } else earn(s, f, inc, `${b.racket[0].toUpperCase()}${b.racket.slice(1)} at ${b.name}${b.pushed ? ' (pushed)' : ''}`);
    // Greedy managers skim. The ledger can't say why.
    if (manager && manager.traits.includes('greedy') && manager.family === f && chance(s, 0.6)) {
      const skim = Math.round(inc * 0.2);
      spend(s, f, skim, `Collections at ${b.name} came up short`);
    }
  }
  const all = lts(s, f);
  const crew = all.reduce((n, l) => n + l.crew, 0);
  if (crew) spend(s, f, crew * WAGE, `Wages for ${crew} hoods`);
  for (const l of all.filter((l) => l.status !== 'jailed')) spend(s, f, l.cut, `${first(l)}'s cut`);
  for (const l of all.filter((l) => l.status === 'jailed')) spend(s, f, 100, `Lawyer for ${first(l)}`);
  if (fam.captainPaid) spend(s, f, CAPTAIN_COST, 'Precinct captain');
  const phones = mine.filter((b) => b.telephone).length;
  if (phones) spend(s, f, phones * PHONE_UPKEEP, `Telephone bills (${phones})`);

  addHeat(s, f, -6, 'The newspapers moved on');
  // Anti-snowball: the bigger you get, the more people ask who runs the ward.
  const share = mine.length / s.businesses.length;
  if (share > 0.4) addHeat(s, f, Math.round((share - 0.4) * 40), `Papers asking who runs the ward (${mine.length} shops)`);
  if (fam.captainPaid) addHeat(s, f, -5, 'Captain looking the other way');
  const low = all.filter((l) => s.run!.ops[l.id]?.goal === 'lielow').length;
  if (low) addHeat(s, f, -6 * low, 'Lying low');
}

function people(s: GameState): void {
  for (const l of s.lts) {
    if (l.status === 'dead' || l.status === 'defected') continue;
    if (l.status === 'wounded' || l.status === 'jailed') {
      l.recover--;
      if (l.recover <= 0) {
        if (l.status === 'jailed') story(s, `${l.name.toUpperCase()} RELEASED`, `Charges were dropped after the key witness "remembered nothing."`, 3);
        l.status = 'active';
      }
      continue;
    }
    const fam = s.families[l.family];
    const runs = s.businesses.filter((b) => b.managedBy === l.id && b.owner === l.family).length;
    l.ambition = Math.min(100, l.ambition + runs * 2 + l.wins * 4 + (l.traits.includes('ambitious') ? 4 : 0));
    const soft = l.traits.includes('loyal') ? 0.5 : 1;
    if (l.demand) {
      l.demand.age++;
      l.loyalty = Math.max(0, l.loyalty - Math.round(8 * soft));
      if (l.family === 'rival' && chance(s, 0.5)) {
        // The AI boss sometimes pays up.
        l.cut += l.demand.kind === 'raise' ? l.demand.amount : 0;
        l.loyalty += 15;
        l.demand = null;
      }
    }
    if (fam.cash < 0) l.loyalty = Math.max(0, l.loyalty - Math.round(5 * soft));
    if (l.wins) l.loyalty = Math.min(100, l.loyalty + 2);
    if (!l.demand && l.ambition >= 45 && chance(s, 0.5)) {
      const want = s.businesses.filter((b) => b.owner === l.family && b.racket && b.managedBy === l.id && !l.ownBusiness)[0];
      l.demand = want
        ? {
            kind: 'business',
            amount: 0,
            businessId: want.id,
            text: `wants ${want.name} as their own: they'd keep half of what it makes`,
            age: 0,
          }
        : { kind: 'raise', amount: 100, businessId: null, text: 'wants a bigger cut: +$100 a month', age: 0 };
    }
    const wasPlotting = l.plotting;
    l.plotting = (l.loyalty < 30 && l.ambition > 50) || (l.demand !== null && l.demand.age >= 3 && l.loyalty < 40) || l.loyalty < 15;
    if (!wasPlotting && l.plotting && l.family === 'player') l.loyalty = Math.max(0, l.loyalty - 5);
  }
}

function wire(s: GameState): void {
  const w: GameState['wire'] = [];
  // Rival plans for next month, as your informants hear them.
  for (const r of activeLts(s, 'rival')) {
    if (!chance(s, 0.45 + (r.traits.includes('looselips') ? 0.3 : 0))) continue;
    const o = r.order;
    const t = o.goal === 'hit' ? ltById(s, o.target)?.name ?? biz(s, o.target)?.name : biz(s, o.target)?.name;
    if (o.goal === 'expand' || o.goal === 'hit') {
      const b = biz(s, o.target);
      if (chance(s, 0.5) && b) w.push({ confidence: 'Rumour', text: `Calloway's people are looking at shops on ${addressOf(b)}.` });
      else w.push({ confidence: 'Likely', text: `${label(r)} is planning ${o.goal === 'hit' ? 'a hit on' : 'a move on'} ${t}.` });
    } else if (o.goal === 'lielow') w.push({ confidence: 'Likely', text: `${label(r)} has dropped out of sight.` });
  }
  // Warning signs inside the family.
  for (const l of lts(s, 'player')) {
    if (l.status !== 'active') continue;
    if (l.plotting && chance(s, 0.75)) w.push({ confidence: 'Likely', text: `${first(l)} was seen having coffee with Calloway's people. Twice.` });
    else if (l.loyalty < 45 && chance(s, 0.5)) w.push({ confidence: 'Rumour', text: `${first(l)} has been complaining about the boss to the crew.` });
    if (l.traits.includes('greedy') && chance(s, 0.35)) w.push({ confidence: 'Rumour', text: `${first(l)} turned up in a new Packard. On what we pay?` });
  }
  const rivalPlotter = activeLts(s, 'rival').find((l) => l.plotting);
  if (rivalPlotter && chance(s, 0.6)) w.push({ confidence: 'Rumour', text: `${first(rivalPlotter)} isn't happy over at Calloway's.` });
  s.wire = w;
}

function checkOver(s: GameState): void {
  const p = s.families.player;
  const rivalShops = owned(s, 'rival').length;
  const ourShops = owned(s, 'player').length;
  const ourMen = lts(s, 'player').length;
  const when = monthName(s.month);
  if (rivalShops === 0 && activeLts(s, 'rival').length === 0) {
    s.over = { result: 'win', headline: 'CALLOWAY OUTFIT FINISHED', text: `By the end of ${when} the Calloway Outfit had no shops and no men. Big Jim was last seen boarding a train to Florida. The ward belongs to ${p.boss}.` };
  } else if (ourMen === 0 || ourShops === 0 || p.cash < -1500) {
    s.over = {
      result: 'loss',
      headline: 'RUSSO FAMILY "NO LONGER A CONCERN," SAYS CALLOWAY',
      text: ourShops === 0 ? `By ${when} the Russo family didn't own so much as a newsstand.` : ourMen === 0 ? `By ${when} there was nobody left to give orders to.` : `By ${when} the debts were bigger than the family. ${p.boss} was last seen leaving town owing money to everyone.`,
    };
  } else if (s.month >= s.lastMonth) {
    const r = s.families.rival;
    const us = ourShops * 1000 + p.cash;
    const them = rivalShops * 1000 + r.cash;
    s.over =
      us > them * 1.15
        ? { result: 'win', headline: 'RUSSO NAME RISES IN THE WARD', text: `Six months after Aldo went away, ${p.boss} runs ${ourShops} shops to Calloway's ${rivalShops}. The Outfit is still standing, but everyone knows whose ward it is.` }
        : them > us * 1.15
          ? { result: 'loss', headline: "CALLOWAY'S WARD NOW", text: `Six months on, Calloway runs ${rivalShops} shops to the Russos' ${ourShops}. Aldo will hear about this in Joliet.` }
          : { result: 'draw', headline: 'UNEASY PEACE IN THE WARD', text: `Six months on, neither family can claim the ward: ${ourShops} shops to ${rivalShops}. Something will have to give.` };
  }
}

/** A new game, with the rival's first month already planned and rumoured. */
export function createGame(seed: number, boss?: string): GameState {
  const s = newGame(seed, boss);
  planFamily(s, 'rival');
  wire(s);
  return s;
}
