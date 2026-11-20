// Headless balance check: an AI plays the Russo side over many seeds.
// Usage: npm run sim -- [games]   (CAPO_RANDOM=1 answers cards at random,
// CAPO_NOLESSONS=1 plays without the tutorial lessons)
import { planFamily } from '../src/sim/ai';
import { answer, assignBranch, bossAction, canAct, createGame, endMonth, startMonth, stepDay, transferHoods } from '../src/sim/engine';
import { rand } from '../src/sim/rng';
import type { Branch, GameState } from '../src/sim/types';
import { PROMOTE_XP, bossOf, crewSize, lieutenants, owned, protectedBy, rackets, totalHoods } from '../src/sim/util';

const PLAN: Branch[][] = [
  ['protection', 'enforcement'],
  ['speakeasies', 'gambling', 'bootlegging'],
  ['police', 'acquisitions', 'fronts'],
];

function manage(s: GameState): void {
  const fam = s.families.player;
  for (const c of [...s.candidates]) bossAction(s, { kind: 'enlist', pool: c });
  // Promote the most capable hood who has earned it, up to three lieutenants.
  if (lieutenants(s, 'player').length < 3) {
    const best = s.hoods
      .filter((h) => h.family === 'player' && h.status === 'active' && h.xp >= PROMOTE_XP)
      .sort((a, b) => b.muscle + b.brains + b.nerve + b.charm - (a.muscle + a.brains + a.nerve + a.charm))[0];
    if (best && crewSize(s, bossOf(s, 'player')) >= 3) bossAction(s, { kind: 'promote', hood: best.id });
  }
  lieutenants(s, 'player').forEach((l, i) => {
    // Someone inside or laid up can't run anything: the boss covers.
    for (const b of PLAN[i] ?? []) assignBranch(s, 'player', b, l.status === 'active' ? l.id : fam.bossId);
  });
  for (const k of ['recruiter', 'armourer', 'lawyer'] as const) {
    if (fam.cash > 1500 && canAct(s, { kind: 'specialist', which: k }) === null) bossAction(s, { kind: 'specialist', which: k });
  }
  for (const l of lieutenants(s, 'player')) {
    if (l.demand && canAct(s, { kind: 'grant', lt: l.id }) === null) bossAction(s, { kind: 'grant', lt: l.id });
  }
  planFamily(s, 'player');
  // Spread the boss's hoods to lieutenants who need them.
  const boss = bossOf(s, 'player');
  for (const l of lieutenants(s, 'player').filter((x) => x.status === 'active')) {
    const want = l.jobs.length * 2 - crewSize(s, l);
    const spare = crewSize(s, boss) - 1;
    if (want > 0 && spare > 0) transferHoods(s, boss.id, l.id, Math.min(want, spare));
  }
}

export function autoplay(seed: number, verbose = false, random = false, lessons = true): GameState {
  const s = createGame(seed, undefined, lessons);
  const pick = { rng: seed ^ 0x5eed };
  const prefs = ['leash', 'lean', 'bribe', 'steady', 'help', 'stand', 'accept', 'lose', 'carry', 'pay', 'buy'];
  for (let guard = 0; guard < 30 && !s.over; guard++) {
    manage(s);
    startMonth(s);
    for (;;) {
      const r = stepDay(s);
      if (r === 'done') break;
      if (r === 'card') {
        const c = s.run!.queue[0];
        const opts = c.options.filter((o) => !o.disabled && o.id !== 'replan');
        const o = random ? opts[Math.floor(rand(pick) * opts.length)] : (opts.find((x) => prefs.includes(x.id)) ?? opts[0]);
        answer(s, c.id, o.id);
      }
    }
    endMonth(s);
    if (verbose) {
      const p = s.families.player;
      const r = s.families.rival;
      console.log(
        `${String(s.month).padStart(2)} us $${p.cash} heat ${p.heat} own ${owned(s, 'player').length} prot ${protectedBy(s, 'player').length} rackets ${rackets(s, 'player').length} hoods ${totalHoods(s, 'player')} lts ${lieutenants(s, 'player').length} lesson ${s.lessons.index} | them $${r.cash} own ${owned(s, 'rival').length} prot ${protectedBy(s, 'rival').length} notice ${r.notice}`,
      );
      for (const n of s.news.slice(0, 2)) console.log('     *', n.headline);
    }
  }
  return s;
}

if (process.env.CAPO_AUTOPLAY) {
  const games = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200);
  const tally = { win: 0, loss: 0, draw: 0, none: 0 };
  let lessonsDone = 0;
  for (let i = 1; i <= games; i++) {
    const s = autoplay(i, games === 1, !!process.env.CAPO_RANDOM, !process.env.CAPO_NOLESSONS);
    tally[s.over?.result ?? 'none']++;
    lessonsDone += s.lessons.index;
    if (games === 1) console.log(s.over);
  }
  console.log(tally, { avgLessonsDone: (lessonsDone / games).toFixed(1) });
}
