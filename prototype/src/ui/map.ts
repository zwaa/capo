// The ward at night. Plain grid for the vertical slice (isometric comes later),
// but it should already feel like a city after dark.
//  - Owned buildings are filled in the family colour.
//  - Shops that only pay protection get a coloured awning stripe.
//  - Squads out on a job show as small dots; guards as dots on the door.

import { isLot } from '../sim/setup';
import type { Building, GameState, Person } from '../sim/types';
import { JOBS, building, person, seenTile, visible } from '../sim/util';

const C = {
  night: '#0f1318',
  street: '#1a2029',
  lot: '#20262f',
  lotEdge: '#2c3440',
  lamp: '#e3a23b',
  ourFill: '#3a2a12',
  steel: '#5f9fb8',
  theirFill: '#16303b',
  free: '#2a313c',
  ink: '#e6e1d6',
  dim: '#8d95a1',
  blood: '#c4473a',
  fog: 'rgba(6, 8, 11, 0.62)',
};

interface Pos {
  x: number;
  y: number;
}

export class WardMap {
  private ctx: CanvasRenderingContext2D;
  private tile = 40;
  private ox = 0;
  private oy = 0;
  private prev = new Map<string, Pos>();
  private animStart = 0;
  private animDur = 1;
  private pulse: { at: Pos; until: number } | null = null;
  private flashes: { at: Pos; t: number }[] = [];
  raf = 0;
  showOrders = true;
  state: GameState | null = null;
  onHover: (b: Building | null, p: Person | null, px: number, py: number) => void = () => {};
  /** A click or tap on the map (b and p are null for an empty spot). */
  onPick: (b: Building | null, p: Person | null, px: number, py: number) => void = () => {};
  /** The tile picked for orders, outlined on the map. */
  selected: Pos | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('mousemove', (e) => {
      const h = this.hit(e);
      if (h) this.onHover(h.b, h.p, h.px, h.py);
    });
    canvas.addEventListener('mouseleave', () => this.onHover(null, null, 0, 0));
    // A click (or a tap, on touch screens) picks what's there.
    canvas.addEventListener('click', (e) => {
      const h = this.hit(e);
      if (h) this.onPick(h.b, h.p, h.px, h.py);
    });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Remember where everyone is before a day ticks, so moves can glide. */
  beginStep(durationMs: number): void {
    if (!this.state) return;
    this.prev.clear();
    for (const p of this.state.people) {
      this.prev.set(p.id, { x: p.x, y: p.y });
      for (const j of p.jobs) this.prev.set(j.id, { x: j.x, y: j.y });
    }
    this.animStart = performance.now();
    this.animDur = Math.max(1, durationMs * 0.85);
  }

  focus(at: Pos | null): void {
    this.pulse = at ? { at, until: performance.now() + 4000 } : null;
  }

  flash(at: Pos): void {
    this.flashes.push({ at, t: performance.now() });
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.state) return;
    const pad = 20;
    this.tile = Math.max(8, Math.floor(Math.min((r.width - pad * 2) / this.state.width, (r.height - pad * 2 - 18) / this.state.height)));
    this.ox = Math.round((r.width - this.tile * this.state.width) / 2);
    this.oy = Math.round((r.height - 18 - this.tile * this.state.height) / 2);
  }

  setState(s: GameState): void {
    const first = this.state !== s;
    this.state = s;
    if (first) this.resize();
  }

  /** What's under the pointer: a building and/or a visible person, in canvas pixels. */
  private hit(e: MouseEvent): { b: Building | null; p: Person | null; px: number; py: number } | null {
    const s = this.state;
    if (!s) return null;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const tx = Math.floor((px - this.ox) / this.tile);
    const ty = Math.floor((py - this.oy) / this.tile);
    const b = s.buildings.find((b) => b.x === tx && b.y === ty) ?? null;
    const p = s.people.find((p) => p.status === 'active' && p.x === tx && p.y === ty && visible(s, p)) ?? null;
    return { b, p, px, py };
  }

  private loop(now: number): void {
    this.draw(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  private px(p: Pos): Pos {
    return { x: this.ox + (p.x + 0.5) * this.tile, y: this.oy + (p.y + 0.5) * this.tile };
  }

  private glide(id: string, to: Pos, now: number): Pos {
    const from = this.prev.get(id) ?? to;
    const k = Math.min(1, (now - this.animStart) / this.animDur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
  }

  private draw(now: number): void {
    const s = this.state;
    const g = this.ctx;
    const r = this.canvas.getBoundingClientRect();
    g.fillStyle = C.night;
    g.fillRect(0, 0, r.width, r.height);
    if (!s) return;
    const T = this.tile;

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const X = this.ox + x * T;
        const Y = this.oy + y * T;
        g.fillStyle = isLot(x, y) ? C.lot : C.street;
        if (isLot(x, y)) g.fillRect(X + 1, Y + 1, T - 2, T - 2);
        else g.fillRect(X, Y, T, T);
      }
    }
    for (let y = 0; y < s.height; y += 3) {
      for (let x = 0; x < s.width; x += 4) {
        const c = this.px({ x, y });
        const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, T * 1.1);
        glow.addColorStop(0, 'rgba(227,162,59,0.2)');
        glow.addColorStop(1, 'rgba(227,162,59,0)');
        g.fillStyle = glow;
        g.fillRect(c.x - T * 1.1, c.y - T * 1.1, T * 2.2, T * 2.2);
        g.fillStyle = C.lamp;
        g.beginPath();
        g.arc(c.x, c.y, Math.max(1.5, T * 0.04), 0, Math.PI * 2);
        g.fill();
      }
    }

    // The boss's rented room.
    const boss = person(s, s.families.player.bossId);
    if (boss) {
      const X = this.ox + boss.homeX * T;
      const Y = this.oy + boss.homeY * T;
      const m = T * 0.28;
      g.fillStyle = '#2b2418';
      g.fillRect(X + m, Y + m, T - 2 * m, T - 2 * m);
      g.fillStyle = 'rgba(240,200,120,0.85)';
      g.fillRect(X + T / 2 - 2, Y + T / 2 - 2, 4, 4);
    }

    for (const b of s.buildings) this.drawBuilding(b, now);

    // Orders: dashed lines from each of our people to their one-off jobs.
    if (this.showOrders && !s.run) {
      g.save();
      g.setLineDash([4, 5]);
      g.lineWidth = 1.5;
      for (const p of s.people.filter((p) => p.family === 'player' && p.status === 'active')) {
        for (const j of p.jobs) {
          if (JOBS[j.kind].ongoing && j.kind !== 'guard') continue;
          const t = building(s, j.target) ?? person(s, j.target);
          if (!t) continue;
          const a = this.px({ x: p.homeX, y: p.homeY });
          const b = this.px(t);
          g.strokeStyle =
            j.kind === 'hit' || j.kind === 'takeover' || j.kind === 'wreck'
              ? C.blood
              : j.stalled
                ? 'rgba(141,149,161,0.5)'
                : 'rgba(227,162,59,0.75)';
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      }
      g.restore();
    }

    // Squads out on jobs this month.
    if (s.run) {
      for (const p of s.people) {
        if (p.status !== 'active') continue;
        for (const j of p.jobs) {
          if (j.done || j.stalled || !j.hoods) continue;
          if (JOBS[j.kind].ongoing && j.kind !== 'guard') continue;
          if (p.family === 'rival' && !seenTile(s, j.x, j.y)) continue;
          const at = this.px(this.glide(j.id, { x: j.x, y: j.y }, now));
          g.fillStyle = p.family === 'player' ? C.lamp : C.steel;
          const n = Math.min(4, j.hoods);
          for (let i = 0; i < n; i++) {
            g.beginPath();
            g.arc(at.x - T * 0.28 + i * T * 0.13, at.y + T * 0.3, Math.max(1.6, T * 0.05), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }

    // Fog.
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (seenTile(s, x, y)) continue;
        g.fillStyle = C.fog;
        g.fillRect(this.ox + x * T, this.oy + y * T, T, T);
      }
    }

    // People (rivals only where our people can see them).
    const placed = new Map<string, number>();
    for (const p of s.people) {
      if (p.status !== 'active' || !visible(s, p)) continue;
      const pos = this.glide(p.id, p, now);
      const key = `${p.x},${p.y}`;
      const n = placed.get(key) ?? 0;
      placed.set(key, n + 1);
      const c = this.px(pos);
      const ang = n * 2.1 + 0.6;
      const off = n === 0 ? 0 : T * 0.22;
      const cx = c.x + Math.cos(ang) * off;
      const cy = c.y + Math.sin(ang) * off - T * 0.08;
      const rad = Math.max(6, T * (p.role === 'boss' ? 0.2 : 0.16));
      g.fillStyle = p.family === 'player' ? C.lamp : C.steel;
      g.strokeStyle = C.night;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (p.role === 'boss') {
        g.strokeStyle = p.family === 'player' ? C.lamp : C.steel;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cx, cy, rad + 3, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = C.night;
      g.font = `700 ${Math.round(rad * 1.05)}px Oswald, 'Arial Narrow', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.name[0], cx, cy + 0.5);
    }

    // The tile picked for orders: a dashed frame.
    if (this.selected) {
      g.save();
      g.strokeStyle = C.ink;
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.lineDashOffset = -(now / 60) % 9;
      g.strokeRect(this.ox + this.selected.x * T + 1, this.oy + this.selected.y * T + 1, T - 2, T - 2);
      g.restore();
    }

    if (this.pulse && now < this.pulse.until) {
      const c = this.px(this.pulse.at);
      const ph = (now / 900) % 1;
      g.strokeStyle = `rgba(227,162,59,${1 - ph})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c.x, c.y, T * (0.4 + ph * 0.6), 0, Math.PI * 2);
      g.stroke();
    }

    // Hays Code violence: a flash behind the windows, nothing more.
    this.flashes = this.flashes.filter((f) => now - f.t < 1400);
    for (const f of this.flashes) {
      const t = (now - f.t) / 1400;
      if (Math.floor(t * 12) % 2 !== 0 || t > 0.6) continue;
      const c = this.px(f.at);
      const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, T * 0.9);
      glow.addColorStop(0, 'rgba(255,236,190,0.9)');
      glow.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = glow;
      g.fillRect(c.x - T, c.y - T, T * 2, T * 2);
    }
  }

  private drawBuilding(b: Building, now: number): void {
    const g = this.ctx;
    const T = this.tile;
    const X = this.ox + b.x * T;
    const Y = this.oy + b.y * T;
    const m = Math.max(3, T * 0.1);
    const w = T - 2 * m;
    g.fillStyle = b.owner === 'player' ? C.ourFill : b.owner === 'rival' ? C.theirFill : C.free;
    g.fillRect(X + m, Y + m, w, w);
    if (b.owner) {
      g.strokeStyle = b.owner === 'player' ? C.lamp : C.steel;
      g.lineWidth = 2;
      g.strokeRect(X + m + 0.5, Y + m + 0.5, w - 1, w - 1);
    } else {
      g.strokeStyle = C.lotEdge;
      g.lineWidth = 1;
      g.strokeRect(X + m + 0.5, Y + m + 0.5, w - 1, w - 1);
    }
    // Protection: an awning stripe across the top in the family colour.
    if (b.protectedBy && !b.owner) {
      g.fillStyle = b.protectedBy === 'player' ? C.lamp : C.steel;
      const stripes = 4;
      const sw = w / (stripes * 2 - 1);
      for (let i = 0; i < stripes; i++) g.fillRect(X + m + i * sw * 2, Y + m, sw, Math.max(3, T * 0.09));
    }

    const seed = [...b.id].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7);
    const lit = b.racket ? 0.75 : b.owner ? 0.5 : b.protectedBy ? 0.35 : 0.2;
    const ws = Math.max(2, T * 0.08);
    for (let i = 0; i < 6; i++) {
      const rr = ((seed * (i + 3) * 2654435761) >>> 0) / 4294967296;
      if (rr > lit) continue;
      const flicker = b.racket && Math.sin(now / 700 + i * 2 + seed) > 0.96 ? 0.3 : 1;
      g.fillStyle = `rgba(240,200,120,${0.75 * flicker})`;
      g.fillRect(X + m + T * 0.12 + (i % 3) * T * 0.22, Y + m + T * 0.18 + Math.floor(i / 3) * T * 0.22, ws, ws);
    }

    const label = b.racket === 'speakeasy' ? 'S' : b.racket === 'gambling' ? 'G' : b.racket === 'still' ? 'D' : '';
    if (label) {
      g.fillStyle = b.raided ? C.dim : C.ink;
      g.font = `700 ${Math.round(T * 0.26)}px Oswald, 'Arial Narrow', sans-serif`;
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText(label, X + T - m - 3, Y + T - m - 2);
    }
    if (b.telephone) {
      g.fillStyle = b.owner === 'rival' ? C.steel : C.lamp;
      const sz = Math.max(3, T * 0.09);
      g.fillRect(X + m + 3, Y + T - m - sz - 3, sz, sz);
    }
    if (b.raided) {
      g.strokeStyle = C.blood;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(X + m, Y + m);
      g.lineTo(X + T - m, Y + T - m);
      g.stroke();
    }
  }
}
