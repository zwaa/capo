import { int, shuffle } from './rng';
import type { Branch, Building, FamilyId, GameState, Job, JobKind, Person, Posture, Racket, Trait } from './types';
import { BRANCHES } from './util';

export const WIDTH = 12;
export const HEIGHT = 8;

export const STREETS = ['Kessler Street', 'Canal Street', 'Orchard Avenue', 'Foundry Row', 'Larkin Street', 'Mercer Avenue', 'Tallow Lane', 'Dock Road'];

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

const SURNAMES = ['Novak', 'Rosa', 'Fenwick', 'Albrecht', 'Costa', 'Kaminski', 'Lindqvist', 'Moretti', 'Okafor', 'Pruitt', 'Quinlan', 'Sorensen', 'Tedesco', 'Vance', 'Weiss', 'Zielinski', 'Brandt', 'Healy', 'Ivanov', 'Murphy'];

export const isLot = (x: number, y: number) => x % 4 !== 0 && y % 3 !== 0;
export const streetOf = (b: { y: number }) => STREETS[b.y % STREETS.length];

/** Lieutenants you can hire. The first three arrive through the lessons. */
export const POOL: { name: string; nickname: string; s: [number, number, number, number]; traits: Trait[]; pitch: string }[] = [
  { name: 'Sal Benedetto', nickname: 'the Torch', s: [7, 3, 8, 3], traits: ['hothead', 'greedy'], pitch: 'Ran collections for your uncle. Good with his hands. Too good, some say.' },
  { name: 'Rosa Marchetti', nickname: 'Velvet', s: [4, 6, 6, 8], traits: ['ambitious', 'oldworld'], pitch: 'Ran the bar at the Orchard Avenue social club for ten years. Knows everyone, remembers everything.' },
  { name: 'Mickey Doyle', nickname: 'Ledger', s: [4, 8, 4, 6], traits: ['cautious', 'loyal'], pitch: 'An ex-clerk at the precinct house. Knows which captain takes what.' },
  { name: 'Lou Fenwick', nickname: 'the Ox', s: [8, 2, 6, 3], traits: ['loyal'], pitch: 'Strong, steady, not much for conversation.' },
  { name: 'Tommy Quinlan', nickname: 'Silk', s: [3, 6, 5, 8], traits: ['greedy', 'ambitious'], pitch: 'Could sell a stove in July. Watch your wallet.' },
  { name: 'Ada Kaminski', nickname: 'Ledgers', s: [3, 9, 4, 5], traits: ['cautious'], pitch: 'Ran the numbers for the Polish club. Never wrote anything down.' },
  { name: 'Joe Tedesco', nickname: 'Matches', s: [6, 4, 8, 3], traits: ['hothead', 'looselips'], pitch: 'Fearless. Also talks in his sleep, and when awake.' },
  { name: 'Irving Weiss', nickname: 'the Professor', s: [2, 8, 4, 7], traits: ['oldworld', 'loyal'], pitch: 'A former schoolteacher with debts and a gift for figures.' },
];

export function blankJob(id: string, kind: JobKind, target: string | null = null, posture: Posture = 'firm'): Job {
  return { id, kind, target, posture, need: 0, hoods: 0, car: false, stalled: null, progress: 0, days: 0, done: false, x: 0, y: 0, checked: false };
}

export function makePerson(
  id: string,
  family: FamilyId,
  role: 'boss' | 'lt',
  name: string,
  nickname: string,
  s: [number, number, number, number],
  traits: Trait[],
  crew: number,
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
    crew,
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
    plotting: false,
    wins: 0,
  };
}

const allTo = (id: string) => Object.fromEntries(BRANCHES.map((b) => [b.id, id])) as Record<Branch, string>;

export function newGame(seed: number, bossName = 'Nico Russo'): GameState {
  const h = { rng: seed | 0 };
  const lots: { x: number; y: number }[] = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (isLot(x, y)) lots.push({ x, y });
  shuffle(h, lots);
  const fronts = shuffle(h, [...FRONTS]);
  const names = shuffle(h, [...SURNAMES]);

  const buildings: Building[] = lots.slice(0, 20).map((p, i) => ({
    id: `b${i}`,
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

  const boss = makePerson('boss', 'player', 'boss', bossName, 'the Nephew', [5, 5, 5, 5], [], 2, home);
  const rboss = makePerson('calloway', 'rival', 'boss', 'Jim Calloway', 'Big Jim', [6, 6, 6, 5], ['oldworld'], 2, hq);
  const dutch = makePerson('dutch', 'rival', 'lt', 'Dutch Brennan', 'Knuckles', [8, 3, 7, 2], ['hothead'], 4, hq);
  const eddie = makePerson('eddie', 'rival', 'lt', 'Eddie Malloy', 'Ten Cents', [4, 6, 4, 6], ['greedy', 'looselips'], 3, bar);
  const frankie = makePerson('frankie', 'rival', 'lt', 'Frankie Kowalski', 'Chops', [6, 5, 5, 4], ['ambitious'], 3, den);
  for (const p of [dutch, eddie, frankie]) {
    p.loyalty = 55;
    p.ambition = 35;
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
        notice: false,
      },
    },
    news: [
      {
        headline: 'ALDO RUSSO GETS FIVE YEARS; CAFÉ SEIZED',
        body:
          'Café owner Aldo Russo was sentenced yesterday on charges the court described as "too numerous to read aloud before lunch." ' +
          `Police padlocked the café. His nephew, ${bossName}, was seen leaving with two cousins, a suitcase and, witnesses say, "a look."`,
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
    nextId: 1,
    candidates: [],
    lessons: { on: true, index: 0 },
    stats: { fights: 0, changes: 0, demandsSeen: 0, raids: 0 },
  };
  return state;
}
