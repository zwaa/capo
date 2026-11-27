import type { Branch, Building, FamilyId, GameState, Hood, IdleOrder, Job, JobKind, Person, SpecialistKind, Mood, Stance } from './types';

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

// ---------------------------------------------------------------- standing orders for idle hoods

export const IDLE_ORDERS: Record<IdleOrder, { label: string; doing: string; hint: string }> = {
  rest: { label: 'Rest', doing: 'resting', hint: 'Idle hoods stay home.' },
  patrol: {
    label: 'Watch our turf',
    doing: 'watching our turf',
    hint: 'Idle hoods walk the beat and pile in when anything we hold nearby is hit, nearly as good as guards.',
  },
  canvass: {
    label: 'Drum up business',
    doing: 'drumming up business',
    hint: 'Idle hoods quietly sign up homes next to our turf that pay nobody, one door at a time. No rough stuff: a no is a no until next month. Shops still need a proper sign-up.',
  },
};
/** How far from where they work patrolling hoods will run to a fight, and how well they do when they get there. */
export const PATROL_REACH = 4;
export const PATROL_FORCE = 0.8;

/** A person's hoods with nothing to do right now: fit, and on no job that's running. */
export function idleHoods(s: GameState, p: Person): Hood[] {
  const busy = new Set(p.jobs.filter((j) => !j.done && !j.stalled).flatMap((j) => j.squad));
  return ready(s, p).filter((h) => !busy.has(h.id));
}

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
/** Blocks that share a street with this one (no diagonals). */
export function nextBlocks(s: GameState, id: string): string[] {
  const { bx, by } = blockXY(id);
  const all = allBlocks(s);
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([dx, dy]) => `blk${bx + dx}-${by + dy}`)
    .filter((n) => all.includes(n));
}

// Heat. Block heat is police on the beat: shared by everyone with business on the block, whoever
// started it. HQ heat (Family.heat) is what's about the family rather than a place.
/** Jobs on a block at least this hot take a day longer: patrols on every corner. */
export const SLOW_HEAT = 40;
/** Each month a block cools this much, and passes this share of any difference to the blocks around it. */
export const BLOCK_COOL = 3;
export const HEAT_SPREAD = 0.1;
/** A racket is raided on any given day with chance (block heat) / RAID_ODDS (halved with the captain paid). */
export const RAID_ODDS = 2500;
/** Above this HQ heat, a raid on HQ becomes possible: daily chance (HQ heat - line) / HQ_RAID_ODDS, once a month at most. */
export const HQ_RAID_FROM = 40;
export const HQ_RAID_ODDS = 2000;
/** An HQ raid seizes this share of the cash in hand, up to a cap. */
export const HQ_SEIZE = 0.25;
export const HQ_SEIZE_MAX = 1500;
// Fear and goodwill: two dials per block per family, 0-100 each.
/** How a block feels about a family (by a spot on it, or its id). */
export function moodOf(s: GameState, f: FamilyId, at: { x: number; y: number } | string): Mood {
  const id = typeof at === 'string' ? at : blockId(at);
  return s.mood[id]?.[f] ?? { fear: 0, goodwill: 0 };
}
/** A family's grip on a block, 0-1: fear and goodwill together. */
export const grip = (s: GameState, f: FamilyId, at: { x: number; y: number } | string): number => {
  const m = moodOf(s, f, at);
  return (m.fear + m.goodwill) / 200;
};
/** Our grip adds this much (at most) to sign-up odds; the holder's grip takes this much off ours when we lean on their door. */
export const GRIP_PULL = 0.3;
export const GRIP_HOLD = 0.3;
/** A dial at least this high counts: a feared or liked block keeps paying a month longer when nobody collects, each. */
export const LOYAL_MOOD = 40;
/** Months a door goes uncollected before it may stop paying: two, plus one each if the block fears or likes its holder. */
export function patience(s: GameState, f: FamilyId, b: Building): number {
  const m = moodOf(s, f, b);
  return 2 + (m.fear >= LOYAL_MOOD ? 1 : 0) + (m.goodwill >= LOYAL_MOOD ? 1 : 0);
}
/** Each month fear fades by this much, goodwill by this much, and goodwill by one for every HEAT_SOURS of block heat. */
export const FEAR_FADE = 2;
export const GOODWILL_FADE = 1;
export const HEAT_SOURS = 20;
/** Liked blocks (goodwill at least LIKED_MOOD) send recruits: one liked block adds a hood to the hiring hall, two make them better. */
export const LIKED_MOOD = 40;
/** The three jobs: what they cost and how far they move the dials. */
export const CHARITY_COST = 150;
export const CHARITY_GOODWILL = 12;
export const INTIMIDATE_FEAR = 12;
export const BADMOUTH = 10;
/** Stances on our own blocks, applied at month end. Generous costs this much per place we hold on the block. */
export const GENEROUS_COST = 10;
export const STANCES: Record<Stance, { label: string; hint: string }> = {
  generous: {
    label: 'Generous',
    hint: '$10 a month for each place we hold here: a loan forgiven, a doctor paid. Goodwill grows; fear fades a little.',
  },
  firm: { label: 'Firm', hint: 'Business as usual: fear holds steady.' },
  ironfist: { label: 'Iron fist', hint: 'Make examples. Fear grows, goodwill falls, and the block warms up.' },
};
/** Paying off the beat on a block: a monthly envelope (less with Charm), and how much it cools the block and those around it. */
export const BEAT_COST = 100;
export const BEAT_MIN = 50;
export const BEAT_COOL = 10;
export const BEAT_AROUND = 3;
/** Whether a family has the beat on this block paid off (a live job for it, not stalled). */
export function beatPaid(s: GameState, f: FamilyId, id: string): boolean {
  return members(s, f).some((p) => p.jobs.some((j) => j.kind === 'beat' && j.target === id && !j.done && !j.stalled));
}
/** Heat on the block around a spot. */
export const heatAt = (s: GameState, at: { x: number; y: number }): number => s.blockHeat[blockId(at)] ?? 0;
/** The hottest block where a family holds anything (owned or paying it). */
export function hottestHeld(s: GameState, f: FamilyId): number {
  return Math.max(0, ...s.buildings.filter((b) => holder(b) === f).map((b) => heatAt(s, b)));
}
/** The hottest block where a family has rackets (what makes paying the captain worth it). */
export function hottestRacket(s: GameState, f: FamilyId): number {
  return Math.max(0, ...s.buildings.filter((b) => b.owner === f && b.racket).map((b) => heatAt(s, b)));
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

export type TargetRule =
  | 'none'
  | 'signup'
  | 'block'
  | 'guard'
  | 'hit'
  | 'wreck'
  | 'buy'
  | 'takeover'
  | 'fitout'
  | 'phone'
  | 'beat'
  | 'area'
  | 'foeArea';

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
    hint: 'One pair of hands (two if Calloway already protects it: then it is a matter of pressure, and fists if his men are about).',
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
  beat: {
    branch: 'police',
    label: 'Pay off the beat',
    verb: 'Paying off the beat on',
    target: 'beat',
    ongoing: true,
    car: false,
    work: 0,
    risky: false,
    stat: 'charm',
    hint: 'About $100 a month (less with Charm). The cops on that block look the other way: it cools fast, the blocks around it a little, and raids there are halved.',
  },
  charity: {
    branch: 'protection',
    label: 'Charity',
    verb: 'Handing out charity on',
    target: 'area',
    ongoing: false,
    car: false,
    work: 2,
    risky: false,
    stat: 'charm',
    hint: 'One hood and $150: coal for the stoves, a turkey at the church. Goodwill on that block.',
  },
  intimidate: {
    branch: 'enforcement',
    label: 'Intimidation',
    verb: 'Putting the fear into',
    target: 'area',
    ongoing: false,
    car: false,
    work: 2,
    risky: false,
    stat: 'muscle',
    hint: 'Two hoods walk the block and break a window or two. Fear on that block, a little less goodwill, a little heat.',
  },
  badmouth: {
    branch: 'protection',
    label: 'Bad-mouth them',
    verb: 'Spreading talk on',
    target: 'foeArea',
    ongoing: false,
    car: false,
    work: 3,
    risky: false,
    stat: 'charm',
    hint: 'One hood in the bars and barbershops, telling everyone what the other lot are really like. Sours their goodwill on that block.',
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
    case 'beat':
      return allBlocks(s).map((id) => ({ id, label: `${cap(blockName(s, id))} (heat ${s.blockHeat[id] ?? 0})` }));
    case 'area':
      return allBlocks(s).map((id) => {
        const m = moodOf(s, f, id);
        return { id, label: `${cap(blockName(s, id))} (fear ${m.fear}, goodwill ${m.goodwill})` };
      });
    case 'foeArea':
      return allBlocks(s)
        .filter((id) => moodOf(s, foe, id).goodwill > 0)
        .map((id) => ({ id, label: `${cap(blockName(s, id))} (their goodwill ${moodOf(s, foe, id).goodwill})` }));
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

/**
 * Whose turf a map tile is on, for drawing: whoever holds the building there.
 * Every lot is a shop or a home now, so turf is exactly what pays or belongs to
 * a family, plus the boss's own front door. (Reach for sign-ups is wider: onTurf.)
 */
export function turfAt(s: GameState, x: number, y: number): FamilyId | null {
  const here = s.buildings.find((b) => b.x === x && b.y === y);
  if (here && holder(here)) return holder(here);
  const boss = bossOf(s, 'player');
  return boss.homeX === x && boss.homeY === y ? 'player' : null;
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
  consigliere: {
    name: 'Aurelio Ferro',
    title: 'Consigliere',
    retainer: 150,
    hint: 'Reads the month for you: trends, forecasts, a read on Calloway, and options. A worrier, and not always right',
  },
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
/** What an owned building makes from its legitimate front each month. */
export const LEGIT_TRADE = 50;
/** Rough monthly worth of a still's liquor, for the Wealth map only. */
const STILL_WORTH = 250;

/**
 * How rich a place is, roughly: what it would bring in if properly run. Indicative only:
 * the Wealth map shows it as a glow, never as a number, so it gives nothing away about
 * Calloway's books that the street wouldn't.
 */
export function wealth(b: Building): number {
  if (b.racket === 'still') return STILL_WORTH;
  if (b.racket) return INCOME[b.racket];
  return b.protection + (b.owner ? LEGIT_TRADE : 0);
}

// ---------------------------------------------------------------- hoods

export const hood = (s: GameState, id: string | null) => (id ? s.hoods.find((h) => h.id === id) : undefined);
/** A person's crew: everyone still on the books (wounded and jailed included). */
export const crewOf = (s: GameState, p: Person) => s.hoods.filter((h) => h.under === p.id && h.status !== 'dead');
/** The part of a crew that can work this month. */
export const ready = (s: GameState, p: Person) => s.hoods.filter((h) => h.under === p.id && h.status === 'active');
export const crewSize = (s: GameState, p: Person) => ready(s, p).length;
export const hoodFirst = (h: Hood) => h.name.split(' ')[0];
export const hoodLabel = (h: Hood) => (h.nickname ? `${hoodFirst(h)} "${h.nickname}" ${h.name.split(' ').slice(1).join(' ')}` : h.name);

/** Hoods on the payroll (wages). */
export function totalHoods(s: GameState, f: FamilyId): number {
  return s.hoods.filter((h) => h.family === f && h.status !== 'dead').length;
}

/**
 * Everyone who needs a pistol: the hoods and the lieutenants, who go along on
 * the jobs they run. (The boss carries his own.)
 */
export function gunHands(s: GameState, f: FamilyId): number {
  return totalHoods(s, f) + lieutenants(s, f).length;
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
