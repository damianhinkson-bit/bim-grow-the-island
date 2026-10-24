import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { H, SEA_R, TOWNS, W, drought, placeBlock, type BType, type State } from '@bim/sim';
import type { GameSession } from './game';
import { buildingTex, nodeTex, workerTex } from './sprites';
import { T, bakeOwnership, bakeTerrain } from './terrain';

export type Selection =
  | { kind: 'workers'; ids: Set<number> }
  | { kind: 'building'; id: number }
  | { kind: 'node'; id: number }
  | { kind: 'parish'; id: number }
  | null;
export interface View { sel: Selection; buildMode: BType | null; marks: { x: number; y: number; t: number }[] }

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LABEL_FONT = 'Figtree, system-ui, sans-serif';

export class Renderer {
  app = new Application();
  world = new Container();
  overlay = new Container();
  terrainCanvas!: HTMLCanvasElement;
  ownCanvas!: HTMLCanvasElement;
  cam = { x: 0, y: 0 };
  z = 1;
  private TS = 2;
  private terrain!: Sprite;
  private own!: Sprite;
  private below = new Graphics();
  private nodesL = new Container();
  private bldL = new Container();
  private wrkL = new Container();
  private above = new Graphics();
  private fx = new Graphics();
  private nodeSpr = new Map<number, Sprite>();
  private bSpr = new Map<number, Sprite>();
  private wSpr = new Map<number, Sprite>();
  private parishLabels: Text[] = [];
  private townLabels: Text[] = [];
  private agroLabel!: Text;
  private ownVer = -1;
  private time = 0;

  get vw() { return this.app.screen.width; }
  get vh() { return this.app.screen.height; }

  async init(game: GameSession, mount: HTMLElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    await this.app.init({ resizeTo: window, background: '#0A3478', antialias: true, resolution: dpr, autoDensity: true });
    this.app.canvas.id = 'game';
    this.app.canvas.setAttribute('aria-label', 'Map of Barbados');
    mount.prepend(this.app.canvas);
    this.TS = dpr >= 1.5 ? 2 : 1.25;
    this.app.stage.addChild(this.world, this.overlay);
    this.bldL.sortableChildren = true; this.wrkL.sortableChildren = true;
    this.world.addChild(this.below, this.nodesL, this.bldL, this.wrkL, this.above);
    this.setGame(game);
  }

  /** (Re)build everything that depends on a particular game. */
  setGame(game: GameSession) {
    const s = game.state;
    for (const m of [this.nodeSpr, this.bSpr, this.wSpr]) { m.forEach((sp) => sp.destroy()); m.clear(); }
    this.terrain?.destroy(); this.own?.destroy();
    this.parishLabels.forEach((t) => t.destroy()); this.townLabels.forEach((t) => t.destroy()); this.agroLabel?.destroy();
    this.terrainCanvas = bakeTerrain(s, this.TS);
    this.ownCanvas = bakeOwnership(s, this.TS);
    this.terrain = new Sprite(Texture.from(this.terrainCanvas)); this.terrain.width = W * T; this.terrain.height = H * T;
    this.own = new Sprite(Texture.from(this.ownCanvas)); this.own.width = W * T; this.own.height = H * T;
    this.world.addChildAt(this.terrain, 0); this.world.addChildAt(this.own, 1);
    this.ownVer = s.parishVersion;
    const label = (text: string, size: number, italic = false, weight = '800') => {
      const t = new Text({ text, style: { fontFamily: LABEL_FONT, fontSize: size, fontWeight: weight as '800', fontStyle: italic ? 'italic' : 'normal', fill: '#ffffff', stroke: { color: '#061028', width: 3, join: 'round' }, letterSpacing: italic ? 0 : 1 }, resolution: Math.min(2, window.devicePixelRatio || 1) });
      t.anchor.set(0.5); t.alpha = 0.95; this.overlay.addChild(t); return t;
    };
    this.parishLabels = s.parishes.map((p) => label(p.name.toUpperCase(), 10.5));
    this.townLabels = TOWNS.map((t) => label(t.n, 10, true, '600'));
    this.agroLabel = label('AGROCORP', 9.5);
    this.overlay.addChild(this.fx);
  }

  clampCam() {
    const ww = W * T, hh = H * T, vw = this.vw / this.z, vh = this.vh / this.z;
    this.cam.x = Math.max(-vw * 0.4, Math.min(ww - vw * 0.6, this.cam.x));
    this.cam.y = Math.max(-vh * 0.4, Math.min(hh - vh * 0.6, this.cam.y));
  }
  zoomAt(sx: number, sy: number, f: number) {
    const wx = sx / this.z + this.cam.x, wy = sy / this.z + this.cam.y;
    this.z = Math.max(0.55, Math.min(2.6, this.z * f));
    this.cam.x = wx - sx / this.z; this.cam.y = wy - sy / this.z; this.clampCam();
  }
  centerOn(tx: number, ty: number) { this.cam.x = tx * T - this.vw / this.z / 2; this.cam.y = ty * T - this.vh / this.z / 2; this.clampCam(); }

  frame(game: GameSession, view: View, dt: number) {
    const s = game.state;
    this.time += dt;
    let sx = 0, sy = 0;
    if (s.weather.stormT > 0 && !RM) { sx = (Math.random() - 0.5) * 6; sy = (Math.random() - 0.5) * 6; }
    this.world.scale.set(this.z);
    this.world.position.set(-this.cam.x * this.z + sx, -this.cam.y * this.z + sy);
    if (s.parishVersion !== this.ownVer) {
      bakeOwnership(s, this.TS, this.ownCanvas); this.own.texture.source.update(); this.ownVer = s.parishVersion;
    }
    this.drawBelow(s, view, game);
    this.syncNodes(s);
    this.syncBuildings(s);
    this.syncWorkers(game, view);
    this.drawAbove(s, view, game);
    this.drawLabels(s);
    this.drawFx(s);
  }

  private drawBelow(s: State, view: View, game: GameSession) {
    const g = this.below; g.clear();
    const sel = view.sel;
    if (sel?.kind === 'parish') {
      const p = s.parishes[sel.id]; const pts = p.poly.map((v) => v * T);
      g.poly(pts).fill({ color: 0xffffff, alpha: 0.16 }).stroke({ width: 2 / this.z, color: 0xffffff });
    }
    if (s.agro.warned && s.agro.target !== null) {
      const pts = s.parishes[s.agro.target].poly.map((v) => v * T), pulse = 0.55 + 0.45 * Math.sin(this.time * 5);
      g.poly(pts).fill({ color: 0xe2553f, alpha: 0.12 * pulse }).stroke({ width: 3 / this.z, color: 0xff6a52, alpha: pulse });
    }
    if (view.buildMode) {
      const x0 = Math.max(0, Math.floor(this.cam.x / T) - 1), y0 = Math.max(0, Math.floor(this.cam.y / T) - 1);
      const x1 = Math.min(W - 1, Math.ceil((this.cam.x + this.vw / this.z) / T) + 1), y1 = Math.min(H - 1, Math.ceil((this.cam.y + this.vh / this.z) / T) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
        if (!placeBlock(s, game.me, view.buildMode, x, y)) g.rect(x * T + 1, y * T + 1, T - 2, T - 2);
      g.fill({ color: 0xffec96, alpha: 0.22 });
    }
    const showWalls = view.buildMode === 'seawall' || (sel?.kind === 'building' && s.buildings[sel.id]?.type === 'seawall');
    if (showWalls) for (const b of Object.values(s.buildings)) if (b.type === 'seawall' && b.done)
      g.circle((b.x + 0.5) * T, (b.y + 0.5) * T, SEA_R * T).fill({ color: 0x5bc0eb, alpha: 0.08 }).stroke({ width: 1.5, color: 0x5bc0eb, alpha: 0.85 });
  }

  private syncNodes(s: State) {
    for (const n of s.nodes) {
      let sp = this.nodeSpr.get(n.id);
      if (n.amt <= 0) { if (sp) { sp.destroy(); this.nodeSpr.delete(n.id); } continue; }
      if (!sp) { sp = new Sprite(nodeTex(n.type)); sp.anchor.set(0.5, 1); this.nodesL.addChild(sp); this.nodeSpr.set(n.id, sp); }
      const sc = n.max === Infinity ? 1 : 0.65 + 0.35 * (n.amt / n.max);
      sp.width = T * sc; sp.height = T * sc;
      const bob = n.type === 'fish' && !RM ? Math.sin(this.time * 2 + n.i) * 1.5 : 0;
      sp.position.set((n.x + 0.5) * T, (n.y + 1) * T - (1 - sc) * 4 + bob);
    }
  }

  private syncBuildings(s: State) {
    const seen = new Set<number>();
    const dry = drought(s);
    for (const b of Object.values(s.buildings)) {
      seen.add(b.id);
      let sp = this.bSpr.get(b.id);
      const tex = buildingTex(b.type, b.variant, { dry: b.type === 'cistern' && dry, foundation: !b.done });
      if (!sp) { sp = new Sprite(tex); this.bldL.addChild(sp); this.bSpr.set(b.id, sp); }
      if (sp.texture !== tex) sp.texture = tex;
      sp.width = b.w * T; sp.height = b.h * T; sp.position.set(b.x * T, b.y * T); sp.zIndex = b.y;
    }
    for (const [id, sp] of this.bSpr) if (!seen.has(id)) { sp.destroy(); this.bSpr.delete(id); }
  }

  private syncWorkers(game: GameSession, view: View) {
    const s = game.state, seen = new Set<number>(), a = game.alpha;
    for (const w of Object.values(s.workers)) {
      seen.add(w.id);
      let sp = this.wSpr.get(w.id);
      if (!sp) {
        const col = s.players.find((p) => p.id === w.owner)?.color ?? '#ffffff';
        sp = new Sprite(workerTex(col)); sp.anchor.set(0.5, 0.6); sp.width = 16; sp.height = 20; this.wrkL.addChild(sp); this.wSpr.set(w.id, sp);
      }
      const p = game.prevPos(w.id) ?? w;
      const x = p.x + (w.x - p.x) * a, y = p.y + (w.y - p.y) * a;
      const moving = !!w.path?.length, bob = moving && !RM ? Math.sin(this.time * 14 + w.id) * 1.2 : 0;
      sp.position.set(x * T, y * T + bob); sp.zIndex = y;
      (sp as Sprite & { _wx?: number; _wy?: number })._wx = x; (sp as Sprite & { _wy?: number })._wy = y;
    }
    for (const [id, sp] of this.wSpr) if (!seen.has(id)) { sp.destroy(); this.wSpr.delete(id); }
    void view;
  }

  /** World position of a worker as drawn this frame (interpolated). */
  workerPos(id: number): { x: number; y: number } | null {
    const sp = this.wSpr.get(id) as (Sprite & { _wx?: number; _wy?: number }) | undefined;
    return sp && sp._wx !== undefined ? { x: sp._wx, y: sp._wy! } : null;
  }

  private drawAbove(s: State, view: View, game: GameSession) {
    const g = this.above; g.clear();
    const bar = (x: number, y: number, w: number, f: number, col: number) => {
      g.rect(x + 2, y, w - 4, 4).fill({ color: 0x000000, alpha: 0.55 });
      g.rect(x + 2, y, (w - 4) * Math.max(0, Math.min(1, f)), 4).fill(col);
    };
    for (const b of Object.values(s.buildings)) {
      const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
      if (!b.done) { bar(x, y + h - 5, w, b.progress, 0xffc726); continue; }
      if (b.pest > 0) for (let k = 0; k < 6; k++) { const an = k * 1.7 + this.time * 3; g.circle(x + 12 + Math.cos(an) * 7, y + 12 + Math.sin(an * 1.3) * 7, 1.4).fill(0x2a1a10); }
      if (b.hp < b.maxHp) { const f = b.hp / b.maxHp; bar(x, y - 5, w, f, f > 0.5 ? 0x6cc24a : f > 0.25 ? 0xffb03a : 0xe2553f); }
    }
    const sel = view.sel;
    if (sel?.kind === 'building') { const b = s.buildings[sel.id]; if (b) g.rect(b.x * T + 0.5, b.y * T + 0.5, b.w * T - 1, b.h * T - 1).stroke({ width: 2, color: 0xffffff }); }
    if (sel?.kind === 'node') { const n = s.nodes[sel.id]; if (n) g.circle((n.x + 0.5) * T, (n.y + 0.5) * T, 12).stroke({ width: 1.5, color: 0xffffff }); }
    const ids = sel?.kind === 'workers' ? sel.ids : null;
    for (const w of Object.values(s.workers)) {
      const p = this.workerPos(w.id); if (!p) continue;
      const x = p.x * T, y = p.y * T;
      if (ids?.has(w.id)) g.ellipse(x, y + 5, 8, 3.6).stroke({ width: 1.6, color: 0xffffff });
      if (w.working && !RM) {
        const an = Math.sin(this.time * 10 + w.id) * 0.9, f = w.face || 1;
        g.moveTo(x + 4 * f, y - 2).lineTo(x + (4 + Math.cos(an) * 6) * f, y - 2 - Math.sin(an) * 6).stroke({ width: 1.6, color: 0x4a3420 });
      }
      if (w.amt >= 1) g.circle(x - (w.face || 1) * 5, y - 3, 3).fill(w.carry === 'food' ? 0x6cc24a : w.carry === 'water' ? 0x5bc0eb : 0xe7e0cc).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    }
    for (const m of view.marks) g.circle(m.x * T, m.y * T, (1 - m.t / 0.7) * 10 + 4).stroke({ width: 2, color: 0xffc726, alpha: m.t / 0.7 });
    void game;
  }

  private drawLabels(s: State) {
    const toS = (tx: number, ty: number) => [(tx * T - this.cam.x) * this.z, (ty * T - this.cam.y) * this.z];
    s.parishes.forEach((p, k) => {
      const t = this.parishLabels[k], [x, y] = toS(p.lx, p.ly);
      t.position.set(x, y);
      const o = p.owner;
      const col = o === 'agro' ? '#FFB4A6' : o ? (s.players.find((q) => q.id === o)?.color ?? '#FFFFFF') : '#FFFFFF';
      if (t.style.fill !== col) t.style.fill = col;
    });
    const showTowns = this.z >= 0.6;
    TOWNS.forEach((tw, k) => { const t = this.townLabels[k]; t.visible = showTowns; if (showTowns) { const [x, y] = toS(tw.x, tw.y - tw.s * 0.62 - 0.5); t.position.set(x, y); } });
    const hq = Object.values(s.buildings).find((b) => b.type === 'hq');
    if (hq) { const [x, y] = toS(hq.x + 1, hq.y + 2); this.agroLabel.position.set(x, y + 9); this.agroLabel.style.fill = '#FFB4A6'; }
  }

  private drawFx(s: State) {
    const g = this.fx; g.clear();
    if (s.weather.stormT > 0) {
      const a = Math.min(1, s.weather.stormT / 1.5) * 0.4;
      g.rect(0, 0, this.vw, this.vh).fill({ color: 0x141e32, alpha: a });
      if (!RM) { for (let k = 0; k < 90; k++) { const rx = Math.random() * this.vw, ry = Math.random() * this.vh; g.moveTo(rx, ry).lineTo(rx - 10, ry + 18); } g.stroke({ width: 1, color: 0xc8dcff, alpha: 0.45 }); }
    } else if (drought(s)) g.rect(0, 0, this.vw, this.vh).fill({ color: 0xffaa3c, alpha: 0.08 });
  }
}
