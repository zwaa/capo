import type { Branch, Building, FamilyId, GameState, Hood, Job, JobKind, Person, SpecialistKind } from './types';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const DAYS = 30;
export const LT_CAP = 6;
export const MAX_BRANCHES = 3;

export function monthName(m: number): string {
  return `${MONTHS[m % 12]} ${1927 + Math.floor(m / 12)}`;
}

/** Street names by map row (setup.ts uses the same list for addresses). */
export const STREET_NAMES = [
  'Kessler Street',
  'Canal Street',
  'Orchard Avenue',
  'Foundry Row',
  'Larkin Street',
  'Mercer Avenue',
  'Tallow Lane',
  'Dock Road',
];

export const other = (f: FamilyId): FamilyId => (f === 'player' ? 'rival' : 'player');
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const building = (s: GameState, id: string | null) => (id ? s.buildings.find((b) => b.id === id) : undefined);
export const person = (s: GameState, id: string | null) => (id ? s.people.find((p) => p.id === id) : undefined);
export const bossOf = (s: GameState, f: FamilyId) => person(s, s.families[f].bossId)!;

/** Everyone still in the family (including wounded and jailed). */
export const members = (s: GameState, f: FamilyId) =>
  s.people.filter((p) => p.family === f && p.status !== 'dead' && p.status !== 'defected');
export const active = (s: GameState, f: FamilyId) => s.people.filter((p) => p.family === f && p.status === 'active');
export const lieutenants = (s: GameState, f: FamilyId) => members(s, f).filter((p) => p.role === 'lt');

export const owned = (s: GameState, f: FamilyId) => s.buildings.filter((b) => b.owner === f);
export const protectedBy = (s: GameState, f: FamilyId) => s.buildings.filter((b) => b.protectedBy === f && b.owner === null);
export const rackets = (s: GameState, f: FamilyId, r?: string) => owned(s, f).filter((b) => b.racket && (!r || b.racket === r));
export const isHome = (b: Building) => b.kind === 'home';
/** Protected shops (not homes). */
export const protectedShops = (s: GameState, f: FamilyId) => protectedBy(s, f).filter((b) => !isHome(b));
export const protectedHomes = (s: GameState, f: FamilyId) => protectedBy(s, f).filter(isHome);
/** A collector gets round five shops a month, or ten homes (they pay less and sit close together). */
export const HOME_STOP = 0.5;
export const stopsOf = (bs: Building[]) => bs.reduce((n, b) => n + (isHome(b) ? HOME_STOP : 1), 0);

// ---------------------------------------------------------------- blocks

// The ward is a grid of city blocks between the roads (roads run every 4 tiles
// across and every 3 down). A block is a target in its own right: "sign up the
// Canal Street block" sends a crew door to door.

export const BLOCK_W = 4;
export const BLOCK_H = 3;
const BLOCK_SIDE = ['west', 'middle', 'east'];
export const blockId = (at: { x: number; y: number }) => `blk${Math.floor(at.x / BLOCK_W)}-${Math.floor(at.y / BLOCK_H)}`;
export const isBlockId = (id: string | null): id is string => !!id && /^blk\d+-\d+$/.test(id);
export function blockXY(id: string): { bx: number; by: number } {
  const [bx, by] = id.slice(3).split('-').map(Number);
  return { bx, by };
}
/** Every building (shops and homes) on a block. */
export const blockBuildings = (s: GameState, id: string) => s.buildings.filter((b) => blockId(b) === id);
export function blockName(s: GameState, id: string): string {
  const { bx, by } = blockXY(id);
  const cols = Math.ceil(s.width / BLOCK_W);
  const side = cols === 3 ? BLOCK_SIDE[bx] : `no. ${bx + 1}`;
  return `the ${STREET_NAMES[(by * BLOCK_H + 1) % STREET_NAMES.length]} block (${side})`;
}
/** The middle of a block's lots, for drawing and travel. */
export function blockCentre(s: GameState, id: string): { x: number; y: number } {
  const bs = blockBuildings(s, id);
  if (!bs.length) return { x: 0, y: 0 };
  const xs = bs.map((b) => b.x);
  const ys = bs.map((b) => b.y);
  return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) };
}
/** Buildings on a block that pay nobody. */
export const blockFree = (s: GameState, id: string) => blockBuildings(s, id).filter((b) => !b.owner && !b.protectedBy);
/** ...and that haven't turned us away this month: what a block sign-up works through. */
export const blockOpen = (s: GameState, id: string) => blockFree(s, id).filter((b) => !b.refused);
export function allBlocks(s: GameState): string[] {
  return [...new Set(s.buildings.map((b) => blockId(b)))].sort();
}

export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const first = (p: Person) => p.name.split(' ')[0];
export const label = (p: Person) => `${first(p)} "${p.nickname}" ${p.name.split(' ').slice(1).join(' ')}`;

// ---------------------------------------------------------------- branches

export const BRANCHES: { id: Branch; area: string; label: string; stat: 'muscle' | 'brains' | 'charm'; blurb: string }[] = [
  { id: 'protection', area: 'Muscle', label: 'Protection', stat: 'muscle', blurb: 'Sign up shops and collect from them' },
  { id: 'enforcement', area: 'Muscle', label: 'Enforcement', stat: 'muscle', blurb: 'Guard what we have, hit back, hit first' },
  { id: 'acquisitions', area: 'Property', label: 'Acquisitions', stat: 'brains', blurb: 'Buy buildings, or take them' },
  { id: 'fronts', area: 'Property', label: 'Fronts', stat: 'brains', blurb: 'Fit out back rooms, put in telephones' },
  { id: 'speakeasies', area: 'Vice', label: 'Speakeasies', stat: 'charm', blurb: 'Run the bars' },
  { id: 'gambling', area: 'Vice', label: 'Gambling', stat: 'brains', blurb: 'Run the dens and the numbers' },
  { id: 'bootlegging', area: 'Vice', label: 'Bootlegging', stat: 'brains', blurb: 'Run the stills and the supply run to the bars' },
  { id: 'police', area: 'Fixing', label: 'The Police', stat: 'charm', blurb: 'Keep the precinct captain sweet' },
];
export const branchInfo = (b: Branch) => BRANCHES.find((x) => x.id === b)!;

// ---------------------------------------------------------------- jobs

export type TargetRule = 'none' | 'signup' | 'block' | 'guard' | 'hit' | 'wreck' | 'buy' | 'takeover' | 'fitout' | 'phone';

export interface JobInfo {
  branch: Branch;
  label: string;
  verb: string;
  target: TargetRule;
  ongoing: boolean;
  car: boolean;
  work: number;
  risky: boolean;
  /** The stat that matters most: the squad picker sends whoever is best at it. */
  stat: 'muscle' | 'brains' | 'nerve' | 'charm';
  hint: string;
}

export const JOBS: Record<JobKind, JobInfo> = {
  collect: {
    branch: 'protection',
    label: 'Collect protection',
    verb: 'Collecting',
    target: 'none',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'muscle',
    hint: 'One pair of hands per five shops. Shops nobody collects from stop paying.',
  },
  signup: {
    branch: 'protection',
    label: 'Sign up a shop',
    verb: 'Signing up',
    target: 'signup',
    ongoing: false,
    car: false,
    work: 4,
    risky: false,
    stat: 'charm',
    hint: 'One pair of hands (three if Calloway already protects it, and expect a fight).',
  },
  block: {
    branch: 'protection',
    label: 'Sign up a block',
    verb: 'Signing up',
    target: 'block',
    ongoing: false,
    car: false,
    work: 2,
    risky: false,
    stat: 'charm',
    hint: 'Two pairs of hands go door to door: every home and shop on the block that pays nobody. Homes sign up fast and pay a little.',
  },
  guard: {
    branch: 'enforcement',
    label: 'Guard a place',
    verb: 'Guarding',
    target: 'guard',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'muscle',
    hint: 'Two hoods. Makes it much harder to take.',
  },
  hit: {
    branch: 'enforcement',
    label: 'Hit a man',
    verb: 'Hitting',
    target: 'hit',
    ongoing: false,
    car: true,
    work: 2,
    risky: true,
    stat: 'nerve',
    hint: 'Three hoods and a car. Very loud.',
  },
  wreck: {
    branch: 'enforcement',
    label: 'Wreck a racket',
    verb: 'Wrecking',
    target: 'wreck',
    ongoing: false,
    car: false,
    work: 2,
    risky: true,
    stat: 'muscle',
    hint: 'Three hoods. Smash a Calloway back room.',
  },
  buy: {
    branch: 'acquisitions',
    label: 'Buy a building',
    verb: 'Buying',
    target: 'buy',
    ongoing: false,
    car: false,
    work: 3,
    risky: false,
    stat: 'brains',
    hint: 'One hood and the price. Cheaper if we already protect it.',
  },
  takeover: {
    branch: 'acquisitions',
    label: 'Take over a building',
    verb: 'Taking over',
    target: 'takeover',
    ongoing: false,
    car: true,
    work: 3,
    risky: true,
    stat: 'muscle',
    hint: 'Four hoods and a car. Take a Calloway building by force.',
  },
  fitout: {
    branch: 'fronts',
    label: 'Fit out a back room',
    verb: 'Fitting out',
    target: 'fitout',
    ongoing: false,
    car: false,
    work: 4,
    risky: false,
    stat: 'brains',
    hint: 'One pair of hands and $300. The front decides what kind.',
  },
  phone: {
    branch: 'fronts',
    label: 'Put in a telephone',
    verb: 'Wiring',
    target: 'phone',
    ongoing: false,
    car: false,
    work: 2,
    risky: false,
    stat: 'brains',
    hint: 'One hood and $150. Whoever works from here gets orders at once.',
  },
  runSpeak: {
    branch: 'speakeasies',
    label: 'Run the speakeasies',
    verb: 'Running bars',
    target: 'none',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'charm',
    hint: 'One hood per bar. Each bar pours 15 cases a month.',
  },
  runGamble: {
    branch: 'gambling',
    label: 'Run the gambling',
    verb: 'Running dens',
    target: 'none',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'brains',
    hint: 'One hood per den.',
  },
  distill: {
    branch: 'bootlegging',
    label: 'Run the stills',
    verb: 'Distilling',
    target: 'none',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'brains',
    hint: 'One hood per still. Each makes 25 cases a month.',
  },
  supply: {
    branch: 'bootlegging',
    label: 'Supply run',
    verb: 'Supplying',
    target: 'none',
    ongoing: true,
    car: true,
    work: 0,
    risky: false,
    stat: 'nerve',
    hint: 'One hood and a truck. Without it, bars buy liquor on the open market.',
  },
  payoff: {
    branch: 'police',
    label: 'Pay the captain',
    verb: 'Paying off',
    target: 'none',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'charm',
    hint: 'About $250 a month (less with Charm). Halves raids and cools heat.',
  },
};

export const jobsForBranch = (b: Branch) => (Object.keys(JOBS) as JobKind[]).filter((k) => JOBS[k].branch === b);

/** Valid targets for a job kind, from family f's point of view. */
export function targets(s: GameState, f: FamilyId, kind: JobKind): { id: string; label: string }[] {
  const foe = other(f);
  const bl = (b: Building, extra = '') => ({ id: b.id, label: `${b.name}${extra}` });
  switch (JOBS[kind].target) {
    case 'signup':
      return s.buildings
        .filter((b) => b.owner === null && b.protectedBy !== f)
        .map((b) => bl(b, b.protectedBy ? ` (${b.protectedBy === 'rival' ? 'Calloway' : 'Russo'} pays)` : ''));
    case 'block':
      return allBlocks(s)
        .map((id) => ({ id, free: blockFree(s, id) }))
        .filter((x) => x.free.length)
        .map((x) => ({ id: x.id, label: `${cap(blockName(s, x.id))} (${x.free.length} pay nobody)` }));
    case 'guard':
      return s.buildings.filter((b) => !isHome(b) && (b.owner === f || (b.protectedBy === f && b.owner === null))).map((b) => bl(b));
    case 'hit':
      return active(s, foe)
        .filter((p) => f !== 'player' || visible(s, p))
        .map((p) => ({ id: p.id, label: label(p) }));
    case 'wreck':
      return s.buildings.filter((b) => b.owner === foe && b.racket).map((b) => bl(b, ` (the ${b.racket})`));
    case 'buy':
      return s.buildings.filter((b) => !isHome(b) && b.owner === null && b.protectedBy !== foe).map((b) => bl(b, ` ($${price(b, f)})`));
    case 'takeover':
      return s.buildings.filter((b) => b.owner === foe).map((b) => bl(b));
    case 'fitout':
      return s.buildings.filter((b) => b.owner === f && !b.racket).map((b) => bl(b, ` (${b.suits})`));
    case 'phone':
      return s.buildings.filter((b) => b.owner === f && !b.telephone).map((b) => bl(b));
    default:
      return [];
  }
}

export function price(b: Building, f: FamilyId): number {
  const base = 400 + b.protection * 2;
  return b.protectedBy === f ? Math.round(base * 0.75) : base;
}

/** Fog of war: can the player see this person? */
export function visible(s: GameState, p: Person): boolean {
  if (p.family === 'player') return true;
  if (p.status !== 'active') return false;
  return seenTile(s, p.x, p.y);
}

export function seenTile(s: GameState, x: number, y: number): boolean {
  const t = { x, y };
  if (s.buildings.some((b) => (b.owner === 'player' || b.protectedBy === 'player') && dist(b, t) <= 2)) return true;
  return active(s, 'player').some((p) => dist(p, t) <= 2);
}

// ---------------------------------------------------------------- turf

/** The family that holds a building, whether it owns it or just protects it. */
export const holder = (b: Building): FamilyId | null => b.owner ?? b.protectedBy;

/** How close (in lots) a building must be to count as next to someone's turf. */
export const TURF_REACH = 2;

/**
 * Is this spot next to a family's turf: within reach of a building it owns or
 * protects, or of the boss's own front door? Expanding off your turf is harder.
 */
export function onTurf(s: GameState, f: FamilyId, at: { x: number; y: number }, exceptId?: string): boolean {
  if (s.buildings.some((b) => b.id !== exceptId && holder(b) === f && dist(b, at) <= TURF_REACH)) return true;
  const boss = bossOf(s, f);
  return dist({ x: boss.homeX, y: boss.homeY }, at) <= TURF_REACH;
}

/** Whose turf a map tile is on, for drawing: the family with the most buildings next to it (ties: nobody). */
export function turfAt(s: GameState, x: number, y: number): FamilyId | null {
  const here = s.buildings.find((b) => b.x === x && b.y === y);
  if (here && holder(here)) return holder(here);
  let us = 0;
  let them = 0;
  for (const b of s.buildings) {
    if (dist(b, { x, y }) > 1) continue;
    if (holder(b) === 'player') us++;
    else if (holder(b) === 'rival') them++;
  }
  // The boss's own front door counts too, as it does for onTurf().
  const boss = bossOf(s, 'player');
  if (dist({ x: boss.homeX, y: boss.homeY }, { x, y }) <= 1) us++;
  return us > them ? 'player' : them > us ? 'rival' : null;
}

/** Who runs a branch, and which branches a person runs. */
export const runner = (s: GameState, f: FamilyId, b: Branch) => person(s, s.families[f].branches[b])!;
export const branchesOf = (s: GameState, p: Person) =>
  BRANCHES.filter((b) => s.families[p.family].branches[b.id] === p.id).map((b) => b.id);

// ---------------------------------------------------------------- prices

export const SPECIALISTS: Record<SpecialistKind, { name: string; title: string; retainer: number; hint: string }> = {
  recruiter: {
    name: 'Benny Albrecht',
    title: 'Recruiter',
    retainer: 120,
    hint: 'More, and better, hoods looking for work, at $60 instead of $100',
  },
  armourer: { name: 'Ziggy Novak', title: 'Armourer', retainer: 150, hint: 'Guns cost $25 instead of $40; crews hit harder' },
  mechanic: { name: 'Lena Sorensen', title: 'Mechanic', retainer: 120, hint: 'Cars cost $180 instead of $300; faster, and half the tails' },
  lawyer: { name: 'J. Whitcombe Pruitt', title: 'Lawyer', retainer: 200, hint: 'Arrests stick half as often; time inside is shorter' },
};

export const has = (s: GameState, f: FamilyId, k: SpecialistKind) => s.families[f].specialists.includes(k);
export const hoodPrice = (s: GameState, f: FamilyId) => (has(s, f, 'recruiter') ? 60 : 100);
export const gunPrice = (s: GameState, f: FamilyId) => (has(s, f, 'armourer') ? 25 : 40);
export const carPrice = (s: GameState, f: FamilyId) => (has(s, f, 'mechanic') ? 180 : 300);

export const WAGE = 30;
export const LIQUOR_PER_BAR = 15;
export const STILL_OUTPUT = 25;
export const MARKET_LIQUOR = 15;
export const WHOLESALE_LIQUOR = 8;
export const FITOUT_COST = 300;
export const PHONE_COST = 150;
export const REWARD_COST = 300;
/** Experience a hood needs before they can be made a lieutenant. */
export const PROMOTE_XP = 5;
export const INCOME: Record<string, number> = { speakeasy: 600, gambling: 450 };

// ---------------------------------------------------------------- hoods

export const hood = (s: GameState, id: string | null) => (id ? s.hoods.find((h) => h.id === id) : undefined);
/** A person's crew: everyone still on the books (wounded and jailed included). */
export const crewOf = (s: GameState, p: Person) => s.hoods.filter((h) => h.under === p.id && h.status !== 'dead');
/** The part of a crew that can work this month. */
export const ready = (s: GameState, p: Person) => s.hoods.filter((h) => h.under === p.id && h.status === 'active');
export const crewSize = (s: GameState, p: Person) => ready(s, p).length;
export const hoodFirst = (h: Hood) => h.name.split(' ')[0];
export const hoodLabel = (h: Hood) => (h.nickname ? `${hoodFirst(h)} "${h.nickname}" ${h.name.split(' ').slice(1).join(' ')}` : h.name);

/** Hoods on the payroll (wages, and how far the pistols go round). */
export function totalHoods(s: GameState, f: FamilyId): number {
  return s.hoods.filter((h) => h.family === f && h.status !== 'dead').length;
}

/** Who is on a job, by first name: "Vito, Carlo and Nico". */
export function squadNames(s: GameState, j: Job): string {
  const names = j.squad.map((id) => {
    const h = hood(s, id);
    if (h) return hoodFirst(h);
    const p = person(s, id);
    return p ? first(p) : '?';
  });
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function jobTitle(s: GameState, j: Job): string {
  const info = JOBS[j.kind];
  if (!j.target) return info.label;
  if (isBlockId(j.target)) return `${info.verb} ${blockName(s, j.target)}`;
  const t = building(s, j.target)?.name ?? (person(s, j.target) ? label(person(s, j.target)!) : '?');
  return `${info.verb} ${t}`;
}
