// The ward at night. Plain grid for the vertical slice (isometric comes later),
// but it should already feel like a city after dark.

import { isLot } from '../sim/setup';
import type { Business, GameState, Lieutenant } from '../sim/types';
import { biz, dist, ltById, owned, activeLts, visibleToPlayer } from '../sim/util';

const C = {
  night: '#0f1318',
  street: '#1a2029',
  lot: '#20262f',
  lotEdge: '#2c3440',
  lamp: '#e3a23b',
  lampDeep: '#8a5a14',
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
  private raf = 0;
  showOrders = true;
  state: GameState | null = null;
  onHover: (b: Business | null, l: Lieutenant | null, px: number, py: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('mousemove', (e) => this.hover(e));
    canvas.addEventListener('mouseleave', () => this.onHover(null, null, 0, 0));
    // Touch screens have no hover: a tap shows the same details.
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') this.hover(e);
    });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Remember where everyone is before a day ticks, so moves can glide. */
  beginStep(durationMs: number): void {
    if (!this.state) return;
    this.prev.clear();
    for (const l of this.state.lts) this.prev.set(l.id, { x: l.x, y: l.y });
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
    const pad = 24;
    this.tile = Math.floor(Math.min((r.width - pad * 2) / this.state.width, (r.height - pad * 2 - 20) / this.state.height));
    this.ox = Math.round((r.width - this.tile * this.state.width) / 2);
    this.oy = Math.round((r.height - 20 - this.tile * this.state.height) / 2);
  }

  setState(s: GameState): void {
    const first = !this.state;
    this.state = s;
    if (first) this.resize();
  }

  private hover(e: MouseEvent): void {
    const s = this.state;
    if (!s) return;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const tx = Math.floor((px - this.ox) / this.tile);
    const ty = Math.floor((py - this.oy) / this.tile);
    const b = s.businesses.find((b) => b.x === tx && b.y === ty) ?? null;
    const l =
      s.lts.find((l) => l.status === 'active' && l.x === tx && l.y === ty && visibleToPlayer(s, l)) ?? null;
    this.onHover(b, l, px, py);
  }

  private loop(now: number): void {
    this.draw(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  private px(p: Pos): Pos {
    return { x: this.ox + (p.x + 0.5) * this.tile, y: this.oy + (p.y + 0.5) * this.tile };
  }

  private draw(now: number): void {
    const s = this.state;
    const g = this.ctx;
    const r = this.canvas.getBoundingClientRect();
    g.fillStyle = C.night;
    g.fillRect(0, 0, r.width, r.height);
    if (!s) return;
    const T = this.tile;

    // Visible tiles (fog of war).
    const ours = owned(s, 'player');
    const ourMen = activeLts(s, 'player');
    const seen = (x: number, y: number) =>
      ours.some((b) => dist(b, { x, y }) <= 2) || ourMen.some((l) => dist(l, { x, y }) <= 2);

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const X = this.ox + x * T;
        const Y = this.oy + y * T;
        if (!isLot(x, y)) {
          g.fillStyle = C.street;
          g.fillRect(X, Y, T, T);
          continue;
        }
        g.fillStyle = C.lot;
        g.fillRect(X + 1, Y + 1, T - 2, T - 2);
      }
    }
    // Streetlamps at the crossings.
    for (let y = 0; y < s.height; y += 3) {
      for (let x = 0; x < s.width; x += 4) {
        const c = this.px({ x, y });
        const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, T * 1.1);
        glow.addColorStop(0, 'rgba(227,162,59,0.22)');
        glow.addColorStop(1, 'rgba(227,162,59,0)');
        g.fillStyle = glow;
        g.fillRect(c.x - T * 1.1, c.y - T * 1.1, T * 2.2, T * 2.2);
        g.fillStyle = C.lamp;
        g.beginPath();
        g.arc(c.x, c.y, Math.max(1.5, T * 0.04), 0, Math.PI * 2);
        g.fill();
      }
    }

    // Shops.
    for (const b of s.businesses) this.drawShop(b, now);

    // Orders: where our people are headed.
    if (this.showOrders && !s.run) {
      g.save();
      g.setLineDash([4, 5]);
      g.lineWidth = 1.5;
      for (const l of ourMen) {
        const t = l.order.goal === 'hit' ? ltById(s, l.order.target) ?? biz(s, l.order.target) : biz(s, l.order.target);
        if (!t) continue;
        const a = this.px(l);
        const b = this.px(t);
        g.strokeStyle = l.order.goal === 'hit' ? C.blood : 'rgba(227,162,59,0.75)';
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.restore();
    }

    // Fog.
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (seen(x, y)) continue;
        g.fillStyle = C.fog;
        g.fillRect(this.ox + x * T, this.oy + y * T, T, T);
      }
    }

    // Lieutenants (rivals only where our people can see them).
    const k = Math.min(1, (now - this.animStart) / this.animDur);
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const placed = new Map<string, number>();
    for (const l of s.lts) {
      if (l.status !== 'active' || !visibleToPlayer(s, l)) continue;
      const from = this.prev.get(l.id) ?? l;
      const p = { x: from.x + (l.x - from.x) * ease, y: from.y + (l.y - from.y) * ease };
      const key = `${l.x},${l.y}`;
      const n = placed.get(key) ?? 0;
      placed.set(key, n + 1);
      const c = this.px(p);
      const ang = n * 2.1 + 0.6;
      const off = n === 0 ? 0 : T * 0.22;
      const cx = c.x + Math.cos(ang) * off;
      const cy = c.y + Math.sin(ang) * off - T * 0.08;
      const rad = Math.max(6, T * 0.17);
      g.fillStyle = l.family === 'player' ? C.lamp : C.steel;
      g.strokeStyle = C.night;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = C.night;
      g.font = `700 ${Math.round(rad * 1.05)}px Oswald, 'Arial Narrow', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l.name[0], cx, cy + 0.5);
    }

    // Focus pulse for the current telegram.
    if (this.pulse && now < this.pulse.until) {
      const c = this.px(this.pulse.at);
      const ph = ((now / 900) % 1);
      g.strokeStyle = `rgba(227,162,59,${1 - ph})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c.x, c.y, T * (0.4 + ph * 0.6), 0, Math.PI * 2);
      g.stroke();
    }

    // Hays Code violence: a flash behind the windows, nothing more.
    this.flashes = this.flashes.filter((f) => now - f.t < 1400);
    for (const f of this.flashes) {
      const c = this.px(f.at);
      const t = (now - f.t) / 1400;
      const on = Math.floor(t * 12) % 2 === 0 && t < 0.6;
      if (!on) continue;
      const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, T * 0.9);
      glow.addColorStop(0, 'rgba(255,236,190,0.9)');
      glow.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = glow;
      g.fillRect(c.x - T, c.y - T, T * 2, T * 2);
    }
  }

  private drawShop(b: Business, now: number): void {
    const g = this.ctx;
    const T = this.tile;
    const X = this.ox + b.x * T;
    const Y = this.oy + b.y * T;
    const m = Math.max(3, T * 0.1);
    const fill = b.owner === 'player' ? C.ourFill : b.owner === 'rival' ? C.theirFill : C.free;
    const edge = b.owner === 'player' ? C.lamp : b.owner === 'rival' ? C.steel : C.lotEdge;
    g.fillStyle = fill;
    g.fillRect(X + m, Y + m, T - 2 * m, T - 2 * m);
    g.strokeStyle = edge;
    g.lineWidth = b.owner ? 2 : 1;
    g.strokeRect(X + m + 0.5, Y + m + 0.5, T - 2 * m - 1, T - 2 * m - 1);

    // Lit windows: busier shops burn more lamps after dark.
    const seed = [...b.id].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7);
    const lit = b.racket ? 0.7 : b.owner ? 0.45 : 0.2;
    const w = Math.max(2, T * 0.08);
    for (let i = 0; i < 6; i++) {
      const r = ((seed * (i + 3) * 2654435761) >>> 0) / 4294967296;
      const flicker = b.racket && Math.sin(now / 700 + i * 2 + seed) > 0.96 ? 0.3 : 1;
      if (r > lit) continue;
      const wx = X + m + T * 0.12 + (i % 3) * T * 0.22;
      const wy = Y + m + T * 0.12 + Math.floor(i / 3) * T * 0.22;
      g.fillStyle = `rgba(240,200,120,${0.75 * flicker})`;
      g.fillRect(wx, wy, w, w);
    }

    // Racket letter and telephone.
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
      const s = Math.max(3, T * 0.09);
      g.fillRect(X + m + 3, Y + T - m - s - 3, s, s);
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
