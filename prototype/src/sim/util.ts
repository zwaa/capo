import type { Branch, Building, FamilyId, GameState, Job, JobKind, Person, SpecialistKind } from './types';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = 30;
export const LT_CAP = 6;
export const MAX_BRANCHES = 3;

export function monthName(m: number): string {
  return `${MONTHS[m % 12]} ${1927 + Math.floor(m / 12)}`;
}

export const other = (f: FamilyId): FamilyId => (f === 'player' ? 'rival' : 'player');
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const building = (s: GameState, id: string | null) => (id ? s.buildings.find((b) => b.id === id) : undefined);
export const person = (s: GameState, id: string | null) => (id ? s.people.find((p) => p.id === id) : undefined);
export const bossOf = (s: GameState, f: FamilyId) => person(s, s.families[f].bossId)!;

/** Everyone still in the family (including wounded and jailed). */
export const members = (s: GameState, f: FamilyId) => s.people.filter((p) => p.family === f && p.status !== 'dead' && p.status !== 'defected');
export const active = (s: GameState, f: FamilyId) => s.people.filter((p) => p.family === f && p.status === 'active');
export const lieutenants = (s: GameState, f: FamilyId) => members(s, f).filter((p) => p.role === 'lt');

export const owned = (s: GameState, f: FamilyId) => s.buildings.filter((b) => b.owner === f);
export const protectedBy = (s: GameState, f: FamilyId) => s.buildings.filter((b) => b.protectedBy === f && b.owner === null);
export const rackets = (s: GameState, f: FamilyId, r?: string) => owned(s, f).filter((b) => b.racket && (!r || b.racket === r));

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

export type TargetRule = 'none' | 'signup' | 'guard' | 'hit' | 'wreck' | 'buy' | 'takeover' | 'fitout' | 'phone';

export interface JobInfo {
  branch: Branch;
  label: string;
  verb: string;
  target: TargetRule;
  ongoing: boolean;
  car: boolean;
  work: number;
  risky: boolean;
  hint: string;
}

export const JOBS: Record<JobKind, JobInfo> = {
  collect: { branch: 'protection', label: 'Collect protection', verb: 'Collecting', target: 'none', ongoing: true, car: false, work: 0, risky: false, hint: 'One pair of hands per five shops. Shops nobody collects from stop paying.' },
  signup: { branch: 'protection', label: 'Sign up a shop', verb: 'Signing up', target: 'signup', ongoing: false, car: false, work: 4, risky: false, hint: 'One pair of hands (three if Calloway already protects it, and expect a fight).' },
  guard: { branch: 'enforcement', label: 'Guard a place', verb: 'Guarding', target: 'guard', ongoing: true, car: false, work: 0, risky: false, hint: 'Two hoods. Makes it much harder to take.' },
  hit: { branch: 'enforcement', label: 'Hit a man', verb: 'Hitting', target: 'hit', ongoing: false, car: true, work: 2, risky: true, hint: 'Three hoods and a car. Very loud.' },
  wreck: { branch: 'enforcement', label: 'Wreck a racket', verb: 'Wrecking', target: 'wreck', ongoing: false, car: false, work: 2, risky: true, hint: 'Three hoods. Smash a Calloway back room.' },
  buy: { branch: 'acquisitions', label: 'Buy a building', verb: 'Buying', target: 'buy', ongoing: false, car: false, work: 3, risky: false, hint: 'One hood and the price. Cheaper if we already protect it.' },
  takeover: { branch: 'acquisitions', label: 'Take over a building', verb: 'Taking over', target: 'takeover', ongoing: false, car: true, work: 3, risky: true, hint: 'Four hoods and a car. Take a Calloway building by force.' },
  fitout: { branch: 'fronts', label: 'Fit out a back room', verb: 'Fitting out', target: 'fitout', ongoing: false, car: false, work: 4, risky: false, hint: 'One pair of hands and $300. The front decides what kind.' },
  phone: { branch: 'fronts', label: 'Put in a telephone', verb: 'Wiring', target: 'phone', ongoing: false, car: false, work: 2, risky: false, hint: 'One hood and $150. Whoever works from here gets orders at once.' },
  runSpeak: { branch: 'speakeasies', label: 'Run the speakeasies', verb: 'Running bars', target: 'none', ongoing: true, car: false, work: 0, risky: false, hint: 'One hood per bar. Each bar pours 15 cases a month.' },
  runGamble: { branch: 'gambling', label: 'Run the gambling', verb: 'Running dens', target: 'none', ongoing: true, car: false, work: 0, risky: false, hint: 'One hood per den.' },
  distill: { branch: 'bootlegging', label: 'Run the stills', verb: 'Distilling', target: 'none', ongoing: true, car: false, work: 0, risky: false, hint: 'One hood per still. Each makes 25 cases a month.' },
  supply: { branch: 'bootlegging', label: 'Supply run', verb: 'Supplying', target: 'none', ongoing: true, car: true, work: 0, risky: false, hint: 'One hood and a truck. Without it, bars buy liquor on the open market.' },
  payoff: { branch: 'police', label: 'Pay the captain', verb: 'Paying off', target: 'none', ongoing: true, car: false, work: 0, risky: false, hint: 'About $250 a month (less with Charm). Halves raids and cools heat.' },
};

export const jobsForBranch = (b: Branch) => (Object.keys(JOBS) as JobKind[]).filter((k) => JOBS[k].branch === b);

/** Valid targets for a job kind, from family f's point of view. */
export function targets(s: GameState, f: FamilyId, kind: JobKind): { id: string; label: string }[] {
  const foe = other(f);
  const bl = (b: Building, extra = '') => ({ id: b.id, label: `${b.name}${extra}` });
  switch (JOBS[kind].target) {
    case 'signup':
      return s.buildings.filter((b) => b.owner === null && b.protectedBy !== f).map((b) => bl(b, b.protectedBy ? ' (Calloway pays)' : ''));
    case 'guard':
      return s.buildings.filter((b) => b.owner === f || (b.protectedBy === f && b.owner === null)).map((b) => bl(b));
    case 'hit':
      return active(s, foe)
        .filter((p) => f !== 'player' || visible(s, p))
        .map((p) => ({ id: p.id, label: label(p) }));
    case 'wreck':
      return s.buildings.filter((b) => b.owner === foe && b.racket).map((b) => bl(b, ` (the ${b.racket})`));
    case 'buy':
      return s.buildings.filter((b) => b.owner === null && b.protectedBy !== foe).map((b) => bl(b, ` ($${price(b, f)})`));
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

/** Who runs a branch, and which branches a person runs. */
export const runner = (s: GameState, f: FamilyId, b: Branch) => person(s, s.families[f].branches[b])!;
export const branchesOf = (s: GameState, p: Person) => BRANCHES.filter((b) => s.families[p.family].branches[b.id] === p.id).map((b) => b.id);

// ---------------------------------------------------------------- prices

export const SPECIALISTS: Record<SpecialistKind, { name: string; title: string; retainer: number; hint: string }> = {
  recruiter: { name: 'Benny Albrecht', title: 'Recruiter', retainer: 120, hint: 'Hoods cost $60 instead of $100' },
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
export const HIRE_COST = 500;
export const INCOME: Record<string, number> = { speakeasy: 600, gambling: 450 };

export function totalHoods(s: GameState, f: FamilyId): number {
  return members(s, f).reduce((n, p) => n + p.crew, 0);
}

export function jobTitle(s: GameState, j: Job): string {
  const info = JOBS[j.kind];
  if (!j.target) return info.label;
  const t = building(s, j.target)?.name ?? (person(s, j.target) ? label(person(s, j.target)!) : '?');
  return `${info.verb} ${t}`;
}
