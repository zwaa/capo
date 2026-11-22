// The ward at night. Plain grid for the vertical slice (isometric comes later),
// but it should already read like a city after dark:
//  - Roads are dark asphalt with lane markings; blocks are pavement with kerbs.
//  - Shops have a lit shopfront; every other lot on a block is a home (tenements, rowhouses).
//  - Turf is tinted ground in the family colour, outlined at its edge.
//    A solid border means the family owns the building; a flag means it pays them protection
//    (homes pay too, and fly a smaller flag).
//  - A block picked for orders, or with a block sign-up on it, is framed with a dashed line.
//  - Who holds what is public knowledge. Fog of war (a light hatch) only hides people:
//    rival lieutenants, crews out on jobs and guards.

import { isLot } from '../sim/setup';
import type { Building, FamilyId, GameState, Person } from '../sim/types';
import {
  BLOCK_H,
  BLOCK_W,
  JOBS,
  PATROL_REACH,
  blockCentre,
  blockXY,
  building,
  dist,
  holder,
  idleHoods,
  isBlockId,
  person,
  seenTile,
  turfAt,
  visible,
} from '../sim/util';

const C = {
  night: '#0b0e12',
  road: '#101318',
  roadLine: 'rgba(214, 200, 160, 0.28)',
  pavement: '#2a2f37',
  kerb: '#4a505a',
  brick: '#3b2d29',
  roof: '#251c19',
  homeWindow: 'rgba(240, 200, 120, 0.45)',
  shop: '#46505f',
  shopSign: '#8b93a0',
  glass: 'rgba(240, 200, 120, 0.55)',
  lamp: '#e3a23b',
  ourFill: '#6a4a1a',
  ourTurf: 'rgba(227, 162, 59, 0.16)',
  steel: '#5f9fb8',
  theirFill: '#244d60',
  theirTurf: 'rgba(95, 159, 184, 0.18)',
  ink: '#e6e1d6',
  dim: '#8d95a1',
  blood: '#c4473a',
  fog: 'rgba(5, 7, 10, 0.3)',
  hatch: 'rgba(160, 170, 185, 0.16)',
};

const famColour = (f: FamilyId) => (f === 'player' ? C.lamp : C.steel);

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
  /** The block around it, framed. */
  selectedBlock: string | null = null;

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
    const at = (x: number, y: number) => ({ X: this.ox + x * T, Y: this.oy + y * T });
    const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < s.width && y < s.height;
    const shops = new Map(s.buildings.map((b) => [`${b.x},${b.y}`, b]));

    // Roads and pavements.
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const { X, Y } = at(x, y);
        g.fillStyle = isLot(x, y) ? C.pavement : C.road;
        g.fillRect(X, Y, T, T);
      }
    }
    // Lane markings down the middle of each road, not across junctions.
    g.save();
    g.strokeStyle = C.roadLine;
    g.lineWidth = Math.max(1, T * 0.035);
    g.setLineDash([T * 0.22, T * 0.2]);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (isLot(x, y)) continue;
        const { X, Y } = at(x, y);
        const rowRoad = y % 3 === 0;
        const colRoad = x % 4 === 0;
        if (rowRoad && !colRoad) {
          g.beginPath();
          g.moveTo(X, Y + T / 2);
          g.lineTo(X + T, Y + T / 2);
          g.stroke();
        } else if (colRoad && !rowRoad) {
          g.beginPath();
          g.moveTo(X + T / 2, Y);
          g.lineTo(X + T / 2, Y + T);
          g.stroke();
        }
      }
    }
    g.restore();
    // Kerbs where a block meets the road.
    g.strokeStyle = C.kerb;
    g.lineWidth = Math.max(1.5, T * 0.04);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (!isLot(x, y)) continue;
        const { X, Y } = at(x, y);
        this.edges(x, y, (nx, ny) => inMap(nx, ny) && !isLot(nx, ny), X, Y, 0);
      }
    }

    // Turf: tinted ground, outlined where it ends.
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (!isLot(x, y)) continue;
        const f = turfAt(s, x, y);
        if (!f) continue;
        const { X, Y } = at(x, y);
        g.fillStyle = f === 'player' ? C.ourTurf : C.theirTurf;
        g.fillRect(X, Y, T, T);
        g.strokeStyle = famColour(f);
        g.lineWidth = Math.max(1.5, T * 0.04);
        this.edges(x, y, (nx, ny) => !inMap(nx, ny) || !isLot(nx, ny) || turfAt(s, nx, ny) !== f, X, Y, g.lineWidth / 2);
      }
    }

    // Streetlamps at the junctions.
    for (let y = 0; y < s.height; y += 3) {
      for (let x = 0; x < s.width; x += 4) {
        const c = this.px({ x, y });
        const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, T * 1.1);
        glow.addColorStop(0, 'rgba(227,162,59,0.16)');
        glow.addColorStop(1, 'rgba(227,162,59,0)');
        g.fillStyle = glow;
        g.fillRect(c.x - T * 1.1, c.y - T * 1.1, T * 2.2, T * 2.2);
        g.fillStyle = C.lamp;
        g.beginPath();
        g.arc(c.x, c.y, Math.max(1.5, T * 0.04), 0, Math.PI * 2);
        g.fill();
      }
    }

    // Homes on every lot that isn't a shop; then the shops.
    const boss = person(s, s.families.player.bossId);
    const bossAt = (x: number, y: number) => !!boss && boss.homeX === x && boss.homeY === y;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (isLot(x, y) && !shops.has(`${x},${y}`)) this.drawHome(x, y, bossAt(x, y), null);
      }
    }
    for (const b of s.buildings) {
      if (b.kind === 'home') this.drawHome(b.x, b.y, bossAt(b.x, b.y), b.protectedBy);
      else this.drawShop(b, now);
    }

    // Orders: dashed lines from each of our people to their one-off jobs.
    if (this.showOrders && !s.run) {
      g.save();
      g.setLineDash([4, 5]);
      g.lineWidth = 1.5;
      for (const p of s.people.filter((p) => p.family === 'player' && p.status === 'active')) {
        for (const j of p.jobs) {
          if (JOBS[j.kind].ongoing && j.kind !== 'guard') continue;
          const t = isBlockId(j.target) ? blockCentre(s, j.target) : (building(s, j.target) ?? person(s, j.target));
          if (!t) continue;
          if (isBlockId(j.target)) this.frameBlock(j.target, j.stalled ? 'rgba(141,149,161,0.5)' : 'rgba(227,162,59,0.6)', 0);
          const a = this.px({ x: p.homeX, y: p.homeY });
          const b = this.px(t);
          g.strokeStyle =
            j.kind === 'hit' || j.kind === 'takeover' || j.kind === 'wreck'
              ? C.blood
              : j.stalled
                ? 'rgba(141,149,161,0.5)'
                : 'rgba(227,162,59,0.85)';
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      }
      g.restore();
    }

    // Fog of war: a light hatch over what our people can't see. It hides people, not buildings.
    g.save();
    g.lineWidth = 1;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (seenTile(s, x, y)) continue;
        const { X, Y } = at(x, y);
        g.fillStyle = C.fog;
        g.fillRect(X, Y, T, T);
        g.save();
        g.beginPath();
        g.rect(X, Y, T, T);
        g.clip();
        g.strokeStyle = C.hatch;
        g.beginPath();
        const step = Math.max(5, T / 6);
        for (let d = -T; d < T; d += step) {
          g.moveTo(X + d, Y + T);
          g.lineTo(X + d + T, Y);
        }
        g.stroke();
        g.restore();
      }
    }
    g.restore();

    // Crews out on jobs this month (Calloway's only where we can see them).
    if (s.run) {
      for (const p of s.people) {
        if (p.status !== 'active') continue;
        for (const j of p.jobs) {
          if (j.done || j.stalled || !j.hoods) continue;
          if (JOBS[j.kind].ongoing && j.kind !== 'guard') continue;
          if (p.family === 'rival' && !seenTile(s, j.x, j.y)) continue;
          const pos = this.px(this.glide(j.id, { x: j.x, y: j.y }, now));
          g.fillStyle = famColour(p.family);
          g.strokeStyle = C.night;
          g.lineWidth = 1;
          const n = Math.min(4, j.hoods);
          for (let i = 0; i < n; i++) {
            g.beginPath();
            g.arc(pos.x - T * 0.28 + i * T * 0.13, pos.y + T * 0.3, Math.max(2, T * 0.055), 0, Math.PI * 2);
            g.fill();
            g.stroke();
          }
        }
      }
    }

    // Idle hoods walking the beat: a ring each, moving between what we hold nearby day by day.
    if (s.run) {
      for (const p of s.people) {
        if (p.status !== 'active' || p.idle !== 'patrol') continue;
        const beat = s.buildings
          .filter((b) => holder(b) === p.family && dist(b, { x: p.homeX, y: p.homeY }) <= PATROL_REACH)
          .sort((a, b) => a.id.localeCompare(b.id));
        if (!beat.length) continue;
        idleHoods(s, p).forEach((h, i) => {
          const at = beat[(s.run!.day + i * 3) % beat.length];
          if (p.family === 'rival' && !seenTile(s, at.x, at.y)) return;
          const c = this.px(at);
          g.strokeStyle = famColour(p.family);
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(c.x + T * 0.28 - i * T * 0.12, c.y - T * 0.3, Math.max(2, T * 0.05), 0, Math.PI * 2);
          g.stroke();
        });
      }
    }

    // People (Calloway's only where our people can see them).
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
      g.fillStyle = famColour(p.family);
      g.strokeStyle = C.night;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (p.role === 'boss') {
        g.strokeStyle = famColour(p.family);
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

    // The block picked for orders, then the tile: dashed frames.
    if (this.selectedBlock) this.frameBlock(this.selectedBlock, 'rgba(230,225,214,0.55)', -(now / 90) % 9);
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

  /** A dashed frame round a whole city block, just outside its kerbs. */
  private frameBlock(id: string, colour: string, dashOffset: number): void {
    const s = this.state!;
    const g = this.ctx;
    const T = this.tile;
    const { bx, by } = blockXY(id);
    const x0 = bx * BLOCK_W + 1;
    const y0 = by * BLOCK_H + 1;
    const x1 = Math.min(s.width, (bx + 1) * BLOCK_W);
    const y1 = Math.min(s.height, (by + 1) * BLOCK_H);
    const pad = Math.max(2, T * 0.12);
    g.save();
    g.strokeStyle = colour;
    g.lineWidth = 2;
    g.setLineDash([7, 5]);
    g.lineDashOffset = dashOffset;
    g.strokeRect(this.ox + x0 * T - pad, this.oy + y0 * T - pad, (x1 - x0) * T + pad * 2, (y1 - y0) * T + pad * 2);
    g.restore();
  }

  /** A flag on a building's corner, in the colour of whoever it pays (smaller for homes). */
  private drawFlag(X: number, Y: number, m: number, f: FamilyId, size: number): void {
    const g = this.ctx;
    const T = this.tile;
    const pole = X + T - m - Math.max(2, T * 0.04);
    const top = Y + m - T * 0.06;
    g.strokeStyle = C.ink;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pole, top);
    g.lineTo(pole, top + T * 0.3 * size);
    g.stroke();
    g.fillStyle = famColour(f);
    g.beginPath();
    g.moveTo(pole, top);
    g.lineTo(pole - T * 0.2 * size, top + T * 0.07 * size);
    g.lineTo(pole, top + T * 0.14 * size);
    g.closePath();
    g.fill();
  }

  /** Stroke the sides of tile (x, y) whose neighbour matches `edge`, inset by `inset` pixels. */
  private edges(x: number, y: number, edge: (nx: number, ny: number) => boolean, X: number, Y: number, inset: number): void {
    const g = this.ctx;
    const T = this.tile;
    const i = inset;
    g.beginPath();
    if (edge(x, y - 1)) {
      g.moveTo(X, Y + i);
      g.lineTo(X + T, Y + i);
    }
    if (edge(x, y + 1)) {
      g.moveTo(X, Y + T - i);
      g.lineTo(X + T, Y + T - i);
    }
    if (edge(x - 1, y)) {
      g.moveTo(X + i, Y);
      g.lineTo(X + i, Y + T);
    }
    if (edge(x + 1, y)) {
      g.moveTo(X + T - i, Y);
      g.lineTo(X + T - i, Y + T);
    }
    g.stroke();
  }

  /** A home: brick tenement or rowhouse, a few windows lit. The boss's rented room has a light on. */
  private drawHome(x: number, y: number, bossHome: boolean, pays: FamilyId | null): void {
    const g = this.ctx;
    const T = this.tile;
    const X = this.ox + x * T;
    const Y = this.oy + y * T;
    const seed = (x * 73856093) ^ (y * 19349663);
    const rnd = (k: number) => (((seed * (k + 7) * 2654435761) >>> 0) % 1000) / 1000;
    const m = T * (0.12 + rnd(1) * 0.06);
    const w = T - 2 * m;
    g.fillStyle = C.brick;
    g.fillRect(X + m, Y + m, w, w);
    g.fillStyle = C.roof;
    g.fillRect(X + m, Y + m, w, w * 0.28);
    // Windows: two rows of three, some lit.
    const ws = Math.max(2, T * 0.07);
    for (let i = 0; i < 6; i++) {
      const lit = bossHome ? i === 4 || rnd(i + 3) < 0.35 : rnd(i + 3) < 0.3;
      g.fillStyle = lit ? C.homeWindow : 'rgba(0,0,0,0.35)';
      g.fillRect(X + m + w * (0.18 + (i % 3) * 0.28), Y + m + w * (0.42 + Math.floor(i / 3) * 0.26), ws, ws);
    }
    if (bossHome) {
      g.strokeStyle = C.lamp;
      g.lineWidth = 1.5;
      g.strokeRect(X + m + 0.5, Y + m + 0.5, w - 1, w - 1);
    }
    if (pays) this.drawFlag(X, Y, m, pays, 0.75);
  }

  /** A shop: a lit shopfront and sign. Solid border = owned; flag = pays protection. */
  private drawShop(b: Building, now: number): void {
    const g = this.ctx;
    const T = this.tile;
    const X = this.ox + b.x * T;
    const Y = this.oy + b.y * T;
    const m = Math.max(3, T * 0.1);
    const w = T - 2 * m;
    const f = holder(b);
    g.fillStyle = b.owner === 'player' ? C.ourFill : b.owner === 'rival' ? C.theirFill : C.shop;
    g.fillRect(X + m, Y + m, w, w);
    // Sign board across the top, shop window across the bottom.
    g.fillStyle = b.owner ? famColour(b.owner) : C.shopSign;
    g.fillRect(X + m + w * 0.1, Y + m + w * 0.1, w * 0.8, Math.max(2, w * 0.12));
    const seed = [...b.id].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7);
    const flicker = b.racket && Math.sin(now / 700 + seed) > 0.96 ? 0.35 : 1;
    const glassH = w * 0.32;
    g.fillStyle = b.raided ? 'rgba(80,80,80,0.6)' : b.racket ? `rgba(240,200,120,${0.8 * flicker})` : C.glass;
    g.fillRect(X + m + w * 0.1, Y + m + w * 0.58, w * 0.8, glassH);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(X + m + w * 0.47, Y + m + w * 0.58, Math.max(1, w * 0.06), glassH);

    if (b.owner) {
      g.strokeStyle = famColour(b.owner);
      g.lineWidth = Math.max(2, T * 0.05);
      g.strokeRect(X + m, Y + m, w, w);
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.strokeRect(X + m + 0.5, Y + m + 0.5, w - 1, w - 1);
    }
    // A flag on the corner for whoever this shop pays (or belongs to).
    if (f) this.drawFlag(X, Y, m, f, 1);

    const label = b.racket === 'speakeasy' ? 'S' : b.racket === 'gambling' ? 'G' : b.racket === 'still' ? 'D' : '';
    if (label) {
      g.fillStyle = b.raided ? C.dim : C.ink;
      g.font = `700 ${Math.round(T * 0.26)}px Oswald, 'Arial Narrow', sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.strokeStyle = C.night;
      g.lineWidth = 3;
      g.strokeText(label, X + m + w * 0.12, Y + m + w * 0.4);
      g.fillText(label, X + m + w * 0.12, Y + m + w * 0.4);
    }
    if (b.telephone) {
      g.fillStyle = C.ink;
      const sz = Math.max(3, T * 0.08);
      g.fillRect(X + T - m - sz - w * 0.12, Y + m + w * 0.34, sz, sz);
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
