import { int, shuffle } from './rng';
import type { Business, FamilyId, GameState, Lieutenant, Racket, Trait } from './types';

export const WIDTH = 12;
export const HEIGHT = 8;

/** Streets run along rows; every business gets a fictional address. */
export const STREETS = [
  'Kessler Street',
  'Canal Street',
  'Orchard Avenue',
  'Foundry Row',
  'Larkin Street',
  'Mercer Avenue',
  'Tallow Lane',
  'Dock Road',
];

const FRONTS: { front: string; suits: Racket }[] = [
  { front: 'Café', suits: 'speakeasy' },
  { front: 'Bakery', suits: 'speakeasy' },
  { front: 'Drugstore', suits: 'speakeasy' },
  { front: 'Dance Hall', suits: 'speakeasy' },
  { front: 'Florist', suits: 'speakeasy' },
  { front: 'Barber Shop', suits: 'gambling' },
  { front: 'Cigar Store', suits: 'gambling' },
  { front: 'Pool Hall', suits: 'gambling' },
  { front: 'Newsstand', suits: 'gambling' },
  { front: 'Laundry', suits: 'still' },
  { front: 'Garage', suits: 'still' },
  { front: 'Funeral Parlor', suits: 'still' },
  { front: 'Warehouse', suits: 'still' },
  { front: 'Tailor', suits: 'gambling' },
];

const SURNAMES = [
  'Novak', 'Rosa', 'Fenwick', 'Albrecht', 'Costa', 'Kaminski', 'Lindqvist', 'Moretti',
  'Okafor', 'Pruitt', 'Quinlan', 'Sorensen', 'Tedesco', 'Vance', 'Weiss', 'Zielinski',
];

export function isLot(x: number, y: number): boolean {
  // Streets every 4th column and every 3rd row; everything else is a lot.
  return x % 4 !== 0 && y % 3 !== 0;
}

export function addressOf(b: { x: number; y: number }): string {
  return STREETS[b.y % STREETS.length];
}

export function makeLt(
  id: string,
  family: FamilyId,
  name: string,
  nickname: string,
  s: [number, number, number, number],
  traits: Trait[],
  loyalty: number,
  ambition: number,
  crew: number,
  x: number,
  y: number,
): Lieutenant {
  return {
    id,
    name,
    nickname,
    family,
    muscle: s[0],
    brains: s[1],
    nerve: s[2],
    charm: s[3],
    traits,
    loyalty,
    ambition,
    authority: 60,
    crew,
    cut: 150,
    status: 'active',
    recover: 0,
    x,
    y,
    order: { goal: 'hold', target: null, posture: 'firm' },
    demand: null,
    ownBusiness: null,
    plotting: false,
    wins: 0,
  };
}

export const RECRUITS: {
  name: string;
  nickname: string;
  s: [number, number, number, number];
  traits: Trait[];
}[] = [
  { name: 'Lou Fenwick', nickname: 'the Ox', s: [8, 2, 6, 3], traits: ['loyal'] },
  { name: 'Tommy Quinlan', nickname: 'Silk', s: [3, 6, 5, 8], traits: ['greedy', 'ambitious'] },
  { name: 'Ada Kaminski', nickname: 'Ledgers', s: [3, 9, 4, 5], traits: ['cautious'] },
  { name: 'Joe Tedesco', nickname: 'Matches', s: [6, 4, 8, 3], traits: ['hothead', 'looselips'] },
  { name: 'Irving Weiss', nickname: 'the Professor', s: [2, 8, 4, 7], traits: ['oldworld', 'loyal'] },
];

export function newGame(seed: number, boss = 'Nico Russo'): GameState {
  const h = { rng: seed | 0 };

  // Lay out the ward: shuffle the lots and take the first 14.
  const lots: { x: number; y: number }[] = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (isLot(x, y)) lots.push({ x, y });
  shuffle(h, lots);
  const fronts = shuffle(h, [...FRONTS]);
  const names = shuffle(h, [...SURNAMES]);

  const businesses: Business[] = lots.slice(0, 14).map((p, i) => {
    const f = fronts[i % fronts.length];
    return {
      id: `b${i}`,
      name: `${names[i % names.length]}'s ${f.front}`,
      front: f.front,
      suits: f.suits,
      x: p.x,
      y: p.y,
      owner: null,
      racket: null,
      telephone: false,
      managedBy: null,
      protection: int(h, 3, 7) * 25,
      raided: false,
      pushed: false,
    };
  });

  // Player starts in the west, rival in the east.
  const byX = [...businesses].sort((a, b) => a.x - b.x || a.y - b.y);
  const hq = byX[0];
  hq.name = "Aldo's Café";
  hq.front = 'Café';
  hq.suits = 'speakeasy';
  hq.owner = 'player';
  hq.racket = 'speakeasy';
  hq.telephone = true;
  const second = byX[1];
  second.owner = 'player';

  const rivalHq = byX[byX.length - 1];
  rivalHq.name = 'Calloway Freight';
  rivalHq.front = 'Warehouse';
  rivalHq.suits = 'still';
  rivalHq.owner = 'rival';
  rivalHq.racket = 'still';
  rivalHq.telephone = true;
  const r2 = byX[byX.length - 2];
  r2.owner = 'rival';
  const r3 = byX[byX.length - 3];
  r3.owner = 'rival';

  const lts: Lieutenant[] = [
    makeLt('sal', 'player', 'Sal Benedetto', 'the Torch', [7, 3, 8, 3], ['hothead', 'greedy'], 58, 35, 5, hq.x, hq.y),
    makeLt('mickey', 'player', 'Mickey Doyle', 'Ledger', [4, 8, 4, 5], ['cautious', 'loyal'], 82, 15, 3, hq.x, hq.y),
    makeLt('rosa', 'player', 'Rosa Marchetti', 'Velvet', [4, 6, 6, 8], ['ambitious', 'oldworld'], 55, 45, 4, hq.x, hq.y),
    makeLt('dutch', 'rival', 'Dutch Brennan', 'Knuckles', [8, 3, 7, 2], ['hothead'], 65, 30, 5, rivalHq.x, rivalHq.y),
    makeLt('eddie', 'rival', 'Eddie Malloy', 'Ten Cents', [4, 6, 4, 6], ['greedy', 'looselips'], 50, 40, 4, rivalHq.x, rivalHq.y),
    makeLt('frankie', 'rival', 'Frankie Kowalski', 'Chops', [6, 4, 5, 4], ['ambitious'], 48, 50, 4, rivalHq.x, rivalHq.y),
  ];
  second.managedBy = 'rosa';
  r2.managedBy = 'eddie';
  r3.managedBy = 'frankie';
  rivalHq.managedBy = 'dutch';
  hq.managedBy = 'mickey';

  // Sensible default orders so "Begin the month" does something on turn one.
  const nearestFree = businesses
    .filter((b) => b.owner === null)
    .sort((a, b) => Math.abs(a.x - hq.x) + Math.abs(a.y - hq.y) - (Math.abs(b.x - hq.x) + Math.abs(b.y - hq.y)));
  lts[0].order = { goal: 'expand', target: nearestFree[0]?.id ?? null, posture: 'firm' };
  lts[1].order = { goal: 'hold', target: hq.id, posture: 'firm' };
  lts[2].order = { goal: 'earn', target: second.id, posture: 'quiet' };

  const state: GameState = {
    seed,
    rng: h.rng,
    month: 0,
    lastMonth: 5,
    width: WIDTH,
    height: HEIGHT,
    hqs: { player: hq.id, rival: rivalHq.id },
    businesses,
    lts,
    families: {
      player: {
        id: 'player',
        name: 'The Russo Family',
        boss,
        cash: 2500,
        heat: 10,
        heatLog: [],
        ledger: [],
        actions: 2,
        actionDebt: 0,
        captainPaid: false,
        grudge: null,
      },
      rival: {
        id: 'rival',
        name: 'The Calloway Outfit',
        boss: 'Big Jim Calloway',
        cash: 2500,
        heat: 15,
        heatLog: [],
        ledger: [],
        actions: 2,
        actionDebt: 0,
        captainPaid: false,
        grudge: null,
      },
    },
    news: [
      {
        headline: 'ALDO RUSSO GETS FIVE YEARS',
        body:
          'Café owner Aldo Russo was sentenced yesterday on charges the court described as "too numerous to read aloud before lunch." ' +
          `His nephew, ${boss}, has taken over the café. Asked about the business, the nephew said he "mostly makes coffee."`,
        weight: 10,
      },
      {
        headline: 'CALLOWAY: "THE WARD IS WIDE OPEN"',
        body:
          'Freight man Big Jim Calloway told reporters he was "sorry to see a fine old gentleman go." ' +
          'Witnesses say he said it while measuring the café windows.',
        weight: 6,
      },
    ],
    wire: [],
    run: null,
    over: null,
  };
  return state;
}
