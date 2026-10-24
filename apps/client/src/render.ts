import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { H, SEA_R, TOWNS, W, drought, placeBlock, player, roadNetwork, roadOwner, type BType, type State } from '@bim/sim';
import type { GameSession } from './game';
import { buildingTex, nodeTex, workerTex } from './sprites';
import { T, bakeOwnership, bakeTerrain } from './terrain';

export type Selection =
  | { kind: 'workers'; ids: Set<number> }
  | { kind: 'building'; id: number }
  | { kind: 'node'; id: number }
  | { kind: 'parish'; id: number }
  | null;
export interface View { sel: Selection; buildMode: BType | null; marks: { x: number; y: number; t: number }[]; roadMode: boolean; roadDraft: Set<number> }

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
  /** Ownership colours are soft fills and lines, so a lower resolution is fine and saves memory. */
  private ownTS = 1;
  private terrain!: Sprite;
  private own!: Sprite;
  private below = new Graphics();
  private roadG = new Graphics();
  private roadVer = '';
  private particles: { x: number; y: number; vx: number; vy: number; life: number; c: number }[] = [];
  private landmarkLabels: { type: 'port' | 'airport'; t: Text }[] = [];
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

  /** Called if the phone's graphics memory gives out, so the game can say so instead of showing a black screen. */
  onContextLost?: () => void;
  private maxTexture(): number {
    try {
      const gl = (this.app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
      return gl ? Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 2048;
    } catch { return 2048; }
  }
  get vw() { return this.app.screen.width; }
  get vh() { return this.app.screen.height; }

  async init(game: GameSession, mount: HTMLElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // keep GPU memory modest: phones crash and reload the page when a tab uses too much
    await this.app.init({ preference: 'webgl', resizeTo: window, background: '#0A3478', antialias: false, resolution: dpr, autoDensity: true, powerPreference: 'low-power' });
    this.app.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost?.(); });
    this.app.canvas.id = 'game';
    this.app.canvas.setAttribute('aria-label', 'Map of Barbados');
    mount.prepend(this.app.canvas);
    // The island map is painted once into a big image. Cap its longest side so it fits every phone's memory and
    // texture limits: 2048 px normally, 1536 px on phones that report 4 GB of RAM or less.
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const maxGpu = this.maxTexture();
    const maxSide = Math.min(maxGpu, mem <= 4 ? 1536 : 2048);
    this.TS = Math.min(dpr >= 1.5 ? 2 : 1.25, maxSide / (Math.max(W, H) * T));
    this.ownTS = Math.min(1, this.TS);
    this.app.stage.addChild(this.world, this.overlay);
    this.bldL.sortableChildren = true; this.wrkL.sortableChildren = true;
    this.world.addChild(this.roadG, this.below, this.nodesL, this.bldL, this.wrkL, this.above);
    this.setGame(game);
  }

  /** (Re)build everything that depends on a particular game. */
  setGame(game: GameSession) {
    const s = game.state;
    for (const m of [this.nodeSpr, this.bSpr, this.wSpr]) { m.forEach((sp) => sp.destroy()); m.clear(); }
    this.terrain?.destroy(); this.own?.destroy();
    this.parishLabels.forEach((t) => t.destroy()); this.townLabels.forEach((t) => t.destroy()); this.agroLabel?.destroy();
    this.terrainCanvas = bakeTerrain(s, this.TS);
    this.ownCanvas = bakeOwnership(s, this.ownTS);
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
    this.landmarkLabels.forEach((l) => l.t.destroy());
    this.landmarkLabels = (['port', 'airport'] as const).map((type) => ({ type, t: label(type === 'port' ? 'PORT' : 'AIRPORT', 9.5) }));
    this.roadVer = '';
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
      bakeOwnership(s, this.ownTS, this.ownCanvas); this.own.texture.source.update(); this.ownVer = s.parishVersion;
    }
    const rv = `${s.roadVersion}:${s.players.map((p) => p.age).join('')}`;
    if (rv !== this.roadVer) { this.drawRoads(s); this.roadVer = rv; }
    this.tickParticles(dt);
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
    if (view.roadMode) {
      // every road in pale, the part your buildings connect to in gold, and the tiles being drawn now
      const net = roadNetwork(s, game.me);
      for (let i = 0; i < W * H; i++) if (s.roads[i] && !net[i]) g.rect((i % W) * T + 3, ((i / W) | 0) * T + 3, T - 6, T - 6);
      g.fill({ color: 0xffffff, alpha: 0.28 });
      for (let i = 0; i < W * H; i++) if (net[i]) g.rect((i % W) * T + 3, ((i / W) | 0) * T + 3, T - 6, T - 6);
      g.fill({ color: 0xffc726, alpha: 0.45 });
      for (const i of view.roadDraft) g.rect((i % W) * T + 2, ((i / W) | 0) * T + 2, T - 4, T - 4);
      g.fill({ color: 0xeadfbe, alpha: 0.9 });
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

  /** Roads players have built, styled by the builder's age: dirt tracks, then coral stone, then paved. Highways are painted into the terrain. */
  private drawRoads(s: State) {
    const g = this.roadG; g.clear();
    const R = (i: number) => s.roads[i] > 0;
    const styles = [
      { test: (a: number) => a <= 2, edge: 0x5c4326, top: 0xc9a66b, w: 0.15 },
      { test: (a: number) => a === 3, edge: 0x3c301c, top: 0xeadfbe, w: 0.17 },
      { test: (a: number) => a >= 4, edge: 0x22252a, top: 0x4a4f57, w: 0.2 },
    ];
    const links = (i: number, fn: (x0: number, y0: number, x1: number, y1: number) => void) => {
      const tx = i % W, ty = (i / W) | 0, x = tx + 0.5, y = ty + 0.5;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !R(ny * W + nx)) continue;
        // join diagonally only when there's no straight route round the corner
        if (dx && dy && (R(ty * W + nx) || R(ny * W + tx))) continue;
        fn(x * T, y * T, (x + dx * 0.5) * T, (y + dy * 0.5) * T);
      }
    };
    for (const st of styles) {
      const tiles: number[] = [];
      for (let i = 0; i < W * H; i++) if (s.roads[i] >= 2 && st.test(roadOwner(s, i)?.age ?? 3)) tiles.push(i);
      if (!tiles.length) continue;
      for (const i of tiles) links(i, (a, b, c, d) => g.moveTo(a, b).lineTo(c, d));
      g.stroke({ width: (st.w * 2) * T, color: st.edge, alpha: 0.3, cap: 'round' });
      for (const i of tiles) g.circle((i % W + 0.5) * T, ((i / W | 0) + 0.5) * T, st.w * T);
      g.fill({ color: st.top });
      for (const i of tiles) links(i, (a, b, c, d) => g.moveTo(a, b).lineTo(c, d));
      g.stroke({ width: st.w * 2 * T, color: st.top, cap: 'round' });
    }
  }

  /** A burst of flag-coloured confetti from each of a player's buildings, for an age-up. */
  celebrate(s: State, owner: string) {
    const cols = [0x00267f, 0xffc726, 0x6cc24a, 0xffffff];
    for (const b of Object.values(s.buildings)) {
      if (b.owner !== owner || !b.done) continue;
      const cx = (b.x + b.w / 2) * T, cy = (b.y + b.h / 2) * T;
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60;
        this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, life: 1.6 + Math.random() * 0.8, c: cols[k % cols.length] });
      }
    }
  }
  private tickParticles(dt: number) {
    if (RM) { this.particles = []; return; }
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.vx *= 0.98; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
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
      const tex = buildingTex(b.type, b.variant, { dry: b.type === 'cistern' && dry, foundation: !b.done, age: player(s, b.owner)?.age ?? 3 });
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
      const owner = player(s, w.owner), tex = workerTex(owner?.color ?? '#ffffff', owner?.age ?? 3);
      if (!sp) { sp = new Sprite(tex); sp.anchor.set(0.5, 0.6); this.wrkL.addChild(sp); this.wSpr.set(w.id, sp); }
      if (sp.texture !== tex) sp.texture = tex;
      sp.width = 16; sp.height = 20;
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
    for (const p of this.particles) g.rect(p.x - 1.6, p.y - 1.6, 3.2, 3.2).fill({ color: p.c, alpha: Math.min(1, p.life * 1.5) });
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
    for (const l of this.landmarkLabels) {
      const b = Object.values(s.buildings).find((q) => q.type === l.type);
      if (b) { const [x, y] = toS(b.x + 1, b.y + 2); l.t.position.set(x, y + 9); l.t.style.fill = '#CFE8FF'; }
    }
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
