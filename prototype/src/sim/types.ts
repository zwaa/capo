export type FamilyId = 'player' | 'rival';
export type Racket = 'speakeasy' | 'gambling' | 'still';
export type Posture = 'quiet' | 'firm' | 'loud';
export type Trait = 'hothead' | 'greedy' | 'cautious' | 'ambitious' | 'oldworld' | 'loyal' | 'looselips';
export type Status = 'active' | 'wounded' | 'jailed' | 'dead' | 'defected';

/** The branches of the business in this slice (City Hall comes later). */
export type Branch =
  | 'protection'
  | 'enforcement'
  | 'acquisitions'
  | 'fronts'
  | 'speakeasies'
  | 'gambling'
  | 'bootlegging'
  | 'police';

export type JobKind =
  | 'collect'
  | 'signup'
  | 'guard'
  | 'hit'
  | 'wreck'
  | 'buy'
  | 'takeover'
  | 'fitout'
  | 'phone'
  | 'runSpeak'
  | 'runGamble'
  | 'distill'
  | 'supply'
  | 'payoff';

export type SpecialistKind = 'recruiter' | 'armourer' | 'mechanic' | 'lawyer';

/**
 * A standing job. The plan part (kind, target, posture) persists month to
 * month; the rest is worked out when a month starts.
 */
export interface Job {
  id: string;
  kind: JobKind;
  target: string | null;
  posture: Posture;
  // --- this month
  need: number;
  hoods: number;
  car: boolean;
  /** Why it isn't running, if it isn't. */
  stalled: string | null;
  progress: number;
  days: number;
  done: boolean;
  /** Where the squad is (one-off jobs travel to their target). */
  x: number;
  y: number;
  checked: boolean;
}

export interface Building {
  id: string;
  name: string;
  front: string;
  suits: Racket;
  x: number;
  y: number;
  /** Monthly protection money while someone protects (and collects from) it. */
  protection: number;
  protectedBy: FamilyId | null;
  owner: FamilyId | null;
  racket: Racket | null;
  telephone: boolean;
  raided: boolean;
  /** Months in a row nobody collected. Shops stop paying after a while. */
  uncollected: number;
}

export interface Demand {
  kind: 'raise' | 'building';
  amount: number;
  buildingId: string | null;
  text: string;
  age: number;
}

export interface Person {
  id: string;
  name: string;
  nickname: string;
  family: FamilyId;
  role: 'boss' | 'lt';
  muscle: number;
  brains: number;
  nerve: number;
  charm: number;
  traits: Trait[];
  loyalty: number;
  ambition: number;
  authority: number;
  crew: number;
  cut: number;
  status: Status;
  recover: number;
  x: number;
  y: number;
  /** Where they work from. */
  homeX: number;
  homeY: number;
  /** Ranked standing jobs across all the branches this person runs. */
  jobs: Job[];
  /** New job list on its way by runner during a Change of Plans. */
  pending: { jobs: Job[]; arriveDay: number } | null;
  demand: Demand | null;
  ownBuilding: string | null;
  plotting: boolean;
  wins: number;
}

export interface Line {
  label: string;
  amount: number;
}

export interface Family {
  id: FamilyId;
  name: string;
  bossId: string;
  cash: number;
  heat: number;
  heatLog: Line[];
  ledger: Line[];
  actions: number;
  actionDebt: number;
  /** Who runs each branch (person id). */
  branches: Record<Branch, string>;
  guns: number;
  cars: number;
  liquor: number;
  specialists: SpecialistKind[];
  /** Captain paid this month (a staffed payoff job). */
  captain: boolean;
  grudge: boolean;
  /** Rival only: has Calloway noticed you yet? */
  notice: boolean;
}

export interface CardOption {
  id: string;
  label: string;
  hint: string;
  disabled?: boolean;
}

export type CardKind =
  | 'hothead'
  | 'shopkeeper'
  | 'fight'
  | 'cop'
  | 'tail'
  | 'emergency'
  | 'betrayal'
  | 'offer'
  | 'bail'
  | 'snitch';

export interface Card {
  id: number;
  kind: CardKind;
  day: number;
  title: string;
  text: string;
  options: CardOption[];
  ctx: Record<string, string | number>;
  focus: { x: number; y: number } | null;
}

export interface ScheduledEvent {
  day: number;
  kind: 'cop' | 'tail' | 'tip' | 'defect' | 'offer' | 'bail' | 'snitch';
  ref: string | null;
}

export interface MonthRun {
  day: number;
  queue: Card[];
  scheduled: ScheduledEvent[];
  changesLeft: number;
  rivalChangesLeft: number;
  nextCardId: number;
  log: { day: number; text: string; family: FamilyId | null }[];
  news: NewsItem[];
}

export interface NewsItem {
  headline: string;
  body: string;
  weight: number;
}

export interface WireItem {
  confidence: 'Rumour' | 'Likely' | 'Confirmed';
  text: string;
}

export interface GameOver {
  result: 'win' | 'loss' | 'draw';
  headline: string;
  text: string;
}

export interface Stats {
  fights: number;
  changes: number;
  demandsSeen: number;
  raids: number;
}

export interface GameState {
  seed: number;
  rng: number;
  month: number;
  lastMonth: number;
  width: number;
  height: number;
  buildings: Building[];
  people: Person[];
  families: Record<FamilyId, Family>;
  news: NewsItem[];
  wire: WireItem[];
  run: MonthRun | null;
  over: GameOver | null;
  nextId: number;
  /** Candidate lieutenants waiting to be hired (indexes into the hiring pool). */
  candidates: number[];
  lessons: { on: boolean; index: number };
  stats: Stats;
}
