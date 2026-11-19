import type { Business, FamilyId, GameState, Lieutenant, Order } from './types';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS_IN_MONTH = 30;

export function monthName(m: number): string {
  return `${MONTHS[m % 12]} ${1927 + Math.floor(m / 12)}`;
}

export function other(f: FamilyId): FamilyId {
  return f === 'player' ? 'rival' : 'player';
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function biz(s: GameState, id: string | null): Business | undefined {
  return id ? s.businesses.find((b) => b.id === id) : undefined;
}

export function ltById(s: GameState, id: string | null): Lieutenant | undefined {
  return id ? s.lts.find((l) => l.id === id) : undefined;
}

export function lts(s: GameState, f: FamilyId): Lieutenant[] {
  return s.lts.filter((l) => l.family === f && l.status !== 'dead' && l.status !== 'defected');
}

export function activeLts(s: GameState, f: FamilyId): Lieutenant[] {
  return s.lts.filter((l) => l.family === f && l.status === 'active');
}

export function owned(s: GameState, f: FamilyId): Business[] {
  return s.businesses.filter((b) => b.owner === f);
}

export function label(l: Lieutenant): string {
  return `${l.name.split(' ')[0]} "${l.nickname}" ${l.name.split(' ').slice(1).join(' ')}`;
}

export function first(l: Lieutenant): string {
  return l.name.split(' ')[0];
}

/** Headquarters, falling back to any owned business if it was lost. */
export function hqOf(s: GameState, f: FamilyId): Business | undefined {
  const hq = biz(s, s.hqs[f]);
  if (hq && hq.owner === f) return hq;
  return owned(s, f)[0] ?? hq;
}

/** Is a lieutenant visible to the player (fog of war)? */
export function visibleToPlayer(s: GameState, l: Lieutenant): boolean {
  if (l.family === 'player') return true;
  if (l.status !== 'active') return false;
  if (owned(s, 'player').some((b) => dist(b, l) <= 2)) return true;
  return activeLts(s, 'player').some((p) => dist(p, l) <= 2);
}

export function validTargets(s: GameState, l: Lieutenant, goal: Order['goal']): { id: string; label: string }[] {
  const f = l.family;
  const foe = other(f);
  const bl = (b: Business) => ({ id: b.id, label: b.name });
  switch (goal) {
    case 'expand':
      return s.businesses.filter((b) => b.owner !== f).map(bl);
    case 'earn':
    case 'hold':
      return owned(s, f).map(bl);
    case 'hit':
      return [
        ...activeLts(s, foe)
          .filter((r) => f !== 'player' || visibleToPlayer(s, r))
          .map((r) => ({ id: r.id, label: `${label(r)} (lieutenant)` })),
        ...owned(s, foe).filter((b) => b.racket).map((b) => ({ id: b.id, label: `${b.name} (wreck the ${b.racket})` })),
      ];
    default:
      return [];
  }
}

export function needsTarget(goal: Order['goal']): boolean {
  return goal === 'expand' || goal === 'earn' || goal === 'hold' || goal === 'hit';
}

export const RACKET_INCOME: Record<string, number> = { speakeasy: 500, gambling: 400, still: 250 };
export const RACKET_COST = 400;
export const WAGE = 40;
export const PHONE_COST = 150;
export const PHONE_UPKEEP = 15;
export const CAPTAIN_COST = 250;
export const REWARD_COST = 300;
export const HIRE_COST = 600;
export const LT_CAP = 6;
