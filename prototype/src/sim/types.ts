export type FamilyId = 'player' | 'rival';
export type Racket = 'speakeasy' | 'gambling' | 'still';
export type Goal = 'expand' | 'earn' | 'hold' | 'hit' | 'lielow' | 'recruit';
export type Posture = 'quiet' | 'firm' | 'loud';
export type Trait =
  | 'hothead'
  | 'greedy'
  | 'cautious'
  | 'ambitious'
  | 'oldworld'
  | 'loyal'
  | 'looselips';

export type LtStatus = 'active' | 'wounded' | 'jailed' | 'dead' | 'defected';

/** Orders are data: the player and the AI submit exactly the same shape. */
export interface Order {
  goal: Goal;
  /** Business id (expand/earn/hold) or lieutenant id / business id (hit). */
  target: string | null;
  posture: Posture;
}

export interface Business {
  id: string;
  name: string;
  front: string;
  /** The back-room trade this front is suited to. */
  suits: Racket;
  x: number;
  y: number;
  owner: FamilyId | null;
  racket: Racket | null;
  telephone: boolean;
  /** Lieutenant who runs it day to day (feeds their ambition). */
  managedBy: string | null;
  /** Monthly protection money this shop pays its owner. */
  protection: number;
  /** Racket shut down by a raid for the rest of the month. */
  raided: boolean;
  /** Pushed this month by an Earn order: +50% racket income. */
  pushed: boolean;
}

export interface Demand {
  kind: 'raise' | 'business';
  /** Raise amount per month, or the business id they want. */
  amount: number;
  businessId: string | null;
  text: string;
  /** Months it has gone unanswered. */
  age: number;
}

export interface Lieutenant {
  id: string;
  name: string;
  nickname: string;
  family: FamilyId;
  muscle: number;
  brains: number;
  nerve: number;
  charm: number;
  traits: Trait[];
  /** Hidden from the player; shown only as signs. 0-100. */
  loyalty: number;
  /** Visible meter. 0-100. */
  ambition: number;
  /** How well the crew obeys. 0-100. */
  authority: number;
  crew: number;
  /** Monthly cut paid to the lieutenant. */
  cut: number;
  status: LtStatus;
  /** Months left until a wounded lieutenant is back. */
  recover: number;
  x: number;
  y: number;
  order: Order;
  demand: Demand | null;
  /** Business id they were given as "their own" (they keep half). */
  ownBusiness: string | null;
  /** Month on which they will betray the family, if plotting. */
  plotting: boolean;
  /** Successes this month (feeds ambition). */
  wins: number;
}

/** A single itemised cause, so every number can explain itself. */
export interface Line {
  label: string;
  amount: number;
}

export interface Family {
  id: FamilyId;
  name: string;
  boss: string;
  cash: number;
  heat: number;
  /** Heat changes this month, itemised. */
  heatLog: Line[];
  /** Money in and out this month, itemised. */
  ledger: Line[];
  /** Boss actions available this month. */
  actions: number;
  /** Actions lost next month (each Change of Plans costs one). */
  actionDebt: number;
  captainPaid: boolean;
  /** Family id that killed one of ours last month, for AI grudges. */
  grudge: string | null;
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
  | 'betrayal';

export interface Card {
  id: number;
  kind: CardKind;
  day: number;
  title: string;
  text: string;
  options: CardOption[];
  /** Free-form context the resolver needs. */
  ctx: Record<string, string | number>;
  /** Business or lieutenant to focus the map on. */
  focus: { x: number; y: number } | null;
}

export interface Op {
  ltId: string;
  goal: Goal;
  target: string | null;
  posture: Posture;
  daysNeeded: number;
  progress: number;
  done: boolean;
  /** New orders on their way by runner. */
  pending: { order: Order; arriveDay: number } | null;
  /** Personality checks already made this op. */
  checked: boolean;
}

export interface ScheduledEvent {
  day: number;
  kind: 'cop' | 'tail' | 'tip' | 'defect';
  family: FamilyId;
  ref: string | null;
}

export interface MonthRun {
  day: number;
  ops: Record<string, Op>;
  queue: Card[];
  scheduled: ScheduledEvent[];
  changesLeft: number;
  rivalChangesLeft: number;
  nextCardId: number;
  /** Stories for next month's Morning Edition. */
  news: NewsItem[];
  /** Short log lines for the ticker during the watch phase. */
  log: { day: number; text: string; family: FamilyId | null }[];
}

export interface NewsItem {
  headline: string;
  body: string;
  /** Lead story gets the big type. */
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

export interface GameState {
  seed: number;
  rng: number;
  /** 0-based month of the run (0 = January 1927). */
  month: number;
  lastMonth: number;
  width: number;
  height: number;
  /** Each family's headquarters business id. */
  hqs: Record<FamilyId, string>;
  businesses: Business[];
  lts: Lieutenant[];
  families: Record<FamilyId, Family>;
  /** The Morning Edition for the coming month. */
  news: NewsItem[];
  wire: WireItem[];
  run: MonthRun | null;
  over: GameOver | null;
}
