import { describe, expect, it } from 'vitest';
import { autoplay } from '../scripts/autoplay';
import { planFamily } from '../src/sim/ai';
import {
  addJob,
  allocate,
  assignBranch,
  bossAction,
  canAct,
  changePlans,
  createGame,
  draftJob,
  endMonth,
  fireHood,
  forecast,
  hireHood,
  moveHood,
  moveJob,
  needFor,
  OFF_TURF_DAYS,
  ordersFor,
  purchase,
  reach,
  startMonth,
  stepDay,
} from '../src/sim/engine';
import { LESSONS } from '../src/sim/lessons';
import { blankJob, isLot } from '../src/sim/setup';
import type { GameState } from '../src/sim/types';
import {
  BRANCHES,
  LT_CAP,
  PROMOTE_XP,
  blockBuildings,
  blockId,
  bossOf,
  branchesOf,
  crewOf,
  crewSize,
  dist,
  gunHands,
  totalHoods,
  lieutenants,
  onTurf,
  targets,
  turfAt,
} from '../src/sim/util';

/** Take Sal on (as the first lesson would) and promote him. */
function salAsLieutenant(s: GameState) {
  s.candidates.push(0);
  bossAction(s, { kind: 'enlist', pool: 0 });
  const sal = s.hoods.find((h) => h.name === 'Sal Benedetto')!;
  bossAction(s, { kind: 'promote', hood: sal.id });
  return lieutenants(s, 'player')[0];
}

describe('determinism', () => {
  it('same seed and same choices give the same game', () => {
    for (const seed of [1, 7, 42]) expect(JSON.stringify(autoplay(seed))).toBe(JSON.stringify(autoplay(seed)));
  });
  it('different seeds give different cities and different hoods for hire', () => {
    const at = (n: number) =>
      createGame(n)
        .buildings.map((b) => `${b.x},${b.y}`)
        .join();
    expect(at(1)).not.toBe(at(2));
    expect(
      createGame(1)
        .market.map((h) => h.name)
        .join(),
    ).not.toBe(
      createGame(2)
        .market.map((h) => h.name)
        .join(),
    );
  });
});

describe('starting from nothing', () => {
  it('starts with the boss, two named cousins, no lieutenants and no property', () => {
    const s = createGame(3);
    const boss = bossOf(s, 'player');
    expect(crewOf(s, boss).map((h) => h.name)).toEqual(['Vito Russo', 'Carlo Russo']);
    expect(lieutenants(s, 'player')).toHaveLength(0);
    expect(s.buildings.some((b) => b.owner === 'player' || b.protectedBy === 'player')).toBe(false);
    for (const b of BRANCHES) expect(s.families.player.branches[b.id]).toBe(boss.id);
    expect(s.market.length).toBeGreaterThanOrEqual(3);
  });
  it('the first lesson seeds a collect job and a sign-up', () => {
    const s = createGame(3);
    expect(bossOf(s, 'player').jobs.map((j) => j.kind)).toEqual(['collect', 'signup']);
  });
});

describe('jobs and squads', () => {
  it('hands out hands from the top of the list down', () => {
    const s = createGame(4);
    const boss = bossOf(s, 'player');
    const free = targets(s, 'player', 'signup').map((t) => t.id);
    addJob(s, boss.id, 'signup', free[1]);
    addJob(s, boss.id, 'signup', free[2]);
    addJob(s, boss.id, 'signup', free[3]);
    allocate(s, 'player');
    // Two cousins plus the boss himself: three sign-ups run, the fourth stalls.
    const ups = boss.jobs.filter((j) => j.kind === 'signup');
    expect(ups.slice(0, 3).every((j) => j.hoods === 1)).toBe(true);
    expect(ups[3].stalled).toBeTruthy();
    for (let i = 0; i < 4; i++) moveJob(s, boss.id, ups[3].id, -1);
    expect(boss.jobs[0].id).toBe(ups[3].id);
    expect(boss.jobs[0].hoods).toBe(1);
  });
  it('each job takes whoever suits it best', () => {
    const s = createGame(4);
    const boss = bossOf(s, 'player');
    // Sign-ups run on charm: Carlo (6) talks better than the boss (5) or Vito (3).
    const top = boss.jobs.find((j) => j.kind === 'signup')!;
    const carlo = s.hoods.find((h) => h.name === 'Carlo Russo')!;
    expect(top.squad).toEqual([carlo.id]);
  });
  it('being in debt stalls only the jobs that cost money', () => {
    const s = createGame(4);
    const boss = bossOf(s, 'player');
    const shop = targets(s, 'player', 'signup')[0];
    s.buildings.find((b) => b.id === shop.id)!.protectedBy = 'player';
    s.families.player.cash = -200;
    addJob(s, boss.id, 'buy', targets(s, 'player', 'buy')[0].id);
    allocate(s, 'player');
    const collect = boss.jobs.find((j) => j.kind === 'collect')!;
    const buy = boss.jobs.find((j) => j.kind === 'buy')!;
    expect(collect.stalled).toBeNull();
    expect(collect.hoods).toBe(1);
    expect(buy.stalled).toMatch(/Needs \$/);
  });
  it('jobs needing a car stall without one', () => {
    const s = createGame(5);
    s.families.player.cash = 5000;
    const boss = bossOf(s, 'player');
    const victim = targets(s, 'player', 'takeover')[0];
    for (const h of [...s.market]) hireHood(s, 'player', h.id);
    const j = addJob(s, boss.id, 'takeover', victim.id)!;
    expect(j.stalled).toBe('No car');
    purchase(s, 'player', 'car');
    expect(j.stalled).toBeNull();
    expect(j.squad).toHaveLength(4);
  });
});

describe('orders from the map', () => {
  it('offers the orders that fit a target, to whoever runs the branch', () => {
    const s = createGame(13);
    const free = s.buildings.find((b) => !b.owner && !b.protectedBy)!;
    const kinds = ordersFor(s, free.id).map((o) => o.kind);
    expect(kinds).toContain('signup');
    expect(kinds).toContain('buy');
    expect(kinds).not.toContain('takeover');
    for (const o of ordersFor(s, free.id)) expect(o.runner).toBe(bossOf(s, 'player').id);
    const theirs = s.buildings.find((b) => b.owner === 'rival')!;
    expect(ordersFor(s, theirs.id).map((o) => o.kind)).toContain('takeover');
  });
  it('shows an order as queued once it is on a list', () => {
    const s = createGame(13);
    const free = s.buildings.find((b) => !b.owner && !b.protectedBy && !bossOf(s, 'player').jobs.some((j) => j.target === b.id))!;
    const buy = ordersFor(s, free.id).find((o) => o.kind === 'buy')!;
    expect(buy.queued).toBeNull();
    const j = addJob(s, buy.runner, 'buy', free.id)!;
    expect(ordersFor(s, free.id).find((o) => o.kind === 'buy')!.queued).toEqual({ person: buy.runner, job: j.id });
  });
});

describe('turf', () => {
  it('starts at the boss’s door and grows with every shop held', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    expect(onTurf(s, 'player', { x: boss.homeX, y: boss.homeY })).toBe(true);
    expect(turfAt(s, boss.homeX, boss.homeY)).toBe('player');
    const far = s.buildings.filter((b) => !b.owner && !b.protectedBy).sort((a, b) => b.x - a.x)[0];
    expect(onTurf(s, 'player', far, far.id)).toBe(false);
    far.protectedBy = 'player';
    const next = { x: far.x, y: far.y + (far.y % 3 === 1 ? 1 : -1) };
    expect(onTurf(s, 'player', next)).toBe(true);
  });
  it('draws turf only on what a family holds, not the lots next to it', () => {
    const s = createGame(14);
    const free = s.buildings.filter((b) => !b.owner && !b.protectedBy && b.x > 4);
    const ours = free[0];
    ours.protectedBy = 'player';
    expect(turfAt(s, ours.x, ours.y)).toBe('player');
    const next = free.find((b) => dist(b, ours) === 1)!;
    expect(turfAt(s, next.x, next.y)).toBeNull();
  });
  it('makes sign-ups off our turf take longer', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    const far = s.buildings.filter((b) => !b.owner && !b.protectedBy).sort((a, b) => b.x - a.x)[0];
    boss.jobs = [];
    addJob(s, boss.id, 'signup', far.id);
    startMonth(s);
    const offTurf = boss.jobs[0].days;
    s.run = null;
    far.protectedBy = null;
    s.buildings.find((b) => b.id !== far.id && !b.owner && dist(b, far) <= 2)!.protectedBy = 'player';
    startMonth(s);
    expect(offTurf - boss.jobs[0].days).toBe(OFF_TURF_DAYS);
  });
});

describe('homes and blocks', () => {
  it('fills every lot that is not a shop with a home, and homes are not for sale', () => {
    const s = createGame(14);
    let lots = 0;
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (isLot(x, y)) lots++;
    expect(s.buildings.length).toBe(lots);
    const homes = s.buildings.filter((b) => b.kind === 'home');
    expect(homes.length).toBeGreaterThan(10);
    expect(homes.every((b) => b.protection < 50)).toBe(true);
    const buyable = new Set(targets(s, 'player', 'buy').map((t) => t.id));
    expect(homes.some((b) => buyable.has(b.id))).toBe(false);
    // Calloway already collects on his own doorstep.
    expect(homes.some((b) => b.protectedBy === 'rival')).toBe(true);
  });
  it('records what each place paid at month end, and nothing for doors nobody collected', () => {
    const s = createGame(14);
    s.lessons.on = false; // the first lesson would put the collect job back
    const boss = bossOf(s, 'player');
    boss.jobs = [];
    const free = s.buildings.filter((b) => b.kind === 'shop' && !b.owner && !b.protectedBy);
    const [paid, front] = free;
    paid.protectedBy = 'player';
    front.owner = 'player';
    addJob(s, boss.id, 'collect', null);
    startMonth(s);
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    endMonth(s);
    expect(paid.took).toBe(paid.protection);
    expect(front.took).toBe(50);
    // Same door, nobody collecting next month: it pays nothing.
    boss.jobs = [];
    startMonth(s);
    n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    endMonth(s);
    expect(paid.protectedBy).toBe('player');
    expect(paid.took).toBe(0);
    expect(s.buildings.filter((b) => !b.owner && !b.protectedBy).every((b) => b.took === 0)).toBe(true);
  });
  it('a pair of hands collects from ten homes, or five shops', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    boss.jobs = [];
    const collect = addJob(s, boss.id, 'collect', null)!;
    const free = s.buildings.filter((b) => !b.owner && !b.protectedBy);
    for (const b of free.filter((b) => b.kind === 'home').slice(0, 10)) b.protectedBy = 'player';
    expect(needFor(s, 'player', collect, boss)).toBe(1);
    for (const b of free.filter((b) => b.kind === 'shop').slice(0, 5)) b.protectedBy = 'player';
    expect(needFor(s, 'player', collect, boss)).toBe(2);
  });
  it('offers to sign up the block around any building', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    const blk = blockId({ x: boss.homeX, y: boss.homeY });
    expect(ordersFor(s, blk).map((o) => o.kind)).toEqual(['block']);
  });
  it('a block sign-up goes door to door through the block', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    const blk = blockId({ x: boss.homeX, y: boss.homeY });
    boss.jobs = [];
    addJob(s, boss.id, 'block', blk, 'loud');
    startMonth(s);
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    const ours = blockBuildings(s, blk).filter((b) => b.protectedBy === 'player');
    expect(ours.length).toBeGreaterThanOrEqual(3);
  });
});

describe('managing the crew', () => {
  it('a demoted lieutenant goes back to the street, and his branches and crew come home', () => {
    const s = createGame(14);
    const sal = salAsLieutenant(s);
    assignBranch(s, 'player', 'protection', sal.id);
    const cousin = crewOf(s, bossOf(s, 'player'))[0];
    moveHood(s, cousin.id, sal.id);
    s.families.player.actions = 2;
    bossAction(s, { kind: 'demote', lt: sal.id });
    expect(lieutenants(s, 'player')).toHaveLength(0);
    const boss = bossOf(s, 'player');
    expect(s.families.player.branches.protection).toBe(boss.id);
    expect(boss.jobs.some((j) => j.kind === 'collect')).toBe(true);
    const back = s.hoods.find((h) => h.name === 'Sal Benedetto')!;
    expect(back.under).toBe(boss.id);
    expect(back.xp).toBe(PROMOTE_XP);
    expect(back.loyalty).toBeLessThan(sal.loyalty);
    expect(cousin.under).toBe(boss.id);
  });
  it('lets a hood go; one with loose lips talks', () => {
    const s = createGame(14);
    const h = crewOf(s, bossOf(s, 'player'))[0];
    h.traits = ['looselips'];
    const heat = s.families.player.heat;
    expect(fireHood(s, 'player', h.id)).toBeNull();
    expect(s.hoods.includes(h)).toBe(false);
    expect(s.families.player.heat).toBeGreaterThan(heat);
  });
  it('hands freed by a finished job pick up the next one waiting', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    boss.jobs = [];
    const near = s.buildings
      .filter((b) => b.kind === 'home' && !b.owner && !b.protectedBy)
      .sort((a, b) => dist(a, { x: boss.homeX, y: boss.homeY }) - dist(b, { x: boss.homeX, y: boss.homeY }));
    // Three hands, four one-hand jobs: the last waits for someone to finish.
    const jobs = near.slice(0, 4).map((b) => addJob(s, boss.id, 'signup', b.id, 'loud')!);
    const last = jobs[3];
    expect(last.stalled).toBeTruthy();
    const plan = forecast(s, boss).jobs[last.id];
    expect(plan.start).toBeGreaterThan(1);
    startMonth(s);
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    expect(last.done || last.progress > 0).toBe(true);
  });
});

describe('standing orders for idle hoods', () => {
  it('idle hoods on patrol pile in when someone leans on a door nearby: fists, nobody dies', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    boss.jobs = [];
    boss.idle = 'patrol';
    const home = { x: boss.homeX, y: boss.homeY };
    const shop = s.buildings.filter((b) => !b.owner && !b.protectedBy && dist(b, home) <= 2)[0];
    shop.protectedBy = 'player';
    const dutch = s.people.find((p) => p.id === 'dutch')!;
    dutch.jobs = [blankJob('jx', 'signup', shop.id, 'loud')];
    s.families.rival.notice = true;
    allocate(s, 'rival');
    startMonth(s);
    let fightCards = 0;
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) {
      fightCards += s.run!.queue.filter((c) => c.kind === 'fight').length;
      s.run!.queue = [];
    }
    expect(s.run!.log.some((l) => /scuffle|saw off/.test(l.text) && l.text.includes(shop.name))).toBe(true);
    expect(fightCards).toBe(0);
    expect(s.hoods.filter((h) => h.status === 'dead')).toHaveLength(0);
    expect(s.people.filter((p) => p.status === 'dead')).toHaveLength(0);
  });
  it('drumming up business signs up homes next to our turf, and leaves nothing on the list', () => {
    const s = createGame(14);
    const boss = bossOf(s, 'player');
    boss.jobs = [];
    boss.idle = 'canvass';
    startMonth(s);
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    const ours = s.buildings.filter((b) => b.protectedBy === 'player');
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.every((b) => b.kind === 'home')).toBe(true);
    endMonth(s);
    expect(boss.jobs.some((j) => j.auto)).toBe(false);
  });
});

describe('a slow burn', () => {
  it('Calloway only reaches for takeovers after real violence against him', () => {
    const s = createGame(14);
    const ours = s.buildings.find((b) => !b.owner && !b.protectedBy && b.kind === 'shop')!;
    ours.owner = 'player';
    s.families.rival.notice = true;
    s.families.rival.cash = 9000;
    s.month = 8;
    const takeovers = () =>
      s.people
        .filter((p) => p.family === 'rival')
        .flatMap((p) => p.jobs)
        .filter((j) => j.kind === 'takeover').length;
    for (let i = 0; i < 20; i++) planFamily(s, 'rival');
    expect(takeovers()).toBe(0);
    for (let i = 0; i < 20 && !takeovers(); i++) {
      s.families.rival.provoked = 3;
      planFamily(s, 'rival');
    }
    expect(takeovers()).toBeGreaterThan(0);
  });
});

describe('guns', () => {
  it('lieutenants need pistols too, not just their hoods', () => {
    const s = createGame(14);
    const before = gunHands(s, 'player');
    expect(before).toBe(totalHoods(s, 'player'));
    salAsLieutenant(s);
    // Sal was a hood and is now a lieutenant: he still needs his pistol.
    expect(gunHands(s, 'player')).toBe(before + 1);
    expect(totalHoods(s, 'player')).toBe(before);
  });
});

describe('the hiring hall', () => {
  it('hires a named hood into the boss crew', () => {
    const s = createGame(12);
    s.families.player.cash = 1000;
    const pickd = s.market[0];
    expect(hireHood(s, 'player', pickd.id)).toBeNull();
    expect(crewOf(s, bossOf(s, 'player')).some((h) => h.id === pickd.id)).toBe(true);
    expect(s.market.some((h) => h.id === pickd.id)).toBe(false);
  });
});

describe('promotion and branches', () => {
  it('only hoods with enough experience can be promoted', () => {
    const s = createGame(6);
    const vito = s.hoods.find((h) => h.name === 'Vito Russo')!;
    expect(canAct(s, { kind: 'promote', hood: vito.id })).toMatch(/experience/);
    vito.xp = PROMOTE_XP;
    expect(canAct(s, { kind: 'promote', hood: vito.id })).toBeNull();
  });
  it('a promoted hood becomes a lieutenant with the same stats and traits', () => {
    const s = createGame(6);
    const sal = salAsLieutenant(s);
    expect(sal.name).toBe('Sal Benedetto');
    expect(sal.muscle).toBe(7);
    expect(sal.traits).toEqual(['hothead', 'greedy']);
    expect(s.hoods.some((h) => h.name === 'Sal Benedetto')).toBe(false);
    expect(s.families.player.actions).toBe(1);
  });
  it('handing a branch over moves its jobs, and hoods can follow', () => {
    const s = createGame(6);
    const sal = salAsLieutenant(s);
    assignBranch(s, 'player', 'protection', sal.id);
    expect(sal.jobs.map((j) => j.kind)).toEqual(['collect', 'signup']);
    expect(bossOf(s, 'player').jobs).toHaveLength(0);
    moveHood(s, s.hoods.find((h) => h.name === 'Vito Russo')!.id, sal.id);
    expect(crewSize(s, sal)).toBe(1);
  });
  it('a lieutenant runs at most three branches', () => {
    const s = createGame(6);
    const sal = salAsLieutenant(s);
    for (const b of ['protection', 'enforcement', 'fronts', 'police'] as const) assignBranch(s, 'player', b, sal.id);
    expect(branchesOf(s, sal)).toHaveLength(3);
  });
  it('caps the family at six lieutenants', () => {
    const s = createGame(8);
    s.families.player.cash = 99999;
    for (let i = 0; i < 8; i++) {
      hireHood(s, 'player', s.market[0]?.id);
      const h = s.hoods.filter((x) => x.family === 'player').at(-1)!;
      h.xp = PROMOTE_XP;
      s.families.player.actions = 5;
      bossAction(s, { kind: 'promote', hood: h.id });
      s.market.push(
        ...createGame(100 + i)
          .market.slice(0, 1)
          .map((m) => ({ ...m, id: `x${i}` })),
      );
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
      for (const p of s.people) expect(p.loyalty).toBeGreaterThanOrEqual(0);
      for (const h of s.hoods) {
        expect(h.status).not.toBe('dead');
        const boss = s.people.find((p) => p.id === h.under);
        expect(boss, `${h.name} works for someone`).toBeDefined();
        expect(boss!.family).toBe(h.family);
      }
      expect(lieutenants(s, 'player').length).toBeLessThanOrEqual(LT_CAP);
      expect(s.lessons.index).toBeLessThanOrEqual(LESSONS.length);
    }
  });
  it('hoods gain experience by working', () => {
    const s = autoplay(3);
    const veterans = s.hoods.filter((h) => h.family === 'player' && h.xp >= PROMOTE_XP);
    expect(veterans.length + lieutenants(s, 'player').length).toBeGreaterThan(0);
  });
  it('runs a month day by day to the end', () => {
    const s = createGame(11);
    startMonth(s);
    let n = 0;
    while (stepDay(s) !== 'done' && n++ < 100) if (s.run!.queue.length) s.run!.queue = [];
    expect(s.run!.day).toBe(30);
  });
});
