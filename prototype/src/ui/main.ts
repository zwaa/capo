import './style.css';
import {
  DRAW_SCORE,
  WIN_SCORE,
  addJob,
  answer,
  ordersFor,
  assignBranch,
  bossAction,
  canAct,
  fireHood,
  forecast,
  changePlans,
  createGame,
  draftJob,
  endMonth,
  moveJob,
  priceOf,
  purchase,
  reach,
  removeJob,
  score,
  setPosture,
  startMonth,
  stepDay,
  hireHood,
  hoodCost,
  moveHood,
} from '../sim/engine';
import type { BossAction, JobPlan, Purchase } from '../sim/engine';
import { LESSONS, advanceLessons, currentLesson } from '../sim/lessons';
import { POOL, streetOf } from '../sim/setup';
import type {
  Branch,
  Building,
  Card,
  FamilyId,
  GameState,
  Hood,
  IdleOrder,
  Job,
  JobKind,
  Person,
  Posture,
  SpecialistKind,
} from '../sim/types';
import {
  BRANCHES,
  DAYS,
  IDLE_ORDERS,
  idleHoods,
  blockBuildings,
  blockId,
  blockName,
  building,
  cap,
  isHome,
  PROMOTE_XP,
  WAGE,
  crewOf,
  crewSize,
  has,
  hoodFirst,
  hoodLabel,
  holder,
  onTurf,
  squadNames,
  JOBS,
  LT_CAP,
  MAX_BRANCHES,
  REWARD_COST,
  SPECIALISTS,
  bossOf,
  branchesOf,
  first,
  jobTitle,
  jobsForBranch,
  label,
  lieutenants,
  members,
  monthName,
  owned,
  person,
  price,
  protectedBy,
  rackets,
  targets,
  totalHoods,
  gunHands,
  visible,
  HQ_RAID_FROM,
  allBlocks,
  SLOW_HEAT,
  heatAt,
} from '../sim/util';
import { HEAT_SCALE, INCOME_SCALE, MAP_MODES, WEALTH_SCALE, WardMap, incomeLabel, shortfall } from './map';
import type { Step } from './map';
import type { MapMode } from './map';

// ---------------------------------------------------------------- state

type Phase = 'paper' | 'orders' | 'watch' | 'plans' | 'over';
const SAVE_KEY = 'capo-slice-v8';
const SPEEDS = [0, 1100, 550, 220];

interface Hot {
  data?: { save?: string; phase?: Phase };
  snapshot?: (fn: () => unknown) => void;
  ready?: (fn: (d: Hot['data']) => void) => void;
}
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

let s: GameState;
let phase: Phase = 'paper';
let speed = 2;
let timer = 0;
let note = '';
/** Whose branches are open for changing (a person id), if anyone's. */
let editing: string | null = null;
/** A hood about to be let go: the button asks once more. */
let firing: string | null = null;
/** The job each person's "add a job" row is building. */
const adding: Record<string, { kind: JobKind | ''; target: string }> = {};
/** Draft job lists during a Change of Plans. */
let plans: Record<string, Job[]> = {};

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="bar" id="bar"></header>
  <div id="overlay"></div>
  <div class="main">
    <div class="mapwrap">
      <canvas id="map" aria-label="Map of the ward"></canvas>
      <div class="tip" id="tip" hidden></div>
      <div class="pick" id="pick" role="dialog" aria-label="Orders for this spot" hidden></div>
      <div class="modes" id="modes" role="group" aria-label="Map mode"></div>
      <div class="legend">
        <span><i style="background:#e3a23b"></i>Russo</span>
        <span><i style="background:#5f9fb8"></i>Calloway</span>
        <span class="key" id="map-key"></span>
      </div>
    </div>
    <aside class="side" id="side"></aside>
  </div>
`;
/** Phones show paperwork as ordinary pages, not as a layer that scrolls on its own. */
const narrow = window.matchMedia('(max-width: 860px)');
let shownOverlay = '';
const bar = document.getElementById('bar')!;
const side = document.getElementById('side')!;
const overlay = document.getElementById('overlay')!;
const modesEl = document.getElementById('modes')!;
const keyEl = document.getElementById('map-key')!;
const MODE_KEY = 'capo-map-mode';

/** Switch the map mode, and remember it on this browser (a convenience: it's fine if storage is off). */
function setMode(m: MapMode): void {
  map.mode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // Storage blocked: the mode just won't be remembered.
  }
  renderModes();
}

const tip = document.getElementById('tip')!;
const pickEl = document.getElementById('pick')!;
/** What's picked on the map (for the orders menu), and where the click was. */
let picked: { b: Building | null; p: Person | null; px: number; py: number } | null = null;
const map = new WardMap(document.getElementById('map') as HTMLCanvasElement);
try {
  const m = localStorage.getItem(MODE_KEY);
  if (MAP_MODES.some((x) => x.id === m)) map.mode = m as MapMode;
} catch {
  // Storage blocked: start on Turf.
}

// ---------------------------------------------------------------- helpers

const esc = (t: string | number) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const md = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const TRAIT: Record<string, string> = {
  hothead: 'Hothead',
  greedy: 'Greedy',
  cautious: 'Cautious',
  ambitious: 'Ambitious',
  oldworld: 'Old-world',
  loyal: 'Loyal',
  looselips: 'Loose lips',
};
const POSTURES: Posture[] = ['quiet', 'firm', 'loud'];

function mood(p: Person): { text: string; cls: string } {
  if (p.role === 'boss') return { text: 'The boss', cls: 'ok' };
  if (p.loyalty >= 70) return { text: 'Solid', cls: 'ok' };
  if (p.loyalty >= 45) return { text: 'Content', cls: '' };
  if (p.loyalty >= 30) return { text: 'Grumbling', cls: 'warn' };
  return { text: 'Restless', cls: 'warn' };
}

function statusOf(p: Person): string {
  return p.status === 'active'
    ? ''
    : p.status === 'wounded'
      ? 'In hospital'
      : p.status === 'jailed'
        ? 'In a cell'
        : p.status === 'dead'
          ? 'Dead'
          : 'Gone over';
}

function save(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the game still runs */
  }
}

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    return g.run || g.over ? null : g;
  } catch {
    return null;
  }
}

function newGame(lessons = true): void {
  stop();
  closePick();
  s = createGame((Math.random() * 2 ** 31) | 0, undefined, lessons);
  phase = 'paper';
  note = '';
  save();
  render();
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- top bar

function renderBar(): void {
  const p = s.families.player;
  const cash = p.ledger
    .map(
      (l) =>
        `<div class="row"><span>${esc(l.label)}</span><em class="${l.amount < 0 ? 'neg' : ''}">${l.amount ? money(l.amount) : '·'}</em></div>`,
    )
    .join('');
  // The blocks we do business on, hottest first.
  const hotBlocks = allBlocks(s)
    .filter((id) => blockBuildings(s, id).some((b) => holder(b) === 'player'))
    .map((id) => ({ id, h: s.blockHeat[id] ?? 0 }))
    .filter((x) => x.h > 0)
    .sort((a, b) => b.h - a.h)
    .slice(0, 4);
  const hot = hotBlocks[0];
  const heat = p.heatLog
    .map((l) => `<div class="row"><span>${esc(l.label)}</span><em class="${l.amount > 0 ? 'neg' : ''}">${signed(l.amount)}</em></div>`)
    .join('');
  bar.innerHTML = `
    <div class="logo">Capo<small>Vertical slice · v2</small></div>
    <div class="stat"><b>${esc(monthName(s.month))}</b><span>Month ${s.month + 1} of ${s.lastMonth + 1}</span></div>
    <div class="stat explain" tabindex="0"><b>${money(p.cash)}</b><span>Cash</span>
      <div class="why"><h4>${s.run ? 'This month so far' : 'Last month'}</h4>${cash || '<p>No money has moved yet.</p>'}</div></div>
    <div class="stat explain" tabindex="0"><b>${p.heat}${hot ? ` · ${hot.h}` : ''}</b><span>HQ heat${hot ? ' · hottest block' : ''}</span>
      <div class="heatbar"><i style="width:${p.heat}%"></i></div>
      <div class="why"><h4>Why HQ heat is ${p.heat}</h4>${heat || '<p>Nothing new this month.</p>'}
      <p style="margin-top:8px">HQ heat is about the family itself: loose talk, the papers, complaints. Above ${HQ_RAID_FROM} the police may raid HQ.</p>
      <h4 style="margin-top:10px">On our streets</h4>${
        hotBlocks.length
          ? hotBlocks
              .map(
                (x) =>
                  `<div class="row"><span>${esc(cap(blockName(s, x.id)))}</span><em class="${x.h >= SLOW_HEAT ? 'neg' : ''}">${x.h}</em></div>`,
              )
              .join('')
          : '<p>Quiet everywhere we do business.</p>'
      }
      <p style="margin-top:8px">Heat on a block brings raids on rackets there, and from ${SLOW_HEAT} slows every job there. See the Heat map.</p></div></div>
    <div class="stat explain" tabindex="0"><b>${owned(s, 'player').length} · ${protectedBy(s, 'player').length}</b><span>Owned · Paying</span>
      <div class="why"><h4>Your piece of the ward</h4><p>${owned(s, 'player').length} buildings owned, ${rackets(s, 'player').length} with a racket, ${protectedBy(s, 'player').length} shops paying protection.</p>
      <p style="margin-top:6px">Calloway: ${owned(s, 'rival').length} owned, ${rackets(s, 'rival').length} rackets, ${protectedBy(s, 'rival').length} paying.</p>
      <p style="margin-top:6px">Year-end score so far: ${Math.round(score(s, 'player')).toLocaleString('en-US')} (a win needs ${WIN_SCORE.toLocaleString('en-US')}).</p></div></div>
    <div class="stat"><b>${p.actions}</b><span>Meetings</span></div>
    <div class="spacer"></div>
    <button class="ghost" data-act="new">New game</button>
  `;
}

// ---------------------------------------------------------------- job lists

function jobStatus(j: Job, scope: string, plan?: JobPlan): { text: string; cls: string } {
  if (scope === 'plans') return { text: JOBS[j.kind].ongoing ? 'Ongoing' : 'One-off', cls: '' };
  // Waiting for hands: the plan says when someone frees up to take it.
  if (j.stalled && plan?.start && !JOBS[j.kind].ongoing) return { text: `Waits for free hands: ${when(plan)}`, cls: 'warn' };
  if (j.stalled && /hands|Nobody free/.test(j.stalled) && !JOBS[j.kind].ongoing)
    return { text: `${j.stalled}: not this month`, cls: 'bad' };
  if (j.stalled) return { text: j.stalled, cls: 'bad' };
  if (j.need === 0) return { text: JOBS[j.kind].ongoing ? 'Nothing to do yet' : 'Ready', cls: 'idle' };
  const car = j.car ? ' · car' : '';
  const who = squadNames(s, j);
  if (j.hoods < j.need) return { text: `${who}: ${j.hoods} of ${j.need} hands, only partly done${car}`, cls: 'warn' };
  const days = plan?.start && !JOBS[j.kind].ongoing ? ` · ${when(plan)}` : JOBS[j.kind].ongoing ? ' · all month' : '';
  return { text: `${who}${car}${days}`, cls: 'ok' };
}

/** "days 3-8", "about day 12 to 19", "starts day 25, runs into next month". */
function when(plan: JobPlan): string {
  const { start, end } = plan;
  if (!start || !end) return '';
  if (end > DAYS) return `starts about day ${start}, runs into next month`;
  return start === 1 ? `about days 1-${end}` : `about days ${start}-${end}`;
}

/** A line under the list: how much of the month this crew's plan fills. */
function planSummary(p: Person, freeFrom: number[]): string {
  if (!freeFrom.length) return '';
  const idle = freeFrom.filter((d) => d < DAYS - 2);
  if (!idle.length) return '<p class="plan-sum">Every pair of hands is busy all month.</p>';
  const from = Math.min(...idle);
  const n = idle.length;
  const when = from ? `idle from about day ${from + 1}` : 'with nothing to do';
  if (p.idle !== 'rest')
    return `<p class="plan-sum">${n} of ${freeFrom.length} hands ${when}: they'll be ${IDLE_ORDERS[p.idle].doing}.</p>`;
  return `<p class="plan-sum idle">${n} of ${freeFrom.length} hands ${when}. Add jobs below, or give them a standing order.</p>`;
}

// ---------------------------------------------------------------- hoods

function statLine(h: { muscle: number; brains: number; nerve: number; charm: number }): string {
  const best = Math.max(h.muscle, h.brains, h.nerve, h.charm);
  const one = (k: string, v: number) => `<span class="${v === best ? 'top' : ''}" title="${k}">${k[0]}${v}</span>`;
  return `<span class="hstats">${one('Muscle', h.muscle)}${one('Brains', h.brains)}${one('Nerve', h.nerve)}${one('Charm', h.charm)}</span>`;
}

function xpPips(h: Hood): string {
  if (h.xp >= PROMOTE_XP) return '<span class="chip ok">Lieutenant material</span>';
  return `<span class="pips" title="Experience ${h.xp} of ${PROMOTE_XP} to be promoted">${'●'.repeat(h.xp)}${'○'.repeat(PROMOTE_XP - h.xp)}</span>`;
}

function hoodStatus(h: Hood): string {
  return h.status === 'wounded'
    ? '<span class="chip warn">In hospital</span>'
    : h.status === 'jailed'
      ? '<span class="chip warn">In a cell</span>'
      : '';
}

/** One hood in a crew: stats, experience, whose crew, and a promotion when earned. */
function hoodRow(h: Hood): string {
  const people = members(s, 'player');
  const opts = people
    .map(
      (p) =>
        `<option value="${p.id}" ${h.under === p.id ? 'selected' : ''}>${esc(p.role === 'boss' ? `${first(p)}'s crew (you)` : `${first(p)}'s crew`)}</option>`,
    )
    .join('');
  const promote = h.xp >= PROMOTE_XP ? actButton({ kind: 'promote', hood: h.id }, 'Promote (1 meeting)') : '';
  const fire = s.run
    ? ''
    : `<button class="small ${firing === h.id ? 'danger' : ''}" data-fire="${h.id}" title="They leave the family. A loose-lipped one talks.">${firing === h.id ? `Let ${esc(hoodFirst(h))} go?` : 'Let go'}</button>`;
  return `<div class="hood ${h.status === 'active' ? '' : 'out'}" title="${esc(h.bio)}">
    <div class="hn"><b>${esc(hoodLabel(h))}</b>
      <small>${statLine(h)}${h.traits.map((t) => ` · ${TRAIT[t]}`).join('')}</small></div>
    <div class="hx">${hoodStatus(h)}${xpPips(h)}</div>
    <div class="hc">${people.length > 1 ? `<select data-movehood="${h.id}" aria-label="Whose crew ${esc(hoodFirst(h))} is in">${opts}</select>` : ''}${promote}${fire}</div>
  </div>`;
}

function jobList(p: Person, jobs: Job[], scope: 'orders' | 'plans'): string {
  const live = jobs.filter((j) => !j.done);
  const fc = scope === 'orders' ? forecast(s, p) : null;
  const rows = live
    .map((j, i) => {
      const plan = fc?.jobs[j.id];
      const st = jobStatus(j, scope, plan);
      const bar =
        plan?.start && plan.end
          ? `<i class="when" style="left:${((plan.start - 1) / DAYS) * 100}%;width:${(Math.min(DAYS, plan.end) - plan.start + 1) * (100 / DAYS)}%" aria-hidden="true"></i>`
          : '';
      return `<div class="job ${st.cls}">${bar}
        <span class="rank">${i + 1}</span>
        <div class="jt"><b>${esc(jobTitle(s, j))}</b><small>${esc(st.text)}</small></div>
        <div class="jbtns">
          <span class="mini" role="group" aria-label="Posture">${POSTURES.map((q) => `<button data-jposture="${q}" data-p="${p.id}" data-j="${j.id}" data-scope="${scope}" aria-pressed="${j.posture === q}" title="${q[0].toUpperCase() + q.slice(1)}">${q[0].toUpperCase()}</button>`).join('')}</span>
          <button class="ic" data-act="up" data-p="${p.id}" data-j="${j.id}" data-scope="${scope}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ic" data-act="down" data-p="${p.id}" data-j="${j.id}" data-scope="${scope}" aria-label="Move down" ${i === live.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="ic" data-act="del" data-p="${p.id}" data-j="${j.id}" data-scope="${scope}" aria-label="Remove">✕</button>
        </div>
      </div>`;
    })
    .join('');
  return `<div class="jobs">${rows || '<p class="hint">No jobs. Add one below.</p>'}</div>${fc && live.length ? planSummary(p, fc.freeFrom) : ''}${addRow(p, scope)}`;
}

function addRow(p: Person, scope: string): string {
  const key = `${scope}:${p.id}`;
  const a = (adding[key] ??= { kind: '', target: '' });
  const mine = branchesOf(s, p);
  if (!mine.length) return '<p class="hint">Click their branches above to give them some, and they can take jobs.</p>';
  const kinds = mine
    .map((b) => {
      const info = BRANCHES.find((x) => x.id === b)!;
      return `<optgroup label="${esc(info.label)}">${jobsForBranch(b)
        .map((k) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${esc(JOBS[k].label)}</option>`)
        .join('')}</optgroup>`;
    })
    .join('');
  const needsTarget = a.kind && JOBS[a.kind].target !== 'none';
  const ts = needsTarget ? targets(s, 'player', a.kind as JobKind) : [];
  const tsel = needsTarget
    ? `<select data-add="target" data-key="${key}" aria-label="Target">${ts.length ? '' : '<option value="">No valid target</option>'}${ts.map((t) => `<option value="${t.id}" ${a.target === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>`
    : '';
  const hint = a.kind ? `<small class="hint">${esc(JOBS[a.kind].hint)}</small>` : '';
  return `<div class="addjob">
    <select data-add="kind" data-key="${key}" aria-label="Add a job"><option value="">Add a job…</option>${kinds}</select>
    ${tsel}
    <button class="small" data-act="add" data-p="${p.id}" data-scope="${scope}" ${!a.kind || (needsTarget && !ts.length) ? 'disabled' : ''}>Add</button>
    ${hint}
  </div>`;
}

// ---------------------------------------------------------------- orders panel

function actButton(a: BossAction, text: string, extra = ''): string {
  const why = canAct(s, a);
  return `<button class="small" ${extra} data-boss='${esc(JSON.stringify(a))}' ${why ? `disabled title="${esc(why)}"` : ''}>${esc(text)}</button>`;
}

function personCard(p: Person): string {
  const m = mood(p);
  const st = statusOf(p);
  const boss = bossOf(s, 'player');
  const branches = branchesOf(s, p)
    .map((b) => `<span class="chip ok">${esc(BRANCHES.find((x) => x.id === b)!.label)}</span>`)
    .join('');
  const demand = p.demand
    ? `<div class="demand"><span>${esc(first(p))} ${esc(p.demand.text)}.${p.demand.age ? ` Waiting ${p.demand.age} month${p.demand.age > 1 ? 's' : ''}.` : ''}</span>${actButton({ kind: 'grant', lt: p.id }, 'Grant it (1 meeting)')}</div>`
    : '';
  const crew = crewOf(s, p);
  const hoods = `<div class="crew"><h4 class="sub">${esc(p.role === 'boss' ? 'Your crew' : `${first(p)}'s crew`)} (${crew.length})</h4>
    ${crew.map(hoodRow).join('') || `<p class="hint">${p.role === 'boss' ? 'Nobody. Take someone on from the hiring hall below.' : `Nobody yet. Move hoods across from ${esc(first(boss))}'s crew.`}</p>`}
  </div>`;
  return `<div class="lt ${p.status === 'active' ? '' : 'out'} ${p.role === 'boss' ? 'boss' : ''}">
    <div class="lt-head"><span class="lt-name">${esc(p.name.split(' ')[0])} <q>${esc(p.nickname)}</q> ${esc(p.name.split(' ').slice(1).join(' '))}</span>
      <span class="chip ${st ? 'warn' : m.cls}" ${p.role === 'lt' ? 'title="Loyalty is hidden. This is how they seem."' : ''}>${st || m.text}</span></div>
    ${p.traits.length ? `<div class="chips">${p.traits.map((t) => `<span class="chip">${TRAIT[t]}</span>`).join('')}</div>` : ''}
    <div class="stats"><span>Muscle <b>${p.muscle}</b></span><span>Brains <b>${p.brains}</b></span><span>Nerve <b>${p.nerve}</b></span><span>Charm <b>${p.charm}</b></span></div>
    ${p.role === 'lt' ? `<div class="meter"><span>Ambition</span><div><i style="width:${p.ambition}%"></i></div></div>` : ''}
    ${p.role === 'lt' ? `<div class="lt-acts">${actButton({ kind: 'demote', lt: p.id }, 'Demote (1 meeting)', `title="Back to the street: branches and crew come to you. He won't like it."`)}</div>` : ''}
    <button class="resp" data-act="branches" data-p="${p.id}" aria-expanded="${editing === p.id}">
      <span class="chips">${branches || '<span class="hint">No branches yet</span>'}</span>
      <span class="resp-edit">${editing === p.id ? 'Done' : 'Change'}</span>
    </button>
    ${editing === p.id ? branchEditor(p) : ''}
    ${idleControl(p)}
    ${demand}
    ${jobList(p, p.jobs, 'orders')}
    ${hoods}
  </div>`;
}

/** The standing order for this person's idle hoods. */
function idleControl(p: Person): string {
  const orders = Object.keys(IDLE_ORDERS) as IdleOrder[];
  return `<div class="idle-order"><span>When idle</span><span class="seg" role="group" aria-label="What ${esc(first(p))}'s idle hoods do">${orders
    .map(
      (o) =>
        `<button data-idle="${p.id}|${o}" aria-pressed="${p.idle === o}" title="${esc(IDLE_ORDERS[o].hint)}">${esc(IDLE_ORDERS[o].label)}</button>`,
    )
    .join('')}</span></div>`;
}

function lessonCard(): string {
  if (!s.lessons.on) return '';
  const l = currentLesson(s);
  if (!l)
    return `<section class="lesson"><h3>Lessons</h3><p class="hint">All ${LESSONS.length} lessons done. The rest of the year is yours.</p></section>`;
  return `<section class="lesson">
    <div class="lesson-head"><h3>Lesson ${s.lessons.index + 1} of ${LESSONS.length}</h3><button class="link" data-act="lessons-off">Turn lessons off</button></div>
    <h2>${esc(l.title)}</h2>
    <p>${md(l.body)}</p>
    <p class="goal">Goal: ${esc(l.goal)}</p>
  </section>`;
}

function candidates(): string {
  if (!s.candidates.length) return '';
  return `<section><h3>Asking for work</h3>${s.candidates
    .map((i) => {
      const r = POOL[i];
      return `<div class="lt candidate"><div class="lt-head"><span class="lt-name">${esc(r.name.split(' ')[0])} <q>${esc(r.nickname)}</q> ${esc(r.name.split(' ').slice(1).join(' '))}</span></div>
        <div class="chips">${r.traits.map((t) => `<span class="chip">${TRAIT[t]}</span>`).join('')}</div>
        <div class="stats"><span>Muscle <b>${r.s[0]}</b></span><span>Brains <b>${r.s[1]}</b></span><span>Nerve <b>${r.s[2]}</b></span><span>Charm <b>${r.s[3]}</b></span></div>
        <p class="hint">${esc(r.pitch)} Experienced: ready to be promoted.</p>
        ${actButton({ kind: 'enlist', pool: i }, 'Take them on (free)')}</div>`;
    })
    .join('')}</section>`;
}

/**
 * Who runs what, opened from a person's branches. On the boss's card every
 * branch can go to anyone; on a lieutenant's, each branch is theirs or not.
 */
function branchEditor(p: Person): string {
  const fam = s.families.player;
  const people = members(s, 'player');
  const areas = [...new Set(BRANCHES.map((b) => b.area))];
  const mineCount = branchesOf(s, p).length;
  const control = (b: (typeof BRANCHES)[number]): string => {
    if (p.role === 'lt') {
      const theirs = fam.branches[b.id] === p.id;
      const full = !theirs && mineCount >= MAX_BRANCHES;
      const now = person(s, fam.branches[b.id])!;
      return `<button class="small" data-branch-give="${p.id}|${b.id}" ${full ? `disabled title="${esc(first(p))} already runs ${MAX_BRANCHES}"` : ''}>${
        theirs ? 'Take it back' : `Give to ${esc(first(p))}${now.role === 'lt' ? ` (from ${esc(first(now))})` : ''}`
      }</button>`;
    }
    const opts = people
      .map((x) => {
        const full = x.role === 'lt' && branchesOf(s, x).length >= MAX_BRANCHES && fam.branches[b.id] !== x.id;
        const tag = x.role === 'boss' ? ' (you)' : full ? ' (full)' : x.status !== 'active' ? ` (${statusOf(x).toLowerCase()})` : '';
        return `<option value="${x.id}" ${fam.branches[b.id] === x.id ? 'selected' : ''} ${full ? 'disabled' : ''}>${esc(first(x))}${tag}</option>`;
      })
      .join('');
    return `<select data-branch="${b.id}" aria-label="Who runs ${esc(b.label)}">${opts}</select>`;
  };
  const runsIt = (b: (typeof BRANCHES)[number]) => fam.branches[b.id] === p.id;
  return `<div class="resp-panel">
    <p class="hint">${
      p.role === 'boss'
        ? 'Every branch is run by you or a lieutenant (up to ' + MAX_BRANCHES + ' each). Its jobs move with it.'
        : `${esc(first(p))} can run up to ${MAX_BRANCHES} branches. Their jobs move with them, and stats that suit a branch work its jobs faster and safer.`
    }</p>
    ${note ? `<p class="hint" style="color:var(--lamp)">${esc(note)}</p>` : ''}
    <div class="branches">${areas
      .map(
        (area) =>
          `<div class="area"><h4>${esc(area)}</h4>${BRANCHES.filter((b) => b.area === area)
            .map((b) => {
              return `<div class="branch ${runsIt(b) ? 'mine' : ''}"><span><b>${esc(b.label)}</b><small>${esc(b.blurb)}. Suits ${b.stat}.</small></span>${control(b)}</div>`;
            })
            .join('')}</div>`,
      )
      .join('')}</div>
  </div>`;
}

function supplies(): string {
  const fam = s.families.player;
  const hoods = totalHoods(s, 'player');
  const row = (what: Purchase, name: string, have: string) =>
    `<div class="supply"><span><b>${esc(name)}</b><small>${esc(have)}</small></span><button class="small" data-buy="${what}" ${fam.cash < priceOf(s, what) ? 'disabled title="Not enough cash"' : ''}>Buy (${money(priceOf(s, what))})</button></div>`;
  const hall = s.market
    .map((h) => {
      const cost = hoodCost(s, h);
      return `<div class="hood hire">
        <div class="hn"><b>${esc(hoodLabel(h))}</b><small>${statLine(h)}${h.traits.map((t) => ` · ${TRAIT[t]}`).join('')}</small><small class="bio">${esc(h.bio)}</small></div>
        <div class="hx">${xpPips(h)}</div>
        <div class="hc"><button class="small" data-hire="${h.id}" ${fam.cash < cost ? 'disabled title="Not enough cash"' : ''}>Take on (${money(cost)})</button></div>
      </div>`;
    })
    .join('');
  return `<section>
    <h3>Looking for work</h3>
    <p class="hint">New faces each month${has(s, 'player', 'recruiter') ? ', found by your recruiter' : ''}. They join your own crew; move them to a lieutenant's from their row. ${hoods} on the books, ${money(WAGE)} a month each.</p>
    ${hall || '<p class="hint">Nobody this month.</p>'}
  </section>
  <section>
    <h3>Supplies</h3>
    ${row('gun', 'Pistols', `${fam.guns} for ${armedOf(hoods)}${fam.guns < gunHands(s, 'player') ? ': some go in bare-handed' : ': everyone is armed'}.`)}
    ${row('car', 'Cars', `${fam.cars} in the garage. Hits, takeovers and supply runs need one each.`)}
    <div class="supply"><span><b>Liquor</b><small>${fam.liquor} cases. Bars pour 15 a month each; stills make 25.</small></span></div>
  </section>`;
}

/** "5 hoods and 2 lieutenants": who the pistols have to go round. */
function armedOf(hoods: number): string {
  const lts = lieutenants(s, 'player').length;
  return `${hoods} hood${hoods === 1 ? '' : 's'}${lts ? ` and ${lts} lieutenant${lts === 1 ? '' : 's'}` : ''}`;
}

function meetings(): string {
  const fam = s.families.player;
  const lts = lieutenants(s, 'player').filter((l) => l.status === 'active');
  const spec = (k: SpecialistKind) => {
    const info = SPECIALISTS[k];
    const hired = fam.specialists.includes(k);
    return `<div class="meeting"><span><b>${esc(info.title)}</b>${hired ? ` · ${esc(info.name)}` : ''}<small>${esc(info.hint)}. ${money(info.retainer)} a month.</small></span>
      ${hired ? '<span class="chip ok">Hired</span>' : actButton({ kind: 'specialist', which: k }, 'Hire')}</div>`;
  };
  const ready = s.hoods.filter((h) => h.family === 'player' && h.xp >= PROMOTE_XP).length;
  return `<section>
    <h3>Meetings: ${fam.actions} left this month</h3>
    ${note ? `<p class="hint" style="color:var(--lamp)">${esc(note)}</p>` : ''}
    <div class="meeting"><span><b>Promote a lieutenant</b><small>${lieutenants(s, 'player').length} of ${LT_CAP}. Lieutenants come from your own hoods: anyone with ${PROMOTE_XP} experience can be promoted from their row in a crew. ${ready ? `${ready} ready now.` : 'Nobody is ready yet.'}</small></span></div>
    <h4 class="sub">Specialists</h4>
    ${(['recruiter', 'armourer', 'mechanic', 'lawyer'] as SpecialistKind[]).map(spec).join('')}
    ${lts.length ? `<div class="meeting"><span><b>An envelope</b><small>Loyalty up. ${money(REWARD_COST)}.</small></span><select id="reward-lt" aria-label="Who gets the envelope">${lts.map((l) => `<option value="${l.id}">${esc(first(l))}</option>`).join('')}</select>${actButton({ kind: 'reward', lt: lts[0].id }, 'Give', 'data-pickreward="1"')}</div>` : ''}
  </section>`;
}

function renderOrders(): string {
  const people = members(s, 'player');
  const rivals = members(s, 'rival');
  return `
    ${lessonCard()}
    <section><h2>Orders for ${esc(monthName(s.month))}</h2>
      <p class="hint">Each person works down their own list. Hands go to the jobs at the top first, and jobs that get nobody stall. Ongoing jobs carry over each month; one-off jobs drop off when they're done.</p></section>
    ${candidates()}
    <section><h3>Your people</h3>${people.map(personCard).join('')}</section>
    ${supplies()}
    ${meetings()}
    <section>
      <h3>${esc(s.families.rival.name)}</h3>
      <p class="hint">Run by Jim Calloway. ${owned(s, 'rival').length} buildings, ${protectedBy(s, 'rival').length} shops paying. ${s.families.rival.notice ? 'He knows who you are.' : "He hasn't noticed you yet."} You only see his people near your shops and crews.</p>
      ${rivals.map((p) => `<div class="stats"><span style="color:var(--steel)">${esc(label(p))}</span><span>${p.status === 'active' ? (visible(s, p) ? 'in sight' : 'whereabouts unknown') : statusOf(p).toLowerCase()}</span></div>`).join('')}
    </section>
    <section><button class="primary" data-act="begin">Begin the month</button></section>`;
}

// ---------------------------------------------------------------- watch panel

function renderWatch(): string {
  const run = s.run!;
  return `
    <section>
      <div class="clock"><b>Day ${run.day}</b><span class="hint">${esc(monthName(s.month))}</span></div>
      <div class="days"><i style="width:${(run.day / 30) * 100}%"></i></div>
      <div class="speed" role="group" aria-label="Speed">${['Pause', 'Slow', 'Normal', 'Fast'].map((t, i) => `<button class="small" data-speed="${i}" aria-pressed="${speed === i}">${t}</button>`).join('')}</div>
      <p class="hint">Changes of Plans left: ${run.changesLeft}. Big events stop the clock.</p>
    </section>
    <section><h3>Out on the street</h3>${members(s, 'player')
      .map((p) => {
        const jobs = p.jobs
          .map((j) => {
            const info = JOBS[j.kind];
            const pct = info.ongoing ? (j.stalled || !j.hoods ? 0 : 100) : Math.min(100, (j.progress / Math.max(1, j.days)) * 100);
            const st = j.done
              ? 'Done'
              : j.stalled
                ? j.stalled
                : info.ongoing
                  ? j.hoods
                    ? 'All month'
                    : 'Nothing to do'
                  : j.progress
                    ? `Day ${j.progress} of ${j.days}`
                    : 'On the way';
            return `<div class="wjob ${j.stalled ? 'bad' : ''}"><span>${esc(jobTitle(s, j))}</span><small>${esc(st)}</small><div class="bar"><i style="width:${pct}%"></i></div></div>`;
          })
          .join('');
        const idle = p.status === 'active' ? idleHoods(s, p) : [];
        const loafing = idle.length
          ? `<span class="hint">${esc(idle.map(hoodFirst).join(', '))}: ${p.idle === 'rest' ? 'nothing to do' : IDLE_ORDERS[p.idle].doing}</span>`
          : '';
        return `<div class="lt ${p.status === 'active' ? '' : 'out'}"><div class="lt-head"><span class="lt-name">${esc(first(p))}</span><span class="chip">${statusOf(p) || `crew ${crewSize(s, p)} + 1`}</span></div>${p.pending ? `<span class="hint">Runner arrives day ${p.pending.arriveDay}</span>` : ''}${jobs || '<span class="hint">No jobs</span>'}${loafing}</div>`;
      })
      .join('')}</section>
    <section><h3>The word</h3><div class="ticker">${
      run.log
        .slice()
        .reverse()
        .filter((e) => e.family !== 'rival' || /took|driven|hit|raid|gone over|muscled|new orders|wrecked|taken in/i.test(e.text))
        .slice(0, 14)
        .map(
          (e) => `<p class="${e.family ?? 'none'}"><span>d${e.day}</span>${esc(e.family === 'rival' ? `Calloway: ${e.text}` : e.text)}</p>`,
        )
        .join('') || '<p class="none"><span></span>Quiet so far.</p>'
    }</div></section>`;
}

// ---------------------------------------------------------------- overlays

const KIND: Record<Card['kind'], string> = {
  hothead: 'Telegram',
  shopkeeper: 'From the street',
  fight: 'Trouble',
  cop: 'From the street',
  tail: 'Telephone call',
  emergency: 'Urgent',
  betrayal: 'A private word',
  offer: 'A business proposition',
  bail: 'Telephone call',
  snitch: 'A private word',
};

function renderCard(c: Card): string {
  const alarm = c.kind === 'fight' || c.kind === 'emergency';
  return `<div class="paper telegram" role="dialog" aria-modal="true" aria-labelledby="card-title">
    <div class="kind ${alarm ? 'alarm' : ''}"><span>${KIND[c.kind]}</span><span>Day ${c.day}, ${esc(monthName(s.month))}</span></div>
    <h2 id="card-title">${esc(c.title)}</h2>
    <p>${esc(c.text)}</p>
    <div class="opts">${c.options.map((o) => `<button class="opt" data-card="${c.id}" data-opt="${o.id}" ${o.disabled ? 'disabled' : ''}><b>${esc(o.label)}</b><small>${esc(o.hint)}</small></button>`).join('')}</div>
  </div>`;
}

function renderEdition(): string {
  const p = s.families.player;
  const [lead, ...rest] = s.news;
  const total = p.ledger.reduce((n, l) => n + l.amount, 0);
  const trouble = lieutenants(s, 'player').filter((l) => l.demand);
  const l = currentLesson(s);
  return `<div class="paper edition" role="dialog" aria-modal="true" aria-labelledby="ed-title">
    <div class="masthead">
      <div class="dateline"><span>Vol. XLI · No. ${s.month + 112}</span><span>Two cents</span></div>
      <h1 id="ed-title">The Morning Edition</h1>
      <div class="dateline"><span>${esc(monthName(s.month))}</span><span>All the news the captain allows</span></div>
    </div>
    <div class="stories">
      ${lead ? `<article class="story lead"><h2>${esc(lead.headline)}</h2><p>${esc(lead.body)}</p></article>` : ''}
      ${rest
        .slice(0, 4)
        .map((n) => `<article class="story"><h2>${esc(n.headline)}</h2><p>${esc(n.body)}</p></article>`)
        .join('')}
    </div>
    <div class="cols">
      <div class="wire"><h3>The Wire</h3>${s.wire.length ? s.wire.map((w) => `<p><em>${w.confidence}</em>${esc(w.text)}</p>`).join('') : '<p>Your informants heard nothing worth repeating.</p>'}</div>
      <div class="ledger"><h3>The Ledger</h3>${
        p.ledger.length
          ? p.ledger.map((x) => `<p><span>${esc(x.label)}</span><em>${x.amount ? money(x.amount) : '·'}</em></p>`).join('') +
            `<p class="total"><span>Net</span><em>${money(total)}</em></p>`
          : `<p>${money(p.cash)} in an envelope, two cousins and two pistols. A rented room on ${esc(streetOf({ y: bossOf(s, 'player').homeY }))}.</p>`
      }</div>
      <div class="trouble"><h3>Trouble at home</h3>${trouble.length ? trouble.map((x) => `<p>${esc(label(x))} ${esc(x.demand!.text)}.</p>`).join('') : '<p>Nobody is asking for anything. Yet.</p>'}
      ${l ? `<p><b>Lesson ${s.lessons.index + 1}:</b> ${esc(l.title)}. ${esc(l.goal)}.</p>` : ''}</div>
    </div>
    <button class="primary go" data-act="to-work">To work</button>
  </div>`;
}

function renderPlans(): string {
  const people = members(s, 'player').filter((p) => p.status === 'active');
  return `<div class="paper plans" role="dialog" aria-modal="true" aria-labelledby="plans-title">
    <h2 id="plans-title">Change of Plans</h2>
    <p class="hint">Re-rank, add or drop jobs for the rest of the month. Your own list changes at once. A lieutenant at a building with a telephone hears now; anyone else waits for a runner, and keeps working the old list until it arrives.</p>
    <div class="grid">${people
      .map((p) => {
        const r = reach(s, p.id);
        return `<div class="lt"><div class="lt-head"><span class="lt-name">${esc(label(p))}</span></div>
          <span class="reach ${r.kind}">${esc(r.text)}</span>
          ${r.kind !== 'unavailable' ? jobList(p, plans[p.id] ?? p.jobs, 'plans') : ''}</div>`;
      })
      .join('')}</div>
    <div class="row"><button class="small" data-act="plans-cancel">Never mind</button><button class="primary" data-act="plans-go">Send the orders</button></div>
  </div>`;
}

function renderOver(): string {
  const o = s.over!;
  const verdict =
    o.result === 'win'
      ? 'A family to be reckoned with'
      : o.result === 'draw'
        ? 'A small outfit, still standing'
        : 'Back to the rented room';
  return `<div class="paper over" role="dialog" aria-modal="true" aria-labelledby="over-title">
    <div class="masthead"><div class="dateline"><span>Final edition</span><span>${esc(monthName(Math.min(s.month, s.lastMonth)))}</span></div></div>
    <h1 id="over-title">${esc(o.headline)}</h1>
    <p>${esc(o.text)}</p>
    <p class="verdict">${verdict}</p>
    <p class="hint" style="color:var(--paper-dim)">Score ${Math.round(score(s, 'player')).toLocaleString('en-US')}. A draw needs ${DRAW_SCORE.toLocaleString('en-US')}, a win ${WIN_SCORE.toLocaleString('en-US')}.</p>
    <div class="row center"><button class="primary" data-act="new">Play again with lessons</button><button class="small" data-act="new-nolessons">Without lessons</button></div>
  </div>`;
}

function renderOverlay(): void {
  let html = '';
  if (phase === 'over' && s.over) html = renderOver();
  else if (phase === 'paper') html = renderEdition();
  else if (phase === 'plans') html = renderPlans();
  else if (phase === 'watch' && s.run?.queue.length) {
    const c = s.run.queue[0];
    html = renderCard(c);
    map.focus(c.focus);
  }
  const keep = overlay.querySelector('.overlay')?.scrollTop ?? 0;
  overlay.innerHTML = html ? `<div class="overlay">${html}</div>` : '';
  // Full pages (the newspaper, Change of Plans, the final edition) replace the game view on phones.
  app.classList.toggle('screen', phase === 'paper' || phase === 'plans' || (phase === 'over' && !!s.over));
  const key = html ? `${phase}:${s.run?.queue[0]?.id ?? ''}` : '';
  const fresh = key !== shownOverlay;
  shownOverlay = key;
  const o = overlay.querySelector('.overlay');
  if (o && phase === 'plans') o.scrollTop = keep;
  else overlay.querySelector<HTMLButtonElement>('.opt:not(:disabled), .primary')?.focus({ preventScroll: true });
  // On a phone, bring anything new into view at the top of the page.
  if (html && fresh && narrow.matches) window.scrollTo({ top: 0 });
}

/** The map-mode switcher, and a legend that says what the current mode shows. */
function renderModes(): void {
  modesEl.innerHTML = MAP_MODES.map(
    (m) => `<button data-mode="${m.id}" aria-pressed="${map.mode === m.id}" title="${esc(m.key)}">${esc(m.label)}</button>`,
  ).join('');
  const mode = MAP_MODES.find((m) => m.id === map.mode)!;
  let key = mode.key;
  if (map.mode === 'income') {
    const ours = s.buildings.filter((b) => holder(b) === 'player');
    const took = ours.reduce((n, b) => n + b.took, 0);
    const short = ours.filter((b) => shortfall(b)).length;
    key = `Last month our places took ${money(took)}${short ? ` · ${short} came up short` : ''} (before wages and cuts) · ${key}`;
  }
  if (map.mode === 'wealth' || map.mode === 'income' || map.mode === 'heat')
    key += ' · Outlines: who holds each place (solid: owns it, dashed: pays them)';
  const scale = (steps: Step[]) =>
    `<span class="scale">${steps.map((x) => `<span><i style="background:${x.colour}"></i>${esc(x.label)}</span>`).join('')}</span>`;
  keyEl.innerHTML =
    (map.mode === 'wealth'
      ? scale(WEALTH_SCALE)
      : map.mode === 'income'
        ? scale(INCOME_SCALE)
        : map.mode === 'heat'
          ? scale(HEAT_SCALE)
          : '') + `<span>${esc(key)}</span>`;
}

function render(): void {
  map.setState(s);
  renderModes();
  map.showOrders = phase === 'orders';
  renderBar();
  side.innerHTML = phase === 'watch' || phase === 'plans' ? renderWatch() : renderOrders();
  renderOverlay();
  // The map menu follows the game: refreshed between months, gone when paperwork covers the map.
  if (picked && (phase === 'orders' || phase === 'watch')) renderPick();
  else if (picked) closePick();
}

// ---------------------------------------------------------------- the clock

function stop(): void {
  window.clearTimeout(timer);
  timer = 0;
}

function schedule(): void {
  stop();
  if (phase !== 'watch' || !speed || s.run?.queue.length) return;
  timer = window.setTimeout(tick, SPEEDS[speed]);
}

function tick(): void {
  timer = 0;
  if (phase !== 'watch') return;
  map.beginStep(SPEEDS[speed] || 600);
  if (stepDay(s) === 'done') {
    endMonth(s);
    phase = s.over ? 'over' : 'paper';
    note = '';
    try {
      if (s.over) localStorage.removeItem(SAVE_KEY);
      else save();
    } catch {
      /* ignore */
    }
    render();
    return;
  }
  render();
  schedule();
}

// ---------------------------------------------------------------- input

function draft(pid: string): Job[] {
  const p = person(s, pid)!;
  return (plans[pid] ??= p.jobs.filter((j) => !j.done).map((j) => ({ ...j })));
}

function onChange(e: Event): void {
  const el = e.target as HTMLSelectElement;
  const d = el.dataset;
  if (d.branch) {
    note = assignBranch(s, 'player', d.branch as Branch, el.value) ?? '';
    advanceLessons(s);
    return render();
  }
  if (d.movehood) {
    moveHood(s, d.movehood, el.value);
    advanceLessons(s);
    return render();
  }
  if (d.add && d.key) {
    const a = (adding[d.key] ??= { kind: '', target: '' });
    if (d.add === 'kind') {
      a.kind = el.value as JobKind | '';
      a.target = a.kind && JOBS[a.kind].target !== 'none' ? (targets(s, 'player', a.kind)[0]?.id ?? '') : '';
    } else a.target = el.value;
    render();
  }
}
app.addEventListener('change', onChange);
overlay.addEventListener('change', onChange);

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  const scope = d.scope ?? 'orders';

  // Orders given from the map menu.
  if (d.pickAdd) {
    const [runner, kind, target] = d.pickAdd.split('|');
    note = addJob(s, runner, kind as JobKind, target) ? '' : 'That order could not be given.';
    advanceLessons(s);
    save();
    return render();
  }
  if (d.pickDel) {
    const [who, job] = d.pickDel.split('|');
    removeJob(s, who, job);
    save();
    return render();
  }
  if (d.act === 'pick-close') return closePick();
  if (d.mode) return setMode(d.mode as MapMode);
  if (d.fire) {
    if (firing !== d.fire) {
      firing = d.fire;
      return render();
    }
    firing = null;
    note = fireHood(s, 'player', d.fire) ?? '';
    save();
    return render();
  }
  if (firing && !d.fire) firing = null;
  if (d.idle) {
    const [who, order] = d.idle.split('|');
    const p = person(s, who);
    if (p && p.family === 'player') p.idle = order as IdleOrder;
    save();
    return render();
  }
  if (d.act === 'branches' && d.p) {
    editing = editing === d.p ? null : d.p;
    note = '';
    return render();
  }
  if (d.branchGive) {
    const [who, branch] = d.branchGive.split('|');
    const theirs = s.families.player.branches[branch as Branch] === who;
    note = assignBranch(s, 'player', branch as Branch, theirs ? s.families.player.bossId : who) ?? '';
    advanceLessons(s);
    save();
    return render();
  }

  if (d.jposture && d.p && d.j) {
    if (scope === 'plans') {
      const j = draft(d.p).find((x) => x.id === d.j);
      if (j) j.posture = d.jposture as Posture;
    } else setPosture(s, d.p, d.j, d.jposture as Posture);
    return render();
  }

  if (d.boss) {
    let a = JSON.parse(d.boss) as BossAction;
    if (d.pickreward) a = { kind: 'reward', lt: (document.getElementById('reward-lt') as HTMLSelectElement).value };
    note = bossAction(s, a);
    save();
    return render();
  }

  if (d.hire) {
    note = hireHood(s, 'player', d.hire) ?? '';
    return render();
  }

  if (d.buy) {
    note = purchase(s, 'player', d.buy as Purchase) ?? '';
    return render();
  }

  if (d.speed) {
    speed = Number(d.speed);
    render();
    return schedule();
  }

  if (d.card && d.opt) {
    const c = s.run?.queue.find((x) => x.id === Number(d.card));
    if (!answer(s, Number(d.card), d.opt)) return;
    if (c?.kind === 'fight' && !['back', 'give'].includes(d.opt) && c.focus) map.flash(c.focus);
    map.focus(null);
    if (d.opt === 'replan') {
      plans = {};
      phase = 'plans';
    }
    render();
    return schedule();
  }

  switch (d.act) {
    case 'up':
    case 'down': {
      if (scope === 'plans') {
        const list = draft(d.p!);
        const i = list.findIndex((j) => j.id === d.j);
        const k = i + (d.act === 'up' ? -1 : 1);
        if (i >= 0 && k >= 0 && k < list.length) [list[i], list[k]] = [list[k], list[i]];
      } else moveJob(s, d.p!, d.j!, d.act === 'up' ? -1 : 1);
      return render();
    }
    case 'del':
      if (scope === 'plans') plans[d.p!] = draft(d.p!).filter((j) => j.id !== d.j);
      else removeJob(s, d.p!, d.j!);
      return render();
    case 'add': {
      const key = `${scope}:${d.p}`;
      const a = adding[key];
      if (!a?.kind) return;
      const target = JOBS[a.kind].target === 'none' ? null : a.target || null;
      if (scope === 'plans') {
        const list = draft(d.p!);
        if (!list.some((j) => j.kind === a.kind && j.target === target)) list.push(draftJob(s, a.kind, target));
      } else note = addJob(s, d.p!, a.kind, target) ? '' : 'That job is already on the list.';
      adding[key] = { kind: '', target: '' };
      return render();
    }
    case 'new':
      return newGame(true);
    case 'new-nolessons':
      return newGame(false);
    case 'lessons-off':
      s.lessons.on = false;
      advanceLessons(s);
      return render();
    case 'to-work':
      phase = 'orders';
      render();
      return window.scrollTo({ top: 0 });
    case 'begin':
      startMonth(s);
      phase = 'watch';
      if (!speed) speed = 2;
      render();
      if (window.matchMedia('(max-width: 860px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
      return schedule();
    case 'plans-cancel':
      phase = 'watch';
      render();
      return schedule();
    case 'plans-go': {
      const changed: Record<string, Job[]> = {};
      for (const [id, list] of Object.entries(plans)) {
        const p = person(s, id);
        const before = p?.jobs
          .filter((j) => !j.done)
          .map((j) => `${j.id}:${j.posture}`)
          .join();
        if (p && before !== list.map((j) => `${j.id}:${j.posture}`).join()) changed[id] = list;
      }
      if (Object.keys(changed).length) changePlans(s, changed);
      phase = 'watch';
      render();
      return schedule();
    }
  }
});

document.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest('canvas')) tip.hidden = true;
  if (picked && !t.closest('canvas, #pick')) closePick();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && picked) return closePick();
  // M cycles the map modes (not while typing in a field).
  if ((e.key === 'm' || e.key === 'M') && !(e.target as HTMLElement).closest('select, input, textarea')) {
    const i = MAP_MODES.findIndex((m) => m.id === map.mode);
    setMode(MAP_MODES[(i + 1) % MAP_MODES.length].id);
    return;
  }
  if (e.code !== 'Space' || phase !== 'watch' || s.run?.queue.length) return;
  if ((e.target as HTMLElement).closest('select, button, input')) return;
  e.preventDefault();
  speed = speed ? 0 : 2;
  render();
  schedule();
});

map.onHover = (b: Building | null, p: Person | null, px: number, py: number) => {
  if ((!b && !p) || picked) {
    tip.hidden = true;
    return;
  }
  tip.innerHTML = describe(b, p);
  tip.hidden = false;
  const wrap = tip.parentElement!.getBoundingClientRect();
  tip.style.left = `${Math.max(4, Math.min(px + 14, wrap.width - 250))}px`;
  tip.style.top = `${Math.max(4, Math.min(py + 14, wrap.height - 150))}px`;
};

// ---------------------------------------------------------------- orders from the map

const ORDER_VERB: Partial<Record<JobKind, string>> = {
  signup: 'Sign them up for protection',
  beat: 'Pay off the beat cops here',
  block: 'Sign up the whole block',
  guard: 'Guard it',
  hit: 'Hit them',
  wreck: 'Wreck the back room',
  buy: 'Buy it',
  takeover: 'Take it over',
  fitout: 'Fit out a back room',
  phone: 'Put in a telephone',
};

function closePick(): void {
  picked = null;
  map.selected = null;
  map.selectedBlock = null;
  pickEl.hidden = true;
}

/** Info about what was clicked, plus the orders that make sense there (between months only). */
function renderPick(): void {
  if (!picked) return;
  const { b, p, px, py } = picked;
  let html = `<button class="ic close" data-act="pick-close" aria-label="Close">✕</button><div class="pick-info">${describe(b, p)}</div>`;
  const blk = b ? blockId(b) : null;
  if (phase === 'orders') {
    const ids = [b?.id, p && p.family === 'rival' ? p.id : undefined].filter((x): x is string => !!x);
    const orders = ids.flatMap((id) => ordersFor(s, id));
    html += orders.length ? orderRows(orders) : '<p class="hint">Nothing to order here right now.</p>';
  } else if (phase === 'watch') {
    html += '<p class="hint">Orders are given between months. Use a Change of Plans if something comes up.</p>';
  }
  // The block around it: who it pays, and (between months) the order to sign up the lot.
  if (blk) {
    const bo = phase === 'orders' ? ordersFor(s, blk) : [];
    html += `<div class="pick-block"><div class="pick-info"><b>${esc(cap(blockName(s, blk)))}</b>${blockSummary(blk)}</div>${bo.length ? orderRows(bo) : ''}</div>`;
  }
  pickEl.innerHTML = html;
  pickEl.hidden = false;
  // Keep it inside the map, next to the click.
  const wrap = pickEl.parentElement!.getBoundingClientRect();
  const w = pickEl.offsetWidth;
  const h = pickEl.offsetHeight;
  pickEl.style.left = `${Math.max(4, Math.min(px + 14, wrap.width - w - 4))}px`;
  pickEl.style.top = `${Math.max(4, Math.min(py + 14, wrap.height - h - 4))}px`;
}

/** Who a block pays: "6 homes, 2 shops · 3 pay us, 1 pays Calloway, 4 pay nobody". */
function blockSummary(id: string): string {
  const bs = blockBuildings(s, id);
  const homes = bs.filter(isHome).length;
  const n = (f: 'player' | 'rival' | null) => bs.filter((b) => holder(b) === f).length;
  const parts = [n('player') && `${n('player')} ours`, n('rival') && `${n('rival')} Calloway's`, n(null) && `${n(null)} pay nobody`].filter(
    Boolean,
  );
  const free = bs.filter((b) => !holder(b)).reduce((t, b) => t + b.protection, 0);
  return `${homes} homes, ${bs.length - homes} shops<br>${parts.join(' · ')}${free ? `<br>Up for grabs: ${money(free)} a month` : ''}${
    map.mode === 'income' ? blockBooks(bs) : map.mode === 'heat' ? blockHeatWhy(id) : ''
  }`;
}

/** On the Heat map: how hot a block is, and what moved it since last month began. */
function blockHeatWhy(id: string): string {
  const h = s.blockHeat[id] ?? 0;
  const who = (f: FamilyId | null) => (f === 'player' ? 'us' : f === 'rival' ? 'Calloway' : '');
  const rows = s.blockHeatLog
    .filter((l) => l.block === id)
    .map(
      (l) =>
        `<div class="books-row ${l.amount > 0 ? 'short' : ''}"><span>${esc(l.label)}${who(l.family) ? `<small>${esc(who(l.family))}</small>` : ''}</span><em>${signed(l.amount)}</em></div>`,
    );
  const effect =
    h >= SLOW_HEAT ? 'Jobs here take a day longer; rackets here risk raids.' : h ? 'Rackets here risk raids.' : 'No police to speak of.';
  return `<div class="books"><b>Heat ${h}</b><small>${effect}</small>${rows.join('') || '<small>Nothing new.</small>'}</div>`;
}

/** A line for the tooltip when the block around a place has police on it. */
function heatLine(b: Building): string {
  const h = heatAt(s, b);
  return h ? `Block heat ${h}${h >= SLOW_HEAT ? ': jobs here slower' : ''}<br>` : '';
}

/** On the Income map: what each of our places in a block took last month, and why any came up short. */
function blockBooks(bs: Building[]): string {
  const ours = bs.filter((b) => holder(b) === 'player').sort((a, b) => b.took - a.took);
  if (!ours.length) return '';
  const rows = ours.map((b) => {
    const l = incomeLabel(b);
    const why = shortfall(b) ?? (l.kind === 'new' ? 'new: nothing due yet' : l.kind === 'still' ? 'makes liquor for the bars' : '');
    return `<div class="books-row ${l.kind}"><span>${esc(b.name)}${why ? `<small>${esc(why)}</small>` : ''}</span><em>${esc(l.text === 'new' || l.text === 'still' ? '·' : l.text)}</em></div>`;
  });
  return `<div class="books"><b>Last month</b>${rows.join('')}</div>`;
}

/** The order buttons in the map menu. */
function orderRows(orders: ReturnType<typeof ordersFor>): string {
  return `<div class="pick-orders">${orders
    .map((o) => {
      const runner = person(s, o.runner)!;
      const who = runner.role === 'boss' ? 'you' : first(runner);
      const branch = BRANCHES.find((x) => x.id === JOBS[o.kind].branch)!.label;
      const target = building(s, o.target) ?? null;
      const extra = o.kind === 'buy' && target ? ` (${money(price(target, 'player'))})` : '';
      const title = ORDER_VERB[o.kind] ?? JOBS[o.kind].label;
      if (o.queued) {
        const q = person(s, o.queued.person)!;
        const qj = q.jobs.find((j) => j.id === o.queued!.job);
        return `<div class="po queued"><span><b>${esc(title)}</b><small>On ${esc(q.role === 'boss' ? 'your' : `${first(q)}'s`)} list${qj?.stalled ? `: ${esc(qj.stalled)}` : ''}</small></span>
              <button class="small" data-pick-del="${q.id}|${o.queued.job}">Cancel</button></div>`;
      }
      return `<div class="po"><span><b>${esc(title)}${esc(extra)}</b><small>${esc(branch)}, by ${esc(who)}.<span class="po-hint"> ${esc(JOBS[o.kind].hint)}</span></small></span>
            <button class="small" data-pick-add="${o.runner}|${o.kind}|${o.target}">Order</button></div>`;
    })
    .join('')}</div>`;
}

map.onPick = (b: Building | null, p: Person | null, px: number, py: number) => {
  if (!b && !p) return closePick();
  tip.hidden = true;
  picked = { b, p, px, py };
  map.selected = b ?? p;
  map.selectedBlock = b ? blockId(b) : null;
  renderPick();
};

/** The details shown on hover and at the top of the orders menu. */
function describe(b: Building | null, p: Person | null): string {
  let html = '';
  if (p) {
    const top = p.jobs.find((j) => !j.done && !j.stalled && j.hoods);
    html += `<b>${esc(label(p))}</b>${p.family === 'rival' ? 'Calloway Outfit' : 'Russo family'} · crew ${p.family === 'player' ? crewSize(s, p) : 'unknown'}${top && p.family === 'player' ? `<br>${esc(jobTitle(s, top))}` : ''}`;
  }
  if (b && isHome(b)) {
    const pays = b.protectedBy === 'player' ? 'Pays us protection' : b.protectedBy === 'rival' ? 'Pays Calloway protection' : 'Pays nobody';
    html += `${html ? '<hr style="border:0;border-top:1px solid #bbb;margin:6px 0">' : ''}<b>${esc(b.name)}</b>${esc(b.front)}, ${esc(streetOf(b))}<br>${pays}<br>Protection: ${money(b.protection)} a month<br>${heatLine(b)}`;
    if (holder(b) !== 'player') {
      html += onTurf(s, 'player', b, b.id)
        ? '<span class="turf near">Next to our turf: easier to sign up</span>'
        : '<span class="turf far">Off our turf: harder and slower to sign up</span>';
    }
  } else if (b) {
    const who =
      b.owner === 'player'
        ? 'Ours'
        : b.owner === 'rival'
          ? "Calloway's"
          : b.protectedBy === 'player'
            ? 'Pays us protection'
            : b.protectedBy === 'rival'
              ? 'Pays Calloway protection'
              : 'Independent';
    html += `${html ? '<hr style="border:0;border-top:1px solid #bbb;margin:6px 0">' : ''}<b>${esc(b.name)}</b>${esc(streetOf(b))}<br>${who}<br>
      ${b.racket ? `Back room: ${b.racket}${b.raided ? ' (shut by a raid)' : ''}` : `Could hold a ${b.suits}`}<br>
      ${b.owner ? '' : `Protection: ${money(b.protection)} a month<br>`}${!b.owner && b.protectedBy !== 'rival' ? `To buy: ${money(price(b, 'player'))}<br>` : ''}${b.telephone ? 'Telephone line<br>' : ''}${heatLine(b)}`;
    if (holder(b) !== 'player') {
      html += onTurf(s, 'player', b, b.id)
        ? '<span class="turf near">Next to our turf: easier to sign up</span>'
        : '<span class="turf far">Off our turf: harder and slower to sign up</span>';
    }
  }
  return html;
}

// ---------------------------------------------------------------- boot

function start(data?: Hot['data']): void {
  let restored: GameState | null = null;
  try {
    restored = data?.save ? (JSON.parse(data.save) as GameState) : null;
  } catch {
    restored = null;
  }
  s = restored ?? load() ?? createGame((Math.random() * 2 ** 31) | 0);
  phase = restored && data?.phase ? data.phase : s.over ? 'over' : s.run ? 'watch' : 'paper';
  if (phase === 'plans') phase = 'watch';
  if (phase === 'watch') speed = 0;
  render();
}

hot?.snapshot?.(() => ({ save: JSON.stringify(s), phase }));
if (hot?.ready) hot.ready(start);
else start(hot?.data);
