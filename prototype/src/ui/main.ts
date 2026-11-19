import './style.css';
import { answer, bossAction, canAct, changePlans, createGame, endMonth, reach, setOrder, startMonth, stepDay, stopCaptain } from '../sim/engine';
import type { BossAction } from '../sim/engine';
import { addressOf } from '../sim/setup';
import type { Business, Card, GameState, Goal, Lieutenant, Line, Order, Posture } from '../sim/types';
import {
  CAPTAIN_COST,
  HIRE_COST,
  LT_CAP,
  PHONE_COST,
  REWARD_COST,
  activeLts,
  biz,
  first,
  label,
  ltById,
  lts,
  monthName,
  needsTarget,
  owned,
  validTargets,
  visibleToPlayer,
} from '../sim/util';
import { WardMap } from './map';

// ---------------------------------------------------------------- state

type Phase = 'paper' | 'orders' | 'watch' | 'plans' | 'over';
const SAVE_KEY = 'capo-slice-v1';
const SPEEDS = [0, 1100, 550, 220];

interface Hot {
  data?: { save?: string; phase?: Phase };
  snapshot?: (fn: () => unknown) => void;
  ready?: (fn: (d: Hot['data']) => void) => void;
}
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

let s: GameState;
let phase: Phase = 'paper';
let speed = 1;
let timer = 0;
let plans: Record<string, Order> = {};
let flashNote = '';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="bar" id="bar"></header>
  <div class="main">
    <div class="mapwrap">
      <canvas id="map" aria-label="Map of the ward"></canvas>
      <div class="tip" id="tip" hidden></div>
      <div class="legend">
        <span><i style="background:#e3a23b"></i>Russo family</span>
        <span><i style="background:#5f9fb8"></i>Calloway Outfit</span>
        <span>S speakeasy · G gambling · D still · ■ telephone</span>
      </div>
    </div>
    <aside class="side" id="side"></aside>
  </div>
  <div id="overlay"></div>
`;
const bar = document.getElementById('bar')!;
const side = document.getElementById('side')!;
const overlay = document.getElementById('overlay')!;
const tip = document.getElementById('tip')!;
const map = new WardMap(document.getElementById('map') as HTMLCanvasElement);

// ---------------------------------------------------------------- helpers

const esc = (t: string | number) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

const GOALS: { id: Goal; label: string }[] = [
  { id: 'expand', label: 'Expand: take a shop' },
  { id: 'earn', label: 'Earn: work a racket' },
  { id: 'hold', label: 'Hold: guard a shop' },
  { id: 'hit', label: 'Hit: a man or a racket' },
  { id: 'recruit', label: 'Recruit hoods' },
  { id: 'lielow', label: 'Lie low' },
];
const GOAL_SHORT: Record<Goal, string> = { expand: 'Expand', earn: 'Earn', hold: 'Hold', hit: 'Hit', recruit: 'Recruit', lielow: 'Lie low' };
const TRAIT: Record<string, string> = {
  hothead: 'Hothead',
  greedy: 'Greedy',
  cautious: 'Cautious',
  ambitious: 'Ambitious',
  oldworld: 'Old-world',
  loyal: 'Loyal',
  looselips: 'Loose lips',
};

function mood(l: Lieutenant): { text: string; cls: string } {
  // Loyalty is hidden. You only get the signs.
  if (l.loyalty >= 70) return { text: 'Solid', cls: 'ok' };
  if (l.loyalty >= 45) return { text: 'Content', cls: '' };
  if (l.loyalty >= 30) return { text: 'Grumbling', cls: 'warn' };
  return { text: 'Restless', cls: 'warn' };
}

function lines(ls: Line[], empty: string): string {
  if (!ls.length) return `<p>${esc(empty)}</p>`;
  return ls.map((l) => `<div class="row"><span>${esc(l.label)}</span><em class="${l.amount < 0 ? 'neg' : ''}">${signed(l.amount)}</em></div>`).join('');
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

function newGame(): void {
  stop();
  s = createGame((Math.random() * 2 ** 31) | 0);
  map.state = null;
  map.setState(s);
  phase = 'paper';
  save();
  render();
}

// ---------------------------------------------------------------- top bar

function renderBar(): void {
  const p = s.families.player;
  const r = s.families.rival;
  const ledger = p.ledger.map((l) => ({ ...l, amount: l.amount }));
  const cashLines = ledger.map((l) => `<div class="row"><span>${esc(l.label)}</span><em class="${l.amount < 0 ? 'neg' : ''}">${money(l.amount)}</em></div>`).join('');
  bar.innerHTML = `
    <div class="logo">Capo<small>Vertical slice</small></div>
    <div class="stat"><b>${esc(monthName(s.month))}</b><span>Month ${s.month + 1} of ${s.lastMonth + 1}</span></div>
    <div class="stat explain" tabindex="0"><b>${money(p.cash)}</b><span>Cash</span>
      <div class="why"><h4>${s.run ? 'This month so far' : 'Last month'}</h4>${cashLines || '<p>No money has moved yet.</p>'}</div></div>
    <div class="stat explain" tabindex="0"><b>${p.heat}</b><span>Heat</span>
      <div class="heatbar"><i style="width:${p.heat}%"></i></div>
      <div class="why"><h4>Why the heat is ${p.heat}</h4>${lines(p.heatLog, 'Nothing new this month.')}
      <p style="margin-top:8px">High heat means raids. Raids shut rackets and catch lieutenants.</p></div></div>
    <div class="stat"><b>${owned(s, 'player').length} <span style="font-size:13px;letter-spacing:0;color:var(--dim);text-transform:none">vs</span> ${owned(s, 'rival').length}</b><span>Shops: us vs Calloway</span></div>
    <div class="stat"><b>${p.actions}</b><span>Meetings left</span></div>
    <div class="spacer"></div>
    <div class="stat" title="Calloway's heat, as the papers report it"><b style="color:var(--steel)">${r.heat}</b><span>Calloway heat</span></div>
    <button class="ghost" data-act="new">New game</button>
  `;
}

// ---------------------------------------------------------------- side panel

function orderEditor(l: Lieutenant, o: Order, scope: 'orders' | 'plans'): string {
  const targets = validTargets(s, l, o.goal);
  const tsel = needsTarget(o.goal)
    ? `<select class="target" data-scope="${scope}" data-lt="${l.id}" data-field="target" aria-label="Target for ${esc(first(l))}">
        ${targets.length ? '' : '<option value="">No valid target</option>'}
        ${targets.map((t) => `<option value="${t.id}" ${t.id === o.target ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>`
    : '';
  const postures: Posture[] = ['quiet', 'firm', 'loud'];
  return `
    <div class="order">
      <select data-scope="${scope}" data-lt="${l.id}" data-field="goal" aria-label="Goal for ${esc(first(l))}" style="grid-column:1/-1">
        ${GOALS.map((g) => `<option value="${g.id}" ${g.id === o.goal ? 'selected' : ''}>${g.label}</option>`).join('')}
      </select>
      ${tsel}
      <div class="posture" role="group" aria-label="Posture">
        ${postures.map((p) => `<button data-scope="${scope}" data-lt="${l.id}" data-posture="${p}" aria-pressed="${o.posture === p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
      </div>
    </div>`;
}

function ltCard(l: Lieutenant, editable: boolean): string {
  const m = mood(l);
  const status =
    l.status === 'active' ? '' : l.status === 'wounded' ? 'In hospital' : l.status === 'jailed' ? 'In a cell' : l.status === 'dead' ? 'Dead' : 'Gone over';
  const demand = l.demand
    ? `<div class="demand"><span>${esc(first(l))} ${esc(l.demand.text)}.${l.demand.age ? ` Waiting ${l.demand.age} month${l.demand.age > 1 ? 's' : ''}.` : ''}</span>
        ${editable ? actButton({ kind: 'grant', lt: l.id }, 'Grant it (1 meeting)') : ''}</div>`
    : '';
  return `
    <div class="lt ${l.status === 'active' ? '' : 'out'}">
      <div class="lt-head"><span class="lt-name">${esc(l.name.split(' ')[0])} <q>${esc(l.nickname)}</q> ${esc(l.name.split(' ').slice(1).join(' '))}</span>
        <span class="chip ${m.cls}" title="Loyalty is hidden. This is how they seem.">${status || m.text}</span></div>
      <div class="chips">${l.traits.map((t) => `<span class="chip">${TRAIT[t]}</span>`).join('')}</div>
      <div class="stats"><span>Muscle <b>${l.muscle}</b></span><span>Brains <b>${l.brains}</b></span><span>Nerve <b>${l.nerve}</b></span><span>Charm <b>${l.charm}</b></span><span>Crew <b>${l.crew}</b></span></div>
      <div class="meter"><span>Ambition</span><div><i style="width:${l.ambition}%"></i></div></div>
      ${demand}
      ${editable && l.status === 'active' ? orderEditor(l, l.order, 'orders') : ''}
    </div>`;
}

function actButton(a: BossAction, text: string): string {
  const why = canAct(s, a);
  return `<button class="small" data-boss='${esc(JSON.stringify(a))}' ${why ? `disabled title="${esc(why)}"` : ''}>${esc(text)}</button>`;
}

function renderOrders(): string {
  const p = s.families.player;
  const mine = lts(s, 'player');
  const shopsNoPhone = owned(s, 'player').filter((b) => !b.telephone);
  const activeMine = mine.filter((l) => l.status === 'active');
  const rivals = lts(s, 'rival');
  return `
    <section>
      <h2>Orders for ${esc(monthName(s.month))}</h2>
      <p class="hint">Give each lieutenant a goal, a target and a posture. They decide how, and personality decides how closely they listen. Dashed lines on the map show where each one is headed.</p>
    </section>
    <section><h3>Your lieutenants (${mine.length} of ${LT_CAP})</h3>${mine.map((l) => ltCard(l, true)).join('')}</section>
    <section>
      <h3>Meetings: ${p.actions} left this month</h3>
      ${flashNote ? `<p class="hint" style="color:var(--lamp)">${esc(flashNote)}</p>` : ''}
      <div class="meeting">
        <select id="phone-shop" aria-label="Shop for the telephone">${shopsNoPhone.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('') || '<option value="">Every shop has a line</option>'}</select>
        ${actButton({ kind: 'phone', biz: shopsNoPhone[0]?.id ?? '' }, `Telephone (${money(PHONE_COST)})`).replace("data-boss='", "data-phone='1' data-boss='")}
        <span class="why-not">A lieutenant at a shop with a telephone gets new orders at once during a Change of Plans.</span>
      </div>
      <div class="meeting">
        <select id="reward-lt" aria-label="Lieutenant to reward">${activeMine.map((l) => `<option value="${l.id}">${esc(label(l))}</option>`).join('')}</select>
        ${actButton({ kind: 'reward', lt: activeMine[0]?.id ?? '' }, `Envelope (${money(REWARD_COST)})`).replace("data-boss='", "data-reward='1' data-boss='")}
        <span class="why-not">Loyalty up. Cheaper than finding out the hard way.</span>
      </div>
      <div class="meeting">
        <span>${p.captainPaid ? 'Captain Hollis is on the payroll.' : 'Put Captain Hollis on the payroll'}</span>
        ${p.captainPaid ? '<button class="small" data-act="stop-captain">Stop paying</button>' : actButton({ kind: 'captain' }, `${money(CAPTAIN_COST)}/month`)}
        <span class="why-not">Halves raids and cools heat every month. Stopping makes him angry.</span>
      </div>
      <div class="meeting">
        <span>Hire a new lieutenant</span>
        ${actButton({ kind: 'hire' }, `Hire (${money(HIRE_COST)})`)}
      </div>
    </section>
    <section>
      <h3>${esc(s.families.rival.name)}</h3>
      <p class="hint">Run by ${esc(s.families.rival.boss)}. ${owned(s, 'rival').length} shops. You only see their people near your shops and your crews.</p>
      ${rivals.map((l) => `<div class="stats"><span style="color:var(--steel)">${esc(label(l))}</span><span>${l.status === 'active' ? (visibleToPlayer(s, l) ? 'in sight' : 'whereabouts unknown') : l.status === 'wounded' ? 'in hospital' : 'in a cell'}</span></div>`).join('')}
    </section>
    <section>
      <button class="primary" data-act="begin">Begin the month</button>
    </section>`;
}

function renderWatch(): string {
  const run = s.run!;
  const mine = activeLts(s, 'player');
  return `
    <section>
      <div class="clock"><b>Day ${run.day}</b><span class="hint">${esc(monthName(s.month))}</span></div>
      <div class="days"><i style="width:${(run.day / 30) * 100}%"></i></div>
      <div class="speed" role="group" aria-label="Speed">
        ${['Pause', 'Slow', 'Normal', 'Fast'].map((t, i) => `<button class="small" data-speed="${i}" aria-pressed="${speed === i}">${t}</button>`).join('')}
      </div>
      <p class="hint">Changes of Plans left: ${run.changesLeft}. Big events will stop the clock. Space bar pauses.</p>
    </section>
    <section>
      <h3>Out on the street</h3>
      ${mine
        .map((l) => {
          const op = run.ops[l.id];
          if (!op) return '';
          const t = op.goal === 'hit' ? ltById(s, op.target) ? first(ltById(s, op.target)!) : biz(s, op.target)?.name : biz(s, op.target)?.name;
          const pct = op.daysNeeded > 100 ? 100 : Math.min(100, (op.progress / op.daysNeeded) * 100);
          const pend = op.pending ? ` · runner arrives day ${op.pending.arriveDay}` : '';
          return `<div class="lt"><div class="lt-head"><span class="lt-name">${esc(first(l))}</span><span class="chip">${op.posture}</span></div>
            <span class="hint">${GOAL_SHORT[op.goal]}${t ? `: ${esc(t)}` : ''}${op.done ? ' · finished' : ''}${esc(pend)}</span>
            <div class="meter"><span>${op.daysNeeded > 100 ? 'All month' : 'Progress'}</span><div><i style="width:${pct}%"></i></div></div></div>`;
        })
        .join('')}
    </section>
    <section>
      <h3>The word</h3>
      <div class="ticker">${run.log
        .slice()
        .reverse()
        .slice(0, 14)
        .filter((e) => e.family !== 'rival' || /took|driven|hit|raid|went over|new orders|wrecked/i.test(e.text))
        .map((e) => `<p class="${e.family ?? 'none'}"><span>d${e.day}</span>${esc(e.family === 'rival' ? `Calloway: ${e.text}` : e.text)}</p>`)
        .join('') || '<p class="none"><span></span>Quiet so far.</p>'}</div>
    </section>`;
}

function renderSide(): void {
  if (phase === 'watch' || phase === 'plans') side.innerHTML = renderWatch();
  else side.innerHTML = renderOrders();
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
    <div class="opts">${c.options
      .map((o) => `<button class="opt" data-card="${c.id}" data-opt="${o.id}" ${o.disabled ? 'disabled' : ''}><b>${esc(o.label)}</b><small>${esc(o.hint)}</small></button>`)
      .join('')}</div>
  </div>`;
}

function renderEdition(): string {
  const p = s.families.player;
  const [lead, ...rest] = s.news;
  const ledger = p.ledger;
  const total = ledger.reduce((n, l) => n + l.amount, 0);
  const trouble = lts(s, 'player').filter((l) => l.demand);
  return `<div class="paper edition" role="dialog" aria-modal="true" aria-labelledby="ed-title">
    <div class="masthead">
      <div class="dateline"><span>Vol. XLI · No. ${s.month + 112}</span><span>Two cents</span></div>
      <h1 id="ed-title">The Morning Edition</h1>
      <div class="dateline"><span>${esc(monthName(s.month))}</span><span>All the news the captain allows</span></div>
    </div>
    <div class="stories">
      ${lead ? `<article class="story lead"><h2>${esc(lead.headline)}</h2><p>${esc(lead.body)}</p></article>` : ''}
      ${rest.slice(0, 4).map((n) => `<article class="story"><h2>${esc(n.headline)}</h2><p>${esc(n.body)}</p></article>`).join('')}
    </div>
    <div class="cols">
      <div class="wire"><h3>The Wire</h3>${s.wire.length ? s.wire.map((w) => `<p><em>${w.confidence}</em>${esc(w.text)}</p>`).join('') : '<p>Your informants heard nothing worth repeating.</p>'}</div>
      <div class="ledger"><h3>The Ledger</h3>${
        ledger.length
          ? ledger.map((l) => `<p><span>${esc(l.label)}</span><em>${money(l.amount)}</em></p>`).join('') + `<p class="total"><span>Net</span><em>${money(total)}</em></p>`
          : `<p>Uncle Aldo left ${money(p.cash)} in the coffee tin and a ledger nobody can read.</p>`
      }</div>
      <div class="trouble"><h3>Trouble at home</h3>${
        trouble.length ? trouble.map((l) => `<p>${esc(label(l))} ${esc(l.demand!.text)}.</p>`).join('') : '<p>Nobody is asking for anything. Yet.</p>'
      }${s.month === 0 ? '<p>Calloway runs the east end of the ward. You have the café, a barber shop and three of Aldo\'s people.</p>' : ''}</div>
    </div>
    <button class="primary go" data-act="to-work">To work</button>
  </div>`;
}

function renderPlans(): string {
  const mine = activeLts(s, 'player');
  return `<div class="paper plans" role="dialog" aria-modal="true" aria-labelledby="plans-title">
    <h2 id="plans-title">Change of Plans</h2>
    <p class="hint" style="color:var(--paper-dim)">New orders only reach a lieutenant as fast as the message can. Anyone at a shop with a telephone hears now. Anyone else waits for a runner. Unchanged orders cost nothing.</p>
    <div class="grid">${mine
      .map((l) => {
        const r = reach(s, l.id);
        const o = plans[l.id] ?? l.order;
        return `<div class="lt"><div class="lt-head"><span class="lt-name">${esc(label(l))}</span></div>
          <span class="reach ${r.kind}">${esc(r.text)}</span>
          ${r.kind === 'phone' || r.kind === 'runner' ? orderEditor(l, o, 'plans') : ''}</div>`;
      })
      .join('')}</div>
    <div class="row"><button class="small" data-act="plans-cancel">Never mind</button><button class="primary" data-act="plans-go">Send the orders</button></div>
  </div>`;
}

function renderOver(): string {
  const o = s.over!;
  const verdict = o.result === 'win' ? 'The ward is yours' : o.result === 'loss' ? 'The family is finished' : 'A stalemate';
  return `<div class="paper over" role="dialog" aria-modal="true" aria-labelledby="over-title">
    <div class="masthead"><div class="dateline"><span>Final edition</span><span>${esc(monthName(Math.min(s.month, s.lastMonth)))}</span></div></div>
    <h1 id="over-title">${esc(o.headline)}</h1>
    <p>${esc(o.text)}</p>
    <p class="verdict">${verdict}</p>
    <button class="primary" data-act="new">Play again in a new city</button>
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
  overlay.innerHTML = html ? `<div class="overlay">${html}</div>` : '';
  const btn = overlay.querySelector<HTMLButtonElement>('.opt:not(:disabled), .primary');
  btn?.focus({ preventScroll: true });
}

function render(): void {
  map.setState(s);
  map.showOrders = phase === 'orders';
  renderBar();
  renderSide();
  renderOverlay();
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
  const r = stepDay(s);
  if (r === 'done') {
    endMonth(s);
    phase = s.over ? 'over' : 'paper';
    flashNote = '';
    if (!s.over) save();
    else
      try {
        localStorage.removeItem(SAVE_KEY);
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

function editOrder(scope: string, ltId: string, patch: Partial<Order>): void {
  const l = ltById(s, ltId);
  if (!l) return;
  const cur = scope === 'plans' ? plans[ltId] ?? { ...l.order } : { ...l.order };
  const next: Order = { ...cur, ...patch };
  if (patch.goal) {
    const t = validTargets(s, l, patch.goal);
    next.target = needsTarget(patch.goal) ? (t.find((x) => x.id === cur.target)?.id ?? t[0]?.id ?? null) : null;
  }
  if (scope === 'plans') plans[ltId] = next;
  else setOrder(s, ltId, next);
  render();
}

app.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  const { scope, lt, field } = el.dataset;
  if (scope && lt && field) editOrder(scope, lt, { [field]: el.value || null } as Partial<Order>);
});

overlay.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  const { scope, lt, field } = el.dataset;
  if (scope && lt && field) editOrder(scope, lt, { [field]: el.value || null } as Partial<Order>);
});

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!el || el.disabled) return;
  const d = el.dataset;

  if (d.posture && d.lt && d.scope) return editOrder(d.scope, d.lt, { posture: d.posture as Posture });

  if (d.boss) {
    let a = JSON.parse(d.boss) as BossAction;
    if (d.phone) a = { kind: 'phone', biz: (document.getElementById('phone-shop') as HTMLSelectElement).value };
    if (d.reward) a = { kind: 'reward', lt: (document.getElementById('reward-lt') as HTMLSelectElement).value };
    flashNote = bossAction(s, a);
    save();
    return render();
  }

  if (d.speed) {
    speed = Number(d.speed);
    render();
    return schedule();
  }

  if (d.card && d.opt) {
    const c = s.run?.queue.find((x) => x.id === Number(d.card));
    const done = answer(s, Number(d.card), d.opt);
    if (!done) return;
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
    case 'new':
      return newGame();
    case 'to-work':
      phase = 'orders';
      return render();
    case 'begin':
      startMonth(s);
      phase = 'watch';
      if (!speed) speed = 2;
      render();
      return schedule();
    case 'stop-captain':
      stopCaptain(s);
      return render();
    case 'plans-cancel':
      // Changing your mind is free: the Change of Plans is only spent when orders go out.
      phase = 'watch';
      render();
      return schedule();
    case 'plans-go': {
      const changed: Record<string, Order> = {};
      for (const [id, o] of Object.entries(plans)) {
        const l = ltById(s, id);
        if (l && JSON.stringify(l.order) !== JSON.stringify(o)) changed[id] = o;
      }
      if (Object.keys(changed).length) changePlans(s, changed);
      phase = 'watch';
      render();
      return schedule();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || phase !== 'watch' || s.run?.queue.length) return;
  if ((e.target as HTMLElement).closest('select, button')) return;
  e.preventDefault();
  speed = speed ? 0 : 2;
  render();
  schedule();
});

map.onHover = (b: Business | null, l: Lieutenant | null, px: number, py: number) => {
  if (!b && !l) {
    tip.hidden = true;
    return;
  }
  let html = '';
  if (l) {
    const op = s.run?.ops[l.id];
    html += `<b>${esc(label(l))}</b>${l.family === 'rival' ? 'Calloway Outfit' : 'Russo family'} · crew ${l.crew}${op && l.family === 'player' ? `<br>${GOAL_SHORT[op.goal]}` : ''}`;
  }
  if (b) {
    const who = b.owner === 'player' ? 'Ours' : b.owner === 'rival' ? 'Calloway' : 'Independent';
    const mgr = ltById(s, b.managedBy);
    html += `${html ? '<hr style="border:0;border-top:1px solid #bbb;margin:6px 0">' : ''}<b>${esc(b.name)}</b>${esc(addressOf(b))}<br>${who}${mgr && b.owner === mgr.family ? `, run by ${esc(first(mgr))}` : ''}<br>
      ${b.racket ? `Back room: ${b.racket}${b.raided ? ' (shut by a raid)' : ''}` : `Could hold a ${b.suits}`}<br>
      Pays ${money(b.protection)}/month protection${b.telephone ? '<br>Telephone line' : ''}`;
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const wrap = tip.parentElement!.getBoundingClientRect();
  tip.style.left = `${Math.min(px + 14, wrap.width - 250)}px`;
  tip.style.top = `${Math.min(py + 14, wrap.height - 130)}px`;
};

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
  map.setState(s);
  render();
  if (phase === 'watch') {
    speed = 0;
    render();
  }
}

hot?.snapshot?.(() => ({ save: JSON.stringify(s), phase }));
if (hot?.ready) hot.ready(start);
else start(hot?.data);
