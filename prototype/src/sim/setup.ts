import { chance, int, pick, shuffle } from './rng';
import type { RngHolder } from './rng';
import type { Branch, Building, FamilyId, GameState, Hood, Job, JobKind, Person, Posture, Racket, Trait } from './types';
import { BRANCHES, STREET_NAMES, dist } from './util';

export const WIDTH = 12;
export const HEIGHT = 8;

export const STREETS = STREET_NAMES;

const FRONTS: { front: string; suits: Racket }[] = [
  { front: 'Café', suits: 'speakeasy' },
  { front: 'Bakery', suits: 'speakeasy' },
  { front: 'Drugstore', suits: 'speakeasy' },
  { front: 'Dance Hall', suits: 'speakeasy' },
  { front: 'Florist', suits: 'speakeasy' },
  { front: 'Social Club', suits: 'speakeasy' },
  { front: 'Barber Shop', suits: 'gambling' },
  { front: 'Cigar Store', suits: 'gambling' },
  { front: 'Pool Hall', suits: 'gambling' },
  { front: 'Newsstand', suits: 'gambling' },
  { front: 'Tailor', suits: 'gambling' },
  { front: 'Bowling Alley', suits: 'gambling' },
  { front: 'Laundry', suits: 'still' },
  { front: 'Garage', suits: 'still' },
  { front: 'Funeral Parlor', suits: 'still' },
  { front: 'Warehouse', suits: 'still' },
  { front: 'Ice House', suits: 'still' },
  { front: 'Hardware Store', suits: 'gambling' },
  { front: 'Diner', suits: 'speakeasy' },
  { front: 'Cooperage', suits: 'still' },
];

const HOMES = ['Tenement', 'Rowhouses', 'Boarding House', 'Walk-up', 'Tenement'];

const SURNAMES = [
  'Novak',
  'Rosa',
  'Fenwick',
  'Albrecht',
  'Costa',
  'Kaminski',
  'Lindqvist',
  'Moretti',
  'Okafor',
  'Pruitt',
  'Quinlan',
  'Sorensen',
  'Tedesco',
  'Vance',
  'Weiss',
  'Zielinski',
  'Brandt',
  'Healy',
  'Ivanov',
  'Murphy',
];

// ---------------------------------------------------------------- hood names

const FIRST = [
  'Tony',
  'Vinnie',
  'Joey',
  'Paulie',
  'Sammy',
  'Mo',
  'Izzy',
  'Patsy',
  'Augie',
  'Dom',
  'Gus',
  'Hymie',
  'Rocco',
  'Sid',
  'Carmine',
  'Mae',
  'Dot',
  'Lil',
  'Kitty',
  'Red',
  'Mikey',
  'Charlie',
  'Willie',
  'Jack',
  'Danny',
  'Abe',
  'Nate',
  'Ruby',
  'Pearl',
  'Stan',
  'Walt',
  'Otto',
  'Pete',
  'Al',
  'Bruno',
  'Enzo',
  'Harry',
  'Max',
  'Rose',
  'Nell',
  'Jimmy',
  'Phil',
  'Lenny',
  'Marty',
  'Sol',
];
const LAST = [
  'Caruso',
  'Lombardi',
  'Esposito',
  'Kelly',
  'Gallagher',
  'Rourke',
  'Shapiro',
  'Goldberg',
  'Nowak',
  'Petrov',
  'Rizzo',
  'Ferraro',
  'Donnelly',
  'Sweeney',
  'Abramowitz',
  'Mancini',
  'Greco',
  'Levine',
  'Hart',
  'Boyle',
  'Murray',
  'Szabo',
  'Horvat',
  'Dunn',
  'Costello',
  'Fiore',
  'Brennan',
  'Walsh',
  'Katz',
  'Lindgren',
  'Bauer',
  'Vitale',
  'Romano',
  'Feeney',
  'Klein',
  'Sokol',
];
export const NICKS = [
  'Two Times',
  'the Ear',
  'Shoes',
  'Lefty',
  'Specs',
  'Bananas',
  'Ice',
  'the Kid',
  'Moon',
  'Dimes',
  'the Barber',
  'Spats',
  'Sugar',
  'Mumbles',
  'Feathers',
  'the Mule',
  'Cheese',
  'Pockets',
  'Sunday',
  'Peanuts',
  'the Priest',
  'Gloves',
  'Socks',
  'Whispers',
  'Blue',
  'Tick-Tock',
  'Fingers',
  'the Hat',
  'Lucky',
  'Doc',
];
const BIOS = [
  'Drove a milk wagon until the horse died.',
  "Did two years upstate. Won't say what for.",
  'Ex-prizefighter. Lost more than he won, but never quietly.',
  'Ran numbers for a candy store at fourteen.',
  'Back from France with a medal and no job.',
  'Tended bar down at the docks for six years.',
  "A cousin of somebody's cousin. Everyone is, round here.",
  'Fired from the railroad for "too much initiative".',
  'Knows every alley between Kessler Street and the river.',
  'Can talk a shopkeeper into anything, including trouble.',
  'Quiet. Too quiet, the others say.',
  'Kept books for a bookie who is no longer with us.',
  'Used to deliver ice. Still has the shoulders for it.',
  'Ran a crap game in a church basement. The priest took a cut.',
  'Left the police force "by mutual agreement".',
  'Played piano in a dance hall until the dance hall burned.',
];
const HOOD_TRAITS: Trait[] = ['hothead', 'greedy', 'cautious', 'ambitious', 'oldworld', 'loyal', 'looselips'];

/** A fresh hood off the street. Quality goes up with a recruiter. */
export function makeHood(h: RngHolder, id: string, family: FamilyId, under: string, quality = 0): Hood {
  const st = [int(h, 2, 5), int(h, 2, 5), int(h, 2, 5), int(h, 2, 5)].map((v) => Math.min(9, v + quality));
  // Everyone is good at something.
  const k = int(h, 0, 3);
  st[k] = Math.min(9, st[k] + int(h, 1, 3));
  return {
    id,
    name: `${pick(h, FIRST)} ${pick(h, LAST)}`,
    nickname: chance(h, 0.45) ? pick(h, NICKS) : '',
    family,
    under,
    muscle: st[0],
    brains: st[1],
    nerve: st[2],
    charm: st[3],
    traits: chance(h, 0.45) ? [pick(h, HOOD_TRAITS)] : [],
    loyalty: int(h, 45, 70),
    xp: int(h, 0, 1),
    status: 'active',
    recover: 0,
    bio: pick(h, BIOS),
  };
}

/**
 * Notable hoods: experienced, strong-willed, lieutenant material. The first
 * three turn up through the lessons; the rest can appear in the hiring hall.
 */
export const POOL: { name: string; nickname: string; s: [number, number, number, number]; traits: Trait[]; pitch: string }[] = [
  {
    name: 'Sal Benedetto',
    nickname: 'the Torch',
    s: [7, 3, 8, 3],
    traits: ['hothead', 'greedy'],
    pitch: 'Ran collections for your uncle. Good with his hands. Too good, some say.',
  },
  {
    name: 'Rosa Marchetti',
    nickname: 'Velvet',
    s: [4, 6, 6, 8],
    traits: ['ambitious', 'oldworld'],
    pitch: 'Ran the bar at the Orchard Avenue social club for ten years. Knows everyone, remembers everything.',
  },
  {
    name: 'Mickey Doyle',
    nickname: 'Ledger',
    s: [4, 8, 4, 6],
    traits: ['cautious', 'loyal'],
    pitch: 'An ex-clerk at the precinct house. Knows which captain takes what.',
  },
  { name: 'Lou Fenwick', nickname: 'the Ox', s: [8, 2, 6, 3], traits: ['loyal'], pitch: 'Strong, steady, not much for conversation.' },
  {
    name: 'Tommy Quinlan',
    nickname: 'Silk',
    s: [3, 6, 5, 8],
    traits: ['greedy', 'ambitious'],
    pitch: 'Could sell a stove in July. Watch your wallet.',
  },
  {
    name: 'Ada Kaminski',
    nickname: 'Ledgers',
    s: [3, 9, 4, 5],
    traits: ['cautious'],
    pitch: 'Ran the numbers for the Polish club. Never wrote anything down.',
  },
  {
    name: 'Joe Tedesco',
    nickname: 'Matches',
    s: [6, 4, 8, 3],
    traits: ['hothead', 'looselips'],
    pitch: 'Fearless. Also talks in his sleep, and when awake.',
  },
  {
    name: 'Irving Weiss',
    nickname: 'the Professor',
    s: [2, 8, 4, 7],
    traits: ['oldworld', 'loyal'],
    pitch: 'A former schoolteacher with debts and a gift for figures.',
  },
];

export function notableHood(i: number, id: string, family: FamilyId, under: string): Hood {
  const r = POOL[i];
  return {
    id,
    name: r.name,
    nickname: r.nickname,
    family,
    under,
    muscle: r.s[0],
    brains: r.s[1],
    nerve: r.s[2],
    charm: r.s[3],
    traits: [...r.traits],
    loyalty: 60,
    xp: 5,
    status: 'active',
    recover: 0,
    bio: r.pitch,
  };
}

export const isLot = (x: number, y: number) => x % 4 !== 0 && y % 3 !== 0;
export const streetOf = (b: { y: number }) => STREETS[b.y % STREETS.length];

export function blankJob(id: string, kind: JobKind, target: string | null = null, posture: Posture = 'firm'): Job {
  return {
    id,
    kind,
    target,
    posture,
    need: 0,
    hoods: 0,
    squad: [],
    car: false,
    stalled: null,
    progress: 0,
    days: 0,
    done: false,
    x: 0,
    y: 0,
    checked: false,
  };
}

export function makePerson(
  id: string,
  family: FamilyId,
  role: 'boss' | 'lt',
  name: string,
  nickname: string,
  s: [number, number, number, number],
  traits: Trait[],
  at: { x: number; y: number },
): Person {
  return {
    id,
    name,
    nickname,
    family,
    role,
    muscle: s[0],
    brains: s[1],
    nerve: s[2],
    charm: s[3],
    traits,
    loyalty: role === 'boss' ? 100 : 60,
    ambition: role === 'boss' ? 0 : 25,
    authority: 60,
    cut: role === 'boss' ? 0 : 100,
    status: 'active',
    recover: 0,
    x: at.x,
    y: at.y,
    homeX: at.x,
    homeY: at.y,
    jobs: [],
    pending: null,
    demand: null,
    ownBuilding: null,
    idle: 'rest',
    plotting: false,
    wins: 0,
  };
}

/** Three hoods looking for work this month (four with a recruiter, and better). */
export function freshMarket(s: GameState): void {
  const good = s.families.player.specialists.includes('recruiter');
  const n = good ? 4 : 3;
  s.market = [];
  for (let i = 0; i < n; i++) s.market.push(makeHood(s, `h${s.nextId++}`, 'player', '', good ? 1 : 0));
  // Now and then a notable turns up (when lessons aren't handing them out).
  if (!s.lessons.on && chance(s, 0.2)) {
    const free = POOL.map((_, i) => i).filter(
      (i) => !s.hoods.some((h) => h.name === POOL[i].name) && !s.people.some((p) => p.name === POOL[i].name),
    );
    if (free.length) s.market.push(notableHood(pick(s, free), `h${s.nextId++}`, 'player', ''));
  }
}

const allTo = (id: string) => Object.fromEntries(BRANCHES.map((b) => [b.id, id])) as Record<Branch, string>;

export function newGame(seed: number, bossName = 'Nico Russo'): GameState {
  const h = { rng: seed | 0 };
  let nextId = 1;
  const lots: { x: number; y: number }[] = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (isLot(x, y)) lots.push({ x, y });
  shuffle(h, lots);
  const fronts = shuffle(h, [...FRONTS]);
  const names = shuffle(h, [...SURNAMES]);

  const buildings: Building[] = lots.slice(0, 20).map((p, i) => ({
    id: `b${i}`,
    kind: 'shop' as const,
    name: `${names[i]}'s ${fronts[i].front}`,
    front: fronts[i].front,
    suits: fronts[i].suits,
    x: p.x,
    y: p.y,
    protection: int(h, 4, 8) * 25,
    protectedBy: null,
    owner: null,
    racket: null,
    telephone: false,
    raided: false,
    uncollected: 0,
    took: 0,
    refused: false,
  }));

  // The boss starts in a rented room in the west; Calloway owns the east.
  const free = lots.slice(20).sort((a, b) => a.x - b.x || a.y - b.y);
  const home = free[0];
  const east = [...buildings].sort((a, b) => b.x - a.x || a.y - b.y);
  const hq = east[0];
  Object.assign(hq, { name: 'Calloway Freight', front: 'Warehouse', suits: 'still', owner: 'rival', racket: 'still', telephone: true });
  const bar = east.find((b) => b !== hq && b.suits === 'speakeasy') ?? east[1];
  Object.assign(bar, { owner: 'rival', racket: 'speakeasy', telephone: true });
  const den = east.find((b) => b !== hq && b !== bar && b.suits === 'gambling') ?? east[2];
  Object.assign(den, { owner: 'rival', racket: 'gambling' });
  for (const b of east.filter((b) => !b.owner).slice(0, 4)) b.protectedBy = 'rival';

  // Every other lot is a home: tenements and rowhouses. They pay a little protection each,
  // and Calloway already collects from the ones on his doorstep.
  const held = buildings.filter((b) => b.owner || b.protectedBy);
  free.forEach((p, i) => {
    const front = pick(h, HOMES);
    buildings.push({
      id: `r${i}`,
      kind: 'home',
      name: `${front} at ${int(h, 2, 60) * 2} ${STREETS[p.y % STREETS.length]}`,
      front,
      suits: 'speakeasy',
      x: p.x,
      y: p.y,
      protection: int(h, 1, 3) * 10,
      protectedBy: p !== home && held.some((b) => dist(b, p) <= 1) ? 'rival' : null,
      owner: null,
      racket: null,
      telephone: false,
      raided: false,
      uncollected: 0,
      took: 0,
      refused: false,
    });
  });

  const boss = makePerson('boss', 'player', 'boss', bossName, 'the Nephew', [5, 5, 5, 5], [], home);
  const rboss = makePerson('calloway', 'rival', 'boss', 'Jim Calloway', 'Big Jim', [6, 6, 6, 5], ['oldworld'], hq);
  const dutch = makePerson('dutch', 'rival', 'lt', 'Dutch Brennan', 'Knuckles', [8, 3, 7, 2], ['hothead'], hq);
  const eddie = makePerson('eddie', 'rival', 'lt', 'Eddie Malloy', 'Ten Cents', [4, 6, 4, 6], ['greedy', 'looselips'], bar);
  const frankie = makePerson('frankie', 'rival', 'lt', 'Frankie Kowalski', 'Chops', [6, 5, 5, 4], ['ambitious'], den);
  for (const p of [dutch, eddie, frankie]) {
    p.loyalty = 55;
    p.ambition = 35;
  }

  // Your two cousins. They've done a bit of work for Aldo.
  const vito: Hood = {
    id: `h${nextId++}`,
    name: 'Vito Russo',
    nickname: 'Shoes',
    family: 'player',
    under: 'boss',
    muscle: 6,
    brains: 3,
    nerve: 5,
    charm: 3,
    traits: ['hothead'],
    loyalty: 75,
    xp: 2,
    status: 'active',
    recover: 0,
    bio: 'Your cousin. Shined shoes outside the courthouse; knows every cop by his feet.',
  };
  const carlo: Hood = {
    id: `h${nextId++}`,
    name: 'Carlo Russo',
    nickname: '',
    family: 'player',
    under: 'boss',
    muscle: 3,
    brains: 5,
    nerve: 4,
    charm: 6,
    traits: ['loyal'],
    loyalty: 80,
    xp: 2,
    status: 'active',
    recover: 0,
    bio: 'Your other cousin. Sold insurance, the legal kind, until nobody bought it.',
  };
  // Calloway's men: an established outfit with seasoned crews.
  const hoods: Hood[] = [vito, carlo];
  for (const [under, n] of [
    ['calloway', 2],
    ['dutch', 4],
    ['eddie', 3],
    ['frankie', 3],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const x = makeHood(h, `h${nextId++}`, 'rival', under, under === 'dutch' ? 1 : 0);
      x.xp = int(h, 1, 3);
      hoods.push(x);
    }
  }

  const rivalBranches = allTo('calloway');
  rivalBranches.protection = 'dutch';
  rivalBranches.enforcement = 'dutch';
  rivalBranches.speakeasies = 'eddie';
  rivalBranches.gambling = 'eddie';
  rivalBranches.bootlegging = 'eddie';
  rivalBranches.acquisitions = 'frankie';
  rivalBranches.fronts = 'frankie';

  const state: GameState = {
    seed,
    rng: h.rng,
    month: 0,
    lastMonth: 11,
    width: WIDTH,
    height: HEIGHT,
    buildings,
    people: [boss, rboss, dutch, eddie, frankie],
    hoods,
    market: [],
    families: {
      player: {
        id: 'player',
        name: 'The Russo Family',
        bossId: 'boss',
        cash: 300,
        heat: 0,
        heatLog: [],
        ledger: [],
        actions: 2,
        actionDebt: 0,
        branches: allTo('boss'),
        guns: 2,
        cars: 0,
        liquor: 0,
        specialists: [],
        captain: false,
        grudge: false,
        provoked: 0,
        notice: false,
      },
      rival: {
        id: 'rival',
        name: 'The Calloway Outfit',
        bossId: 'calloway',
        cash: 1500,
        heat: 15,
        heatLog: [],
        ledger: [],
        actions: 2,
        actionDebt: 0,
        branches: rivalBranches,
        guns: 14,
        cars: 2,
        liquor: 20,
        specialists: ['armourer'],
        captain: false,
        grudge: false,
        provoked: 0,
        notice: false,
      },
    },
    news: [
      {
        headline: 'ALDO RUSSO GETS FIVE YEARS; CAFÉ SEIZED',
        body:
          'Café owner Aldo Russo was sentenced yesterday on charges the court described as "too numerous to read aloud before lunch." ' +
          `Police padlocked the café. His nephew, ${bossName}, was seen leaving with his cousins Vito and Carlo, a suitcase and, witnesses say, "a look."`,
        weight: 10,
      },
      {
        headline: 'CALLOWAY: "THE WARD IS QUIET, AND I LIKE IT QUIET"',
        body: 'Freight man Jim Calloway, whose trucks are rarely inspected, told reporters the east end has "never been more orderly." The west end, he added, "is nobody\'s problem."',
        weight: 6,
      },
    ],
    wire: [],
    run: null,
    over: null,
    nextId,
    candidates: [],
    lessons: { on: true, index: 0 },
    blockHeat: {},
    blockHeatLog: [],
    stats: { fights: 0, changes: 0, demandsSeen: 0, raids: 0 },
  };
  return state;
}
