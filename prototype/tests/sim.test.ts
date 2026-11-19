import { describe, expect, it } from 'vitest';
import { autoplay } from '../scripts/autoplay';
import { addJob, allocate, assignBranch, bossAction, changePlans, createGame, draftJob, moveJob, purchase, reach, startMonth, stepDay } from '../src/sim/engine';
import { LESSONS } from '../src/sim/lessons';
import { BRANCHES, LT_CAP, bossOf, branchesOf, lieutenants, targets } from '../src/sim/util';

describe('determinism', () => {
  it('same seed and same choices give the same game', () => {
    for (const seed of [1, 7, 42]) expect(JSON.stringify(autoplay(seed))).toBe(JSON.stringify(autoplay(seed)));
  });
  it('different seeds give different cities', () => {
    const at = (n: number) => createGame(n).buildings.map((b) => `${b.x},${b.y}`).join();
    expect(at(1)).not.toBe(at(2));
  });
});

describe('starting from nothing', () => {
  it('starts with the boss, two hoods, no lieutenants and no property', () => {
    const s = createGame(3);
    const boss = bossOf(s, 'player');
    expect(boss.crew).toBe(2);
    expect(lieutenants(s, 'player')).toHaveLength(0);
    expect(s.buildings.some((b) => b.owner === 'player' || b.protectedBy === 'player')).toBe(false);
    for (const b of BRANCHES) expect(s.families.player.branches[b.id]).toBe(boss.id);
  });
  it('the first lesson seeds a collect job and a sign-up', () => {
    const s = createGame(3);
    expect(bossOf(s, 'player').jobs.map((j) => j.kind)).toEqual(['collect', 'signup']);
  });
});

describe('jobs and priorities', () => {
  it('hands out hands from the top of the list down', () => {
    const s = createGame(4);
    const boss = bossOf(s, 'player');
    const free = targets(s, 'player', 'signup').map((t) => t.id);
    addJob(s, boss.id, 'signup', free[1]);
    addJob(s, boss.id, 'signup', free[2]);
    addJob(s, boss.id, 'signup', free[3]);
    allocate(s, 'player');
    // Crew of two plus the boss himself: three sign-ups run, the fourth stalls.
    const ups = boss.jobs.filter((j) => j.kind === 'signup');
    expect(ups.slice(0, 3).every((j) => j.hoods === 1)).toBe(true);
    expect(ups[3].stalled).toBeTruthy();
    // Move the stalled one to the top: now it runs and the old third stalls.
    moveJob(s, boss.id, ups[3].id, -1);
    moveJob(s, boss.id, ups[3].id, -1);
    moveJob(s, boss.id, ups[3].id, -1);
    moveJob(s, boss.id, ups[3].id, -1);
    expect(boss.jobs[0].id).toBe(ups[3].id);
    expect(boss.jobs[0].hoods).toBe(1);
  });
  it('jobs needing a car stall without one', () => {
    const s = createGame(5);
    s.families.player.cash = 5000;
    const boss = bossOf(s, 'player');
    const victim = targets(s, 'player', 'takeover')[0];
    for (let i = 0; i < 4; i++) purchase(s, 'player', 'hood');
    const j = addJob(s, boss.id, 'takeover', victim.id)!;
    expect(j.stalled).toBe('No car');
    purchase(s, 'player', 'car');
    expect(j.stalled).toBeNull();
  });
});

describe('lieutenants and branches', () => {
  it('handing a branch over moves its jobs', () => {
    const s = createGame(6);
    s.candidates.push(0);
    bossAction(s, { kind: 'hire', pool: 0 });
    const sal = lieutenants(s, 'player')[0];
    assignBranch(s, 'player', 'protection', sal.id);
    expect(sal.jobs.map((j) => j.kind)).toEqual(['collect', 'signup']);
    expect(bossOf(s, 'player').jobs).toHaveLength(0);
  });
  it('a lieutenant runs at most three branches', () => {
    const s = createGame(6);
    s.candidates.push(0);
    bossAction(s, { kind: 'hire', pool: 0 });
    const sal = lieutenants(s, 'player')[0];
    for (const b of ['protection', 'enforcement', 'fronts', 'police'] as const) assignBranch(s, 'player', b, sal.id);
    expect(branchesOf(s, sal)).toHaveLength(3);
  });
  it('caps the family at six lieutenants', () => {
    const s = createGame(8);
    s.families.player.cash = 99999;
    for (let i = 0; i < 8; i++) {
      s.families.player.actions = 5;
      bossAction(s, { kind: 'hire', pool: i });
    }
    expect(lieutenants(s, 'player').length).toBe(LT_CAP);
  });
});

describe('change of plans', () => {
  it('the boss changes at once; lieutenants by telephone or runner', () => {
    const s = createGame(9);
    startMonth(s);
    expect(reach(s, bossOf(s, 'player').id).kind).toBe('now');
    const boss = bossOf(s, 'player');
    changePlans(s, { [boss.id]: [draftJob(s, 'collect', null)] });
    expect(boss.jobs.map((j) => j.kind)).toEqual(['collect']);
    expect(s.families.player.actionDebt).toBe(1);
    expect(s.stats.changes).toBe(1);
  });
});

describe('a full year', () => {
  it('always ends, with consistent state', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = autoplay(seed, false, seed % 2 === 0, seed % 3 !== 0);
      expect(s.over, `seed ${seed}`).not.toBeNull();
      for (const b of s.buildings) {
        if (b.racket) expect(b.owner).not.toBeNull();
        if (b.owner) expect(b.protectedBy).toBeNull();
      }
      for (const p of s.people) {
        expect(p.crew).toBeGreaterThanOrEqual(0);
        expect(p.loyalty).toBeGreaterThanOrEqual(0);
      }
      expect(lieutenants(s, 'player').length).toBeLessThanOrEqual(LT_CAP);
      expect(s.lessons.index).toBeLessThanOrEqual(LESSONS.length);
    }
  });
  it('runs a month day by day to the end', () => {
    const s = createGame(11);
    startMonth(s);
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    expect(s.run!.day).toBe(30);
  });
});
