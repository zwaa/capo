// Headless balance check: the AI plays both sides over many seeds.
// Usage: npm run sim -- [games]
import { planFamily } from '../src/sim/ai';
import { aiChangePlans, answer, bossAction, canAct, changePlans, createGame, endMonth, startMonth, stepDay } from '../src/sim/engine';
import { biz } from '../src/sim/util';
import { rand } from '../src/sim/rng';
import type { GameState } from '../src/sim/types';
import { activeLts, owned } from '../src/sim/util';

export function autoplay(seed: number, verbose = false, random = false): GameState {
  const s = createGame(seed);
  const pick = { rng: seed ^ 0x5eed };
  for (let guard = 0; guard < 20 && !s.over; guard++) {
    if (!random) {
      // Use meetings the way a sensible player might.
      const fam = s.families.player;
      for (let k = 0; k < 3 && fam.actions > 0; k++) {
        const demander = s.lts.find((l) => l.family === 'player' && l.demand && canAct(s, { kind: 'grant', lt: l.id }) === null);
        if (demander) bossAction(s, { kind: 'grant', lt: demander.id });
        else if (fam.cash > 2000 && canAct(s, { kind: 'hire' }) === null) bossAction(s, { kind: 'hire' });
        else if (fam.heat > 35 && canAct(s, { kind: 'captain' }) === null) bossAction(s, { kind: 'captain' });
        else {
          const shop = owned(s, 'player').find((b) => !b.telephone);
          if (shop && canAct(s, { kind: 'phone', biz: shop.id }) === null) bossAction(s, { kind: 'phone', biz: shop.id });
          else break;
        }
      }
    }
    planFamily(s, 'player');
    startMonth(s);
    for (;;) {
      const r = stepDay(s);
      if (r === 'done') break;
      if (r === 'card') {
        const c = s.run!.queue[0];
        const opts = c.options.filter((o) => !o.disabled);
        // A sensible-but-unremarkable player: preferred answers, else random.
        const prefs = ['leash', 'lean', 'bribe', 'steady', 'help', 'stand', 'accept', 'lose', 'carry'];
        const o = random ? opts[Math.floor(rand(pick) * opts.length)] : opts.find((x) => prefs.includes(x.id)) ?? opts[0];
        answer(s, c.id, o.id);
        if (c.kind === 'emergency' && !random) {
          const where = s.businesses.find((b) => c.focus && b.x === c.focus.x && b.y === c.focus.y);
          aiChangePlans(s, 'player', biz(s, where?.id ?? null));
        }
        if (o.id === 'replan' && random) {
          const orders: Record<string, GameState['lts'][number]['order']> = {};
          for (const l of activeLts(s, 'player')) orders[l.id] = { ...l.order, posture: 'loud' };
          changePlans(s, orders);
        }
      }
    }
    if (verbose) {
      const p = s.families.player;
      const r = s.families.rival;
      console.log(
        `month ${s.month}: us $${p.cash} heat ${p.heat} shops ${owned(s, 'player').length} | them $${r.cash} heat ${r.heat} shops ${owned(s, 'rival').length}`,
      );
      for (const n of s.run?.news ?? []) console.log('   ', n.headline);
    }
    endMonth(s);
    if (verbose) for (const n of s.news) console.log('    *', n.headline);
  }
  return s;
}

if (process.env.CAPO_AUTOPLAY) {
  const games = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200);
  const tally = { win: 0, loss: 0, draw: 0, none: 0 };
  let shops = 0;
  let cash = 0;
  let dead = 0;
  for (let i = 1; i <= games; i++) {
    const s = autoplay(i, games === 1, !!process.env.CAPO_RANDOM);
    tally[s.over?.result ?? 'none']++;
    shops += owned(s, 'player').length;
    cash += s.families.player.cash;
    dead += s.lts.filter((l) => l.status === 'dead').length;
    if (games === 1) console.log(s.over);
  }
  console.log(tally, { avgShops: (shops / games).toFixed(1), avgCash: Math.round(cash / games), avgDeadLts: (dead / games).toFixed(1) });
}
