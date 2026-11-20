// "Learning the business": the first run, with lessons switched on.
// Each lesson starts when you reach it and ends on progress, not on the
// calendar. Several hand you a lieutenant to take that part of the work over.

import { POOL, blankJob } from './setup';
import type { GameState } from './types';
import { bossOf, dist, isHome, lieutenants, members, owned, protectedBy, protectedShops, rackets } from './util';

export interface Lesson {
  id: string;
  title: string;
  body: string;
  goal: string;
  done: (s: GameState) => boolean;
  start?: (s: GameState) => void;
  finish?: (s: GameState) => void;
}

/** Offer a lieutenant from the pool, once. */
function offer(s: GameState, i: number): void {
  const taken = s.people.some((p) => p.name === POOL[i].name) || s.hoods.some((h) => h.name === POOL[i].name);
  if (!s.candidates.includes(i) && !taken) s.candidates.push(i);
}

const hasJob = (s: GameState, kind: string) => members(s, 'player').some((p) => p.jobs.some((j) => j.kind === kind));

export const LESSONS: Lesson[] = [
  {
    id: 'street',
    title: 'Work the street',
    body: 'You have your cousins Vito and Carlo, two pistols and $300. Start where everyone starts: protection. Your list already has **Collect protection** and one **Sign up a shop** job. Add more sign-ups for the shops near your room: **click a shop on the map** and choose an order. Homes pay too, a little: click one to **sign up the whole block**, door to door. Each job takes whoever suits it best: Carlo can talk, Vito can lean. Every shop that signs up pays each month, as long as someone goes round to collect.',
    goal: 'Get 4 shops paying protection',
    done: (s) => protectedShops(s, 'player').length >= 4,
    start: (s) => {
      const boss = bossOf(s, 'player');
      if (boss.jobs.length) return;
      boss.jobs.push(blankJob(`j${s.nextId++}`, 'collect'));
      const near = s.buildings.filter((b) => !isHome(b) && !b.owner && !b.protectedBy).sort((a, b) => dist(a, boss) - dist(b, boss))[0];
      if (near) boss.jobs.push(blankJob(`j${s.nextId++}`, 'signup', near.id));
    },
    finish: (s) => offer(s, 0),
  },
  {
    id: 'delegate',
    title: 'Hand over the street',
    body: "Sal Benedetto, who collected for your uncle, is asking for work: **take him on**. You can't run everything yourself, and lieutenants come from your own crew. A hood with enough experience can be **promoted** (one meeting). Sal already has it; your cousins will, after a few months' work. Promote someone, give them **Protection** under **Who runs what**, and move a hood or two into their crew. Your jobs go with the branch.",
    goal: 'Promote a hood and give them Protection',
    done: (s) => s.families.player.branches.protection !== s.families.player.bossId,
  },
  {
    id: 'property',
    title: 'Buy a building',
    body: "Protection money isn't something you own. Buildings are. Add **Buy a building** (Acquisitions). It's cheaper if the shop already pays you. Pick one whose front suits a racket: a café or bakery for a speakeasy, a barber or cigar store for gambling, a laundry or garage for a still.",
    goal: 'Own a building',
    done: (s) => owned(s, 'player').length >= 1,
  },
  {
    id: 'vice',
    title: 'Open a back room',
    body: '**Fit out a back room** (Fronts) for $300. The front decides the racket. Then add **Run the speakeasies** or **Run the gambling** with a hood for each. Bars pour 15 cases a month: buy it on the open market, or build a still and a supply run.',
    goal: 'Open your first racket',
    done: (s) => rackets(s, 'player').length >= 1,
    finish: (s) => offer(s, 1),
  },
  {
    id: 'trouble',
    title: 'Calloway notices',
    body: "Rosa Marchetti, who knows every bar in the ward, wants in. Take her on; with her charm she'd run the speakeasies well once you promote her. And Big Jim Calloway has noticed you. Expect his men on your shops. **Guard** what matters (Enforcement), put a **telephone** where your people work (Fronts), and when the clock stops for bad news, use a **Change of Plans**.",
    goal: 'Survive a fight, or make a Change of Plans',
    done: (s) => s.stats.fights >= 1 || s.stats.changes >= 1,
    start: (s) => notice(s),
  },
  {
    id: 'fixing',
    title: 'Fix the police',
    body: 'Heat brings raids, and raids shut rackets and catch people. Add **Pay the captain** under **The Police**. Mickey Doyle, an ex-precinct clerk who knows which captain takes what, wants in: take him on, and promote him if you want someone else to run it.',
    goal: 'Put the captain on the payroll',
    done: (s) => hasJob(s, 'payoff'),
    start: (s) => offer(s, 2),
  },
  {
    id: 'specialists',
    title: 'Hire a specialist',
    body: "Specialists look after the family's resources: a **recruiter** for hoods, an **armourer** for guns, a **mechanic** for cars, a **lawyer** for when someone's inside. You can always buy on the open market without one; they make it cheaper or safer. Hire one in **Meetings**.",
    goal: 'Hire a specialist',
    done: (s) => s.families.player.specialists.length >= 1,
  },
  {
    id: 'ambition',
    title: 'Ambition',
    body: 'The more you give a lieutenant, the more they want. When one makes a demand you can grant it with a meeting, sweeten them with an envelope, or let it ride and watch the Wire for signs. Lessons are over after this one. The rest of 1927 is yours.',
    goal: 'Deal with a demand',
    done: (s) => s.stats.demandsSeen >= 1 && !lieutenants(s, 'player').some((l) => l.demand),
  },
];

export function notice(s: GameState): void {
  const r = s.families.rival;
  if (r.notice) return;
  r.notice = true;
  const item = {
    headline: 'CALLOWAY ASKS AFTER "THE NEPHEW"',
    body: `Freight man Jim Calloway, asked about the new faces collecting on the west side, said he would "like to meet ${bossOf(s, 'player').name}, to welcome him." Two of his drivers were seen pricing baseball bats.`,
    weight: 9,
  };
  if (s.run) s.run.news.push(item);
  else s.news.unshift(item);
}

export function currentLesson(s: GameState): Lesson | null {
  return s.lessons.on ? (LESSONS[s.lessons.index] ?? null) : null;
}

/** Check progress; may finish several lessons at once. Safe to call any time. */
export function advanceLessons(s: GameState): void {
  if (!s.lessons.on) {
    const size = owned(s, 'player').length + protectedBy(s, 'player').length;
    if (size >= 6 || s.month >= 5) notice(s);
    return;
  }
  if (s.month >= 6) notice(s);
  for (let guard = 0; guard < LESSONS.length; guard++) {
    const l = LESSONS[s.lessons.index];
    if (!l) return;
    if (!l.done(s)) {
      l.start?.(s);
      return;
    }
    l.finish?.(s);
    s.lessons.index++;
    LESSONS[s.lessons.index]?.start?.(s);
  }
}
