// The rival family. It uses exactly the same Order format as the player and
// is resolved by exactly the same engine. It only knows what is public plus
// what its own people can see.

import { chance } from './rng';
import type { GameState, Lieutenant, Order } from './types';
import { activeLts, dist, hqOf, other, owned } from './util';

export function planFamily(s: GameState, f: 'rival' | 'player'): void {
  const fam = s.families[f];
  const mine = activeLts(s, f);
  const taken = new Set<string>();
  const foe = other(f);
  let lyingLow = false;
  const hq = hqOf(s, f);

  for (const l of mine) {
    const o = choose(s, l);
    l.order = o;
    if (o.target) taken.add(o.target);
  }

  function choose(s: GameState, l: Lieutenant): Order {
    const loud = l.traits.includes('hothead') ? 'loud' : 'firm';
    if (fam.heat > 65 && !lyingLow && !l.traits.includes('hothead')) {
      lyingLow = true;
      return { goal: 'lielow', target: null, posture: 'quiet' };
    }
    if (l.crew < 3) return { goal: 'recruit', target: null, posture: 'quiet' };

    // Grudge: someone killed one of ours. Hit back at a lieutenant we can see.
    if (fam.grudge && chance(s, 0.7)) {
      const seen = activeLts(s, foe).filter((t) => owned(s, f).some((b) => dist(b, t) <= 3) || mine.some((m) => dist(m, t) <= 3));
      const victim = seen.sort((a, b) => dist(a, l) - dist(b, l))[0];
      if (victim && !taken.has(victim.id)) return { goal: 'hit', target: victim.id, posture: 'loud' };
    }

    // Greedy lieutenants want rackets running in their shops.
    if (l.traits.includes('greedy')) {
      const bare = owned(s, f).find((b) => !b.racket && !taken.has(b.id));
      if (bare && fam.cash > 600) return { goal: 'earn', target: bare.id, posture: 'quiet' };
    }

    // Someone guards headquarters if the enemy is close.
    if (hq && !taken.has(hq.id) && activeLts(s, foe).some((e) => dist(e, hq) <= 3)) {
      return { goal: 'hold', target: hq.id, posture: 'firm' };
    }

    // The Bootlegger expands: free shops first, then the enemy's weakest.
    const free = s.businesses.filter((b) => b.owner === null && !taken.has(b.id)).sort((a, b) => dist(a, l) - dist(b, l));
    if (free[0] && dist(free[0], l) <= 7) return { goal: 'expand', target: free[0].id, posture: loud };

    const theirs = owned(s, foe)
      .filter((b) => !taken.has(b.id))
      .sort((a, b) => guards(s, a.id) - guards(s, b.id) || dist(a, l) - dist(b, l));
    if (theirs[0] && l.muscle >= 5) return { goal: 'expand', target: theirs[0].id, posture: 'loud' };
    if (free[0]) return { goal: 'expand', target: free[0].id, posture: loud };

    const bare = owned(s, f).find((b) => !b.racket && !taken.has(b.id));
    if (bare && fam.cash > 500) return { goal: 'earn', target: bare.id, posture: 'quiet' };
    const any = owned(s, f).find((b) => b.racket && !taken.has(b.id));
    if (any) return { goal: 'earn', target: any.id, posture: 'firm' };
    return { goal: 'hold', target: hq?.id ?? null, posture: 'firm' };
  }
  fam.grudge = null;
}

function guards(s: GameState, bizId: string): number {
  return s.lts.filter((l) => l.status === 'active' && l.order.goal === 'hold' && l.order.target === bizId).length;
}
