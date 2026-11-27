// The monthly briefing. Everyone gets the numbers: this month against last. A consigliere, if the
// family has one, reads them: trends, forecasts, a read on Calloway, and options in his own voice.
// He never gives orders, he only sees what we can see, and he is a worrier: his options lead with
// the careful one. Nothing here changes the game; it only reports.

import type { Briefing, GameState, MonthSummary, Notice } from './types';
import {
  HQ_RAID_FROM,
  SLOW_HEAT,
  allBlocks,
  beatPaid,
  blockBuildings,
  blockId,
  blockName,
  cap,
  has,
  holder,
  owned,
  patience,
  protectedBy,
} from './util';

/** Months of history kept for trends. */
const KEEP = 3;
/** A block's takings falling by at least this much is worth a word. */
const TAKINGS_DROP = 100;
/** The consigliere mentions a block this close below the slow-jobs line, if it's rising. */
const HEAT_SOON = 10;
/** ...and HQ heat this close below the raid line, if it's rising. */
const HQ_SOON = 15;
/** At most this many lines of advice a month. */
const ADVICE = 4;

const dollars = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const change = (now: number, was: number | undefined, unit = '') =>
  was === undefined || now === was ? '' : ` (${now > was ? 'up' : 'down'} ${unit}${Math.abs(now - was).toLocaleString('en-US')})`;

/** The month in numbers, kept for next month's comparison. */
export function summarise(s: GameState, happened: Notice[]): MonthSummary {
  const p = s.families.player;
  const took: Record<string, number> = {};
  for (const b of s.buildings) if (holder(b) === 'player') took[blockId(b)] = (took[blockId(b)] ?? 0) + b.took;
  return {
    month: s.month,
    net: p.ledger.reduce((n, l) => n + l.amount, 0),
    income: p.ledger.filter((l) => l.amount > 0).reduce((n, l) => n + l.amount, 0),
    holds: owned(s, 'player').length + protectedBy(s, 'player').length,
    rivalHolds: owned(s, 'rival').length + protectedBy(s, 'rival').length,
    hq: p.heat,
    took,
    heat: { ...s.blockHeat },
    rivalMoves: happened.filter((n) => n.kind === 'rival' && n.at).map((n) => blockId(n.at!)),
  };
}

/** Build the briefing for the month just ended, and remember the month for next time. */
export function brief(s: GameState, happened: Notice[]): Briefing {
  const now = summarise(s, happened);
  const last = s.history.at(-1);
  const before = s.history.slice(-1);
  s.history = [...s.history, now].slice(-KEEP);
  const name = (id: string) => blockName(s, id);

  const facts = [
    `Net for the month: ${dollars(now.net)}${last ? ` (last month ${dollars(last.net)})` : ''}. Money in: ${dollars(now.income)}.`,
    `We hold ${now.holds} places${change(now.holds, last?.holds)}; Calloway holds ${now.rivalHolds}${change(now.rivalHolds, last?.rivalHolds)}.`,
    `HQ heat ${now.hq}${change(now.hq, last?.hq)}.`,
  ];
  const ours = allBlocks(s).filter((id) => blockBuildings(s, id).some((b) => holder(b) === 'player'));
  const hottest = ours.sort((a, b) => (now.heat[b] ?? 0) - (now.heat[a] ?? 0))[0];
  if (hottest && (now.heat[hottest] ?? 0) > 0)
    facts.push(`Hottest of our blocks: ${name(hottest)}, heat ${now.heat[hottest]}${change(now.heat[hottest] ?? 0, last?.heat[hottest])}.`);

  if (!has(s, 'player', 'consigliere')) return { facts, advice: [] };

  const advice: Briefing['advice'] = [];
  // Doors about to go quiet: one more month without a visit and they may stop paying.
  const atRisk = new Map<string, number>();
  for (const b of protectedBy(s, 'player'))
    if (b.uncollected > 0 && b.uncollected >= patience(s, 'player', b) - 1) atRisk.set(blockId(b), (atRisk.get(blockId(b)) ?? 0) + 1);
  for (const [id, n] of atRisk)
    advice.push({
      text: `If nobody calls on ${name(id)} this month, ${n === 1 ? 'a door there' : `${n} doors there`} could go quiet. We could put another man on collecting, or let the smaller ones go.`,
      confidence: 'Likely',
    });
  // Calloway: where he has been working against us. Months running count for most, then moves this month.
  const read = new Map<string, { months: number; moves: number }>();
  for (const m of [...before, now])
    for (const id of new Set(m.rivalMoves)) {
      const r = read.get(id) ?? { months: 0, moves: 0 };
      r.months++;
      if (m === now) r.moves = now.rivalMoves.filter((x) => x === id).length;
      read.set(id, r);
    }
  const target = [...read].sort((a, b) => b[1].months - a[1].months || b[1].moves - a[1].moves || a[0].localeCompare(b[0]))[0];
  if (target) {
    const [id, r] = target;
    advice.push(
      r.months >= 2
        ? {
            text: `He has worked ${name(id)} two months running. I'd expect him back. Guards there, or goodwill, would make it dearer for him.`,
            confidence: 'Likely',
          }
        : r.moves >= 2
          ? {
              text: `He made ${r.moves} moves on ${name(id)} this month. That's not passing through. I'd expect him back.`,
              confidence: 'Likely',
            }
          : { text: `He has been sniffing round ${name(id)}. Could be nothing.`, confidence: 'Rumour' },
    );
  }
  // Heat building on our blocks.
  for (const id of ours) {
    const h = now.heat[id] ?? 0;
    const was = last?.heat[id] ?? 0;
    if (h > was && h >= SLOW_HEAT - HEAT_SOON && !beatPaid(s, 'player', id))
      advice.push({
        text: `${cap(name(id))} is getting hot (${h}, up from ${was}). I'd pay off the beat there, or keep our people out of it until it cools.`,
        confidence: null,
      });
  }
  if (now.hq >= HQ_RAID_FROM - HQ_SOON && last && now.hq > last.hq)
    advice.push({
      text: `HQ heat keeps climbing (${now.hq}). The captain's envelope costs less than a raid. Or we go quiet for a month.`,
      confidence: null,
    });
  // Takings that fell away.
  if (last)
    for (const id of ours) {
      const drop = (last.took[id] ?? 0) - (now.took[id] ?? 0);
      if (drop >= TAKINGS_DROP) advice.push({ text: `Takings on ${name(id)} are down ${dollars(drop)} on last month.`, confidence: null });
    }
  if (!advice.length) advice.push({ text: 'A quiet month. Quiet months are when you get ready for the loud ones.', confidence: null });
  return { facts, advice: advice.slice(0, ADVICE) };
}
