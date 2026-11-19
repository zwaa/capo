import { describe, expect, it } from 'vitest';
import { autoplay } from '../scripts/autoplay';
import { bossAction, canAct, changePlans, createGame, reach, startMonth, stepDay } from '../src/sim/engine';
import { LT_CAP, lts, owned } from '../src/sim/util';

describe('determinism', () => {
  it('same seed and same choices give the same game', () => {
    for (const seed of [1, 7, 42]) {
      expect(JSON.stringify(autoplay(seed))).toBe(JSON.stringify(autoplay(seed)));
    }
  });

  it('different seeds give different cities', () => {
    const a = createGame(1).businesses.map((b) => `${b.x},${b.y}`).join();
    const b = createGame(2).businesses.map((b) => `${b.x},${b.y}`).join();
    expect(a).not.toBe(b);
  });
});

describe('a full run', () => {
  it('always ends by the last month, with consistent state', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = autoplay(seed, false, seed % 2 === 0);
      expect(s.over, `seed ${seed}`).not.toBeNull();
      expect(s.month).toBeLessThanOrEqual(s.lastMonth + 1);
      for (const b of s.businesses) {
        if (b.racket) expect(b.owner).not.toBeNull();
      }
      for (const l of s.lts) {
        expect(l.loyalty).toBeGreaterThanOrEqual(0);
        expect(l.loyalty).toBeLessThanOrEqual(100);
        expect(l.crew).toBeGreaterThanOrEqual(0);
      }
      expect(lts(s, 'player').length).toBeLessThanOrEqual(LT_CAP);
    }
  });
});

describe('change of plans', () => {
  it('reaches a lieutenant by telephone at once and by runner later', () => {
    const s = createGame(3);
    startMonth(s);
    const atHq = lts(s, 'player').find((l) => reach(s, l.id).kind === 'phone');
    expect(atHq).toBeDefined();
    // Walk a few days so somebody leaves the café.
    for (let i = 0; i < 4; i++) if (stepDay(s) === 'card') s.run!.queue = [];
    const runner = lts(s, 'player').find((l) => reach(s, l.id).kind === 'runner');
    if (runner) {
      const r = reach(s, runner.id);
      changePlans(s, { [runner.id]: { goal: 'lielow', target: null, posture: 'quiet' } });
      expect(s.run!.ops[runner.id].pending?.arriveDay).toBe(s.run!.day + r.days);
      expect(s.families.player.actionDebt).toBe(1);
    }
  });

  it('is limited per month', () => {
    const s = createGame(4);
    startMonth(s);
    changePlans(s, {});
    changePlans(s, {});
    expect(changePlans(s, {})).toEqual(['No changes left this month.']);
  });
});

describe('boss actions', () => {
  it('spends meetings and cash', () => {
    const s = createGame(5);
    const shop = owned(s, 'player').find((b) => !b.telephone)!;
    const cash = s.families.player.cash;
    expect(canAct(s, { kind: 'phone', biz: shop.id })).toBeNull();
    bossAction(s, { kind: 'phone', biz: shop.id });
    expect(shop.telephone).toBe(true);
    expect(s.families.player.cash).toBeLessThan(cash);
    expect(s.families.player.actions).toBe(1);
  });
});
