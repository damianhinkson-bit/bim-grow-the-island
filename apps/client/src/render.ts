import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  AGRO, AGRO_HOME, AGRO_SLOT, BT, DT, IH, IW, LANDMARK_PARISH, SEA_R, TC_LOCAL, TOWN, TOWN_SLOTS, W, drought, placeBlock, player, roadOwner, toT, townOrigin,
  type BType, type Landmark, type State,
} from '@bim/sim';
import type { GameSession } from './game';
import { PX, buildingTex, drawCane, drawGround, drawPath, nodeTex, workerTex } from './pixel';
import { IT, bakeOwnership, bakeTerrain } from './terrain';

/** World pixels per town tile (one art pixel per world pixel). */
const TOWN_SEA = 0x1e7fb8, ISLAND_SEA = 0x0a3478;
export const T = PX;

export type Selection =
  | { kind: 'workers'; ids: Set<number> }
  | { kind: 'building'; id: number }
  | { kind: 'node'; id: number }
  | { kind: 'parish'; id: number }
  | { kind: 'player'; id: string }
  | { kind: 'landmark'; id: Landmark }
  | null;
export interface View { sel: Selection; buildMode: BType | null; marks: { x: number; y: number; t: number }[]; roadMode: boolean; roadDraft: Set<number> }
/** What's under a tap on the island view. */
export type IslandHit = { kind: 'town'; pid: string } | { kind: 'estate' } | { kind: 'landmark'; type: Landmark } | { kind: 'parish'; id: number } | null;

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LABEL_FONT = 'Figtree, system-ui, sans-serif';
/** Where the port and airport are on the island. */
const LANDMARK_AT: Record<Landmark, [number, number]> = { port: toT(13.104, -59.63), airport: toT(13.0752, -59.497) };

/**
 * Draws the game: a close-up view of one town (yours, or one you're visiting), or the island view with every town,
 * the parishes, AgroCorp's land, the port and the airport. Pixel art is shown with nearest-neighbour scaling.
 */
export class Renderer {
  app = new Application();
  mode: 'town' | 'island' = 'town';
  /** The town slot the town view is showing. */
  townSlot = 0;
  /** Town camera (world pixels) and zoom; the island view has its own. */
  cam = { x: 0, y: 0 }; z = 2.5;
  icam = { x: 0, y: 0 }; iz = 1;
  /** The guide's pointer: a tile to point at, or null. */
  coachTile: { x: number; y: number } | null = null;
  /** How much of the screen the top bar and the bottom panel cover, so "go there" centres things in the open map. */
  insetTop = 0; insetBottom = 0;
  /** Called if the phone's graphics memory gives out, so the game can say so instead of showing a black screen. */
  onContextLost?: () => void;

  private town = new Container();
  private island = new Container();
  private overlay = new Container();
  private ground: Sprite[] = [];
  private groundCanvas: HTMLCanvasElement[] = [];
  private groundKey: string[] = [];
  private below = new Graphics();
  private objects = new Container();
  private above = new Graphics();
  private fx = new Graphics();
  private nodeSpr = new Map<number, Sprite>();
  private bSpr = new Map<number, Sprite>();
  private wSpr = new Map<number, Sprite & { _wx?: number; _wy?: number }>();
  private crew: Sprite[] = [];
  private particles: { x: number; y: number; vx: number; vy: number; life: number; c: number }[] = [];
  private time = 0;
  // island view
  islandCanvas!: HTMLCanvasElement;
  ownCanvas!: HTMLCanvasElement;
  private islandSpr?: Sprite;
  private ownSpr?: Sprite;
  private islandG = new Graphics();
  private labels: Text[] = [];
  private banners: { pid: string; t: Text }[] = [];
  private ownVer = -1;
  private TS = 1.5;

  get vw() { return this.app.screen.width; }
  get vh() { return this.app.screen.height; }

  async init(game: GameSession, mount: HTMLElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // keep GPU memory modest: phones crash and reload the page when a tab uses too much
    await this.app.init({ preference: 'webgl', resizeTo: window, background: '#1E7FB8', antialias: false, resolution: dpr, autoDensity: true, powerPreference: 'low-power', roundPixels: true });
    this.app.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost?.(); });
    this.app.canvas.id = 'game';
    this.app.canvas.setAttribute('aria-label', 'Your town');
    mount.prepend(this.app.canvas);
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    this.TS = Math.min(dpr >= 1.5 ? 1.6 : 1.1, (mem <= 4 ? 1400 : 2000) / (Math.max(IW, IH) * IT));
    this.objects.sortableChildren = true;
    this.town.addChild(this.below, this.objects, this.above);
    this.app.stage.addChild(this.town, this.island, this.overlay);
    this.overlay.addChild(this.fx);
    this.setGame(game);
  }

  /** (Re)build everything that depends on a particular game. */
  setGame(game: GameSession) {
    const s = game.state;
    for (const m of [this.nodeSpr, this.bSpr, this.wSpr]) { m.forEach((sp) => sp.destroy()); (m as Map<number, Sprite>).clear(); }
    this.crew.forEach((c) => c.destroy()); this.crew = [];
    // a ground image per town, under everything else in the town view
    this.ground.forEach((g) => g.destroy());
    this.ground = []; this.groundCanvas = []; this.groundKey = [];
    for (let slot = 0; slot < TOWN_SLOTS; slot++) {
      const c = document.createElement('canvas'); c.width = TOWN * PX; c.height = TOWN * PX;
      this.groundCanvas.push(c); this.groundKey.push('');
      const tex = Texture.from(c); tex.source.scaleMode = 'nearest';
      const sp = new Sprite(tex); const o = townOrigin(slot); sp.position.set(o.x * T, o.y * T);
      this.town.addChildAt(sp, slot); this.ground.push(sp);
    }
    // the island view
    this.islandSpr?.destroy(); this.ownSpr?.destroy();
    this.islandCanvas = bakeTerrain(s, this.TS);
    this.ownCanvas = bakeOwnership(s, Math.min(1, this.TS));
    this.islandSpr = new Sprite(Texture.from(this.islandCanvas)); this.islandSpr.width = IW * IT; this.islandSpr.height = IH * IT;
    this.ownSpr = new Sprite(Texture.from(this.ownCanvas)); this.ownSpr.width = IW * IT; this.ownSpr.height = IH * IT;
    this.island.removeChildren();
    this.island.addChild(this.islandSpr, this.ownSpr, this.islandG);
    this.ownVer = s.parishVersion;
    this.labels.forEach((t) => t.destroy()); this.banners.forEach((b) => b.t.destroy());
    const label = (text: string, size: number, fill = '#FFFFFF') => {
      const t = new Text({ text, style: { fontFamily: LABEL_FONT, fontSize: size, fontWeight: '800', fill, stroke: { color: '#061028', width: 3, join: 'round' }, letterSpacing: 1 }, resolution: Math.min(2, window.devicePixelRatio || 1) });
      t.anchor.set(0.5); this.overlay.addChild(t); return t;
    };
    this.labels = [...s.parishes.map((p) => label(p.name.toUpperCase(), 10)), label('PORT', 9.5, '#CFE8FF'), label('AIRPORT', 9.5, '#CFE8FF'), label("AGROCORP'S ESTATE", 9.5, '#FFB4A6')];
    this.banners = s.players.map((p) => ({ pid: p.id, t: label(p.id === game.me ? 'Your town' : `${p.name}'s town`, 11.5, p.color) }));
    const me = player(s, game.me);
    this.townSlot = me?.slot ?? 0;
    this.mode = 'town';
    this.s = s;
    if (me) this.goHome(me.id);
    this.fitIsland();
  }
  private s: State | null = null;
  /** Back to your own town, at village scale, with your Town Centre in the middle of the open screen. */
  goHome(pid: string) {
    const s = this.s, me = s && player(s, pid); if (!s || !me) return;
    const tc = Object.values(s.buildings).find((b) => b.type === 'tc' && b.owner === pid);
    this.z = this.defaultZoom();
    if (tc) this.centerOn(tc.x + 1.5, tc.y + 2); else this.centerOn(townOrigin(me.slot).x + 16, townOrigin(me.slot).y + 16);
  }

  /** About ten tiles across on a phone: village scale. */
  private defaultZoom() { return Math.max(1.6, Math.min(3.2, this.vw / (10.5 * T), this.vh / (12 * T))); }

  // ---------- cameras
  showTown(slot: number) { this.mode = 'town'; this.townSlot = slot; this.clampCam(); }
  /** True until the player pans or zooms the island: till then it keeps fitting the open part of the screen. */
  private islandAuto = true;
  showIsland() { this.mode = 'island'; this.islandAuto = true; this.fitIsland(); }
  /** Fit the whole island in the open part of the screen. */
  fitIsland() {
    const top = this.insetTop || 120, bottom = this.insetBottom || 150, h = Math.max(200, this.vh - top - bottom);
    this.iz = Math.min(this.vw / (IW * IT * 0.92), h / (IH * IT * 0.92));
    this.icam.x = (IW * IT) / 2 - this.vw / this.iz / 2;
    this.icam.y = (IH * IT) / 2 - (top + h / 2) / this.iz;
  }
  clampCam() {
    if (this.mode === 'island') return;
    const o = townOrigin(this.townSlot), x0 = o.x * T, y0 = o.y * T, size = TOWN * T;
    const vw = this.vw / this.z, vh = this.vh / this.z, m = 2 * T;
    const fit = (v: number, lo: number, len: number, view: number) => view >= len + 2 * m ? lo + len / 2 - view / 2 : Math.max(lo - m, Math.min(lo + len + m - view, v));
    this.cam.x = fit(this.cam.x, x0, size, vw);
    this.cam.y = fit(this.cam.y, y0 - 3 * T, size + 3 * T, vh);
  }
  pan(dx: number, dy: number) {
    if (this.mode === 'island') { this.islandAuto = false; this.icam.x -= dx / this.iz; this.icam.y -= dy / this.iz; return; }
    this.cam.x -= dx / this.z; this.cam.y -= dy / this.z; this.clampCam();
  }
  zoomAt(sx: number, sy: number, f: number) {
    if (this.mode === 'island') {
      this.islandAuto = false;
      const wx = sx / this.iz + this.icam.x, wy = sy / this.iz + this.icam.y;
      this.iz = Math.max(0.3, Math.min(3, this.iz * f));
      this.icam.x = wx - sx / this.iz; this.icam.y = wy - sy / this.iz; return;
    }
    const wx = sx / this.z + this.cam.x, wy = sy / this.z + this.cam.y;
    this.z = Math.max(1, Math.min(5, this.z * f));
    this.cam.x = wx - sx / this.z; this.cam.y = wy - sy / this.z; this.clampCam();
  }
  /** Centres the town view on a world tile, switching to the town it's in. */
  centerOn(tx: number, ty: number) {
    const slot = Math.floor(ty / TOWN) * 3 + Math.floor(tx / TOWN);
    if (slot >= 0 && slot < TOWN_SLOTS) this.townSlot = slot;
    this.mode = 'town';
    const top = Math.min(this.insetTop, this.vh * 0.4), bottom = Math.min(this.insetBottom, this.vh * 0.55);
    this.cam.x = tx * T - this.vw / this.z / 2;
    this.cam.y = ty * T - (top + (this.vh - top - bottom) / 2) / this.z;
    this.clampCam();
  }
  /** Screen point to world tile coordinates (town view). */
  toTile(sx: number, sy: number) { return { x: (sx / this.z + this.cam.x) / T, y: (sy / this.z + this.cam.y) / T }; }
  /** What's under a tap on the island view: a town banner, AgroCorp's estate label, a landmark, or a parish. */
  islandHit(s: State, sx: number, sy: number): IslandHit {
    const near = (t: Text) => t.visible && Math.abs(t.x - sx) < t.width / 2 + 10 && Math.abs(t.y - sy) < t.height / 2 + 10;
    for (const b of this.banners) if (near(b.t)) return { kind: 'town', pid: b.pid };
    if (near(this.labels[s.parishes.length + 2])) return { kind: 'estate' };
    for (const [k, type] of (['port', 'airport'] as Landmark[]).entries()) {
      const [lx, ly] = LANDMARK_AT[type], [x, y] = this.toScreenI(lx, ly);
      if (Math.hypot(x - sx, y - sy) < 26 || near(this.labels[s.parishes.length + k])) return { kind: 'landmark', type };
    }
    const tx = Math.floor((sx / this.iz + this.icam.x) / IT), ty = Math.floor((sy / this.iz + this.icam.y) / IT);
    if (tx < 0 || ty < 0 || tx >= IW || ty >= IH) return null;
    const pid = s.island.pid[ty * IW + tx];
    return pid >= 0 ? { kind: 'parish', id: pid } : null;
  }
  private toScreenI(ix: number, iy: number) { return [(ix * IT - this.icam.x) * this.iz, (iy * IT - this.icam.y) * this.iz] as const; }

  // ---------- each frame
  frame(game: GameSession, view: View, dt: number) {
    const s = game.state;
    this.time += dt;
    const isl = this.mode === 'island';
    this.town.visible = !isl; this.island.visible = isl;
    this.app.renderer.background.color = isl ? ISLAND_SEA : TOWN_SEA;
    for (const t of this.labels) t.visible = isl;
    for (const b of this.banners) b.t.visible = isl;
    this.tickParticles(dt);
    if (isl) { if (this.islandAuto) this.fitIsland(); this.drawIsland(s, view); this.fx.clear(); this.drawWeather(s); return; }
    let sx = 0, sy = 0;
    if (s.weather.stormT > 0 && !RM) { sx = (Math.random() - 0.5) * 5; sy = (Math.random() - 0.5) * 5; }
    this.town.scale.set(this.z);
    this.town.position.set(Math.round(-this.cam.x * this.z + sx), Math.round(-this.cam.y * this.z + sy));
    this.bakeGround(s, this.townSlot);
    this.drawBelow(s, view, game);
    this.syncNodes(s);
    this.syncBuildings(s);
    this.syncWorkers(game);
    this.drawCrew(s, game.alpha);
    this.drawAbove(s, view);
    this.fx.clear();
    this.drawWeather(s);
    this.drawSelArrow(s, view);
  }

  /** Paints a town's ground and paths into its image; redone only when its paths or owner's age change. */
  private bakeGround(s: State, slot: number) {
    const o = townOrigin(slot), owner = slot === AGRO_SLOT ? AGRO : s.players.find((p) => p.slot === slot);
    const key = `${s.roadVersion}:${owner && typeof owner !== 'string' ? owner.age : 0}`;
    if (this.groundKey[slot] === key) return;
    this.groundKey[slot] = key;
    const g = this.groundCanvas[slot].getContext('2d')!; g.imageSmoothingEnabled = false;
    const kindAt = (lx: number, ly: number) => (lx < 0 || ly < 0 || lx >= TOWN || ly >= TOWN ? 4 : s.map.kind[(o.y + ly) * W + o.x + lx]);
    const hq = slot === AGRO_SLOT ? Object.values(s.buildings).find((b) => b.type === 'hq') : undefined;
    for (let ly = 0; ly < TOWN; ly++) for (let lx = 0; lx < TOWN; lx++) {
      const k = kindAt(lx, ly), X = lx * PX, Y = ly * PX, wx = o.x + lx, wy = o.y + ly;
      drawGround(g, k, wx, wy, X, Y, (dx, dy) => kindAt(lx + dx, ly + dy));
      // AgroCorp's estate is planted in cane, apart from round its HQ
      if (hq && k === 0 && Math.abs(wx - (hq.x + 1)) + Math.abs(wy - (hq.y + 1)) > 5 && (wx + wy * 3) % 7 !== 0) drawCane(g, wx, wy, X, Y);
    }
    const R = (lx: number, ly: number) => lx >= 0 && ly >= 0 && lx < TOWN && ly < TOWN && s.roads[(o.y + ly) * W + o.x + lx] > 0;
    for (let ly = 0; ly < TOWN; ly++) for (let lx = 0; lx < TOWN; lx++) {
      const i = (o.y + ly) * W + o.x + lx; if (!s.roads[i]) continue;
      const age = roadOwner(s, i)?.age ?? 1, style = s.roads[i] === 1 ? 0 : age <= 2 ? 1 : age === 3 ? 2 : 3;
      drawPath(g, style, o.x + lx, o.y + ly, lx * PX, ly * PX, { l: R(lx - 1, ly), r: R(lx + 1, ly), u: R(lx, ly - 1), d: R(lx, ly + 1) });
    }
    this.ground[slot].texture.source.update();
  }

  private inView(x: number, y: number, pad = 3) {
    const x0 = this.cam.x / T - pad, y0 = this.cam.y / T - pad, x1 = (this.cam.x + this.vw / this.z) / T + pad, y1 = (this.cam.y + this.vh / this.z) / T + pad;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  private drawBelow(s: State, view: View, game: GameSession) {
    const g = this.below; g.clear();
    if (view.roadMode) {
      for (const i of view.roadDraft) g.rect((i % W) * T + 1, ((i / W) | 0) * T + 1, T - 2, T - 2);
      g.fill({ color: 0xeadfbe, alpha: 0.85 });
    }
    if (view.buildMode) {
      // every spot where the building would fit, in pale gold
      const d = BT[view.buildMode];
      const x0 = Math.floor(this.cam.x / T) - 1, y0 = Math.floor(this.cam.y / T) - 1;
      const x1 = Math.ceil((this.cam.x + this.vw / this.z) / T) + 1, y1 = Math.ceil((this.cam.y + this.vh / this.z) / T) + 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && !placeBlock(s, game.me, view.buildMode, x, y)) g.rect(x * T + 2, y * T + 2, T - 4, T - 4);
      g.fill({ color: 0xffec96, alpha: 0.3 });
      void d;
    }
    const showWalls = view.buildMode === 'seawall' || (view.sel?.kind === 'building' && s.buildings[view.sel.id]?.type === 'seawall');
    if (showWalls) for (const b of Object.values(s.buildings)) if (b.type === 'seawall' && b.done)
      g.circle((b.x + 0.5) * T, (b.y + 0.5) * T, SEA_R * T).fill({ color: 0x5bc0eb, alpha: 0.1 }).stroke({ width: 1, color: 0x5bc0eb, alpha: 0.85 });
  }

  /** A sprite in the depth-sorted layer: things lower on screen draw over things behind them. */
  private place(sp: Sprite, x: number, y: number, depth: number) { sp.position.set(Math.round(x), Math.round(y)); sp.zIndex = depth; }

  private syncNodes(s: State) {
    for (const n of s.nodes) {
      let sp = this.nodeSpr.get(n.id);
      if (n.amt <= 0) { if (sp) { sp.destroy(); this.nodeSpr.delete(n.id); } continue; }
      const share = n.max === Infinity ? 1 : n.amt / n.max;
      const tex = nodeTex(n.type, n.id, share);
      if (!sp) { sp = new Sprite(tex); sp.anchor.set(0.5, 1); this.objects.addChild(sp); this.nodeSpr.set(n.id, sp); }
      if (sp.texture !== tex) sp.texture = tex;
      sp.visible = this.inView(n.x, n.y);
      if (!sp.visible) continue;
      const bob = n.type === 'fish' && !RM ? Math.round(Math.sin(this.time * 2 + n.i)) : 0;
      this.place(sp, (n.x + 0.5) * T, (n.y + 1) * T + bob + 4, n.type === 'fish' ? -1e6 : (n.y + 1) * T);
    }
  }

  private syncBuildings(s: State) {
    const seen = new Set<number>();
    for (const b of Object.values(s.buildings)) {
      seen.add(b.id);
      let sp = this.bSpr.get(b.id);
      const look = b.type === 'house' ? b.lvl : player(s, b.owner)?.age ?? 3;
      const tex = buildingTex(b.type, b.w, b.h, look, b.variant, !b.done);
      if (!sp) { sp = new Sprite(tex); sp.anchor.set(0, 1); this.objects.addChild(sp); this.bSpr.set(b.id, sp); }
      if (sp.texture !== tex) sp.texture = tex;
      sp.visible = this.inView(b.x + b.w / 2, b.y + b.h / 2, 5);
      // a dry cistern looks a little faded in a drought
      sp.alpha = b.type === 'cistern' && drought(s) ? 0.8 : 1;
      this.place(sp, b.x * T, (b.y + b.h) * T, (b.y + b.h) * T - 1);
    }
    for (const [id, sp] of this.bSpr) if (!seen.has(id)) { sp.destroy(); this.bSpr.delete(id); }
  }

  private syncWorkers(game: GameSession) {
    const s = game.state, seen = new Set<number>(), a = game.alpha;
    for (const w of Object.values(s.workers)) {
      seen.add(w.id);
      const owner = player(s, w.owner), moving = !!w.path?.length;
      const frame = moving && !RM ? Math.floor(this.time * 6 + w.id) % 2 : 0;
      const tex = workerTex(owner?.color ?? '#ffffff', owner?.age ?? 1, frame, w.amt >= 1 ? w.carry : null);
      let sp = this.wSpr.get(w.id);
      if (!sp) { sp = new Sprite(tex); sp.anchor.set(0.5, 0.95); this.objects.addChild(sp); this.wSpr.set(w.id, sp); }
      if (sp.texture !== tex) sp.texture = tex;
      const p = game.prevPos(w.id) ?? w;
      const x = p.x + (w.x - p.x) * a, y = p.y + (w.y - p.y) * a;
      sp._wx = x; sp._wy = y;
      sp.visible = this.inView(x, y);
      sp.scale.x = (w.face || 1) < 0 ? -1 : 1;
      this.place(sp, x * T, y * T + 6, y * T + 6);
    }
    for (const [id, sp] of this.wSpr) if (!seen.has(id)) { sp.destroy(); this.wSpr.delete(id); }
  }
  /** World position of a worker as drawn this frame (interpolated). */
  workerPos(id: number): { x: number; y: number } | null {
    const sp = this.wSpr.get(id);
    return sp && sp._wx !== undefined ? { x: sp._wx, y: sp._wy! } : null;
  }

  /**
   * AgroCorp's workers, in red: they work round a building site, walk out to the cane and back from finished
   * buildings, and come and go at HQ. Worked out from the game state and clock, so every phone shows the same.
   */
  private drawCrew(s: State, alpha: number) {
    const t = s.time + alpha * DT, spots: { x: number; y: number; flip: boolean; frame: number }[] = [];
    if (this.townSlot === AGRO_SLOT) for (const b of Object.values(s.buildings)) {
      if (b.owner !== AGRO) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h + 0.4, crew = b.type === 'hq' ? 3 : b.done ? 2 : 3;
      for (let k = 0; k < crew; k++) {
        const seed = b.id * 7 + k * 13, ph = t * (b.done ? 0.1 : 0.2) + seed * 0.37;
        let x: number, y: number, flip: boolean;
        if (!b.done) { const an = ph * Math.PI * 2; x = cx + Math.cos(an) * 1.9; y = cy - 1.5 + Math.sin(an) * 1.6; flip = Math.sin(an) > 0; }
        else {
          const ang = (seed % 360) * Math.PI / 180, far = 3 + (seed % 3);
          const u = ph % 1, d = u < 0.5 ? u * 2 : 2 - u * 2;
          x = cx + Math.cos(ang) * far * d; y = cy + Math.abs(Math.sin(ang)) * far * d * 0.8; flip = (Math.cos(ang) < 0) !== (u >= 0.5);
        }
        spots.push({ x, y, flip, frame: Math.floor(t * 5 + k) % 2 });
      }
    }
    while (this.crew.length < spots.length) { const sp = new Sprite(); sp.anchor.set(0.5, 0.95); this.objects.addChild(sp); this.crew.push(sp); }
    this.crew.forEach((sp, k) => {
      const p = spots[k]; sp.visible = !!p; if (!p) return;
      sp.texture = workerTex('#E2553F', 4, p.frame, null);
      sp.scale.x = p.flip ? -1 : 1;
      this.place(sp, p.x * T, p.y * T, p.y * T);
    });
  }

  /** A burst of flag-coloured confetti from each of a player's buildings, for an age-up. */
  celebrate(s: State, owner: string) {
    const cols = [0x00267f, 0xffc726, 0x6cc24a, 0xffffff];
    for (const b of Object.values(s.buildings)) {
      if (b.owner !== owner || !b.done) continue;
      const cx = (b.x + b.w / 2) * T, cy = (b.y + b.h / 2) * T;
      for (let k = 0; k < 10; k++) {
        const an = Math.random() * Math.PI * 2, v = 20 + Math.random() * 40;
        this.particles.push({ x: cx, y: cy, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 40, life: 1.6 + Math.random() * 0.8, c: cols[k % cols.length] });
      }
    }
  }
  private tickParticles(dt: number) {
    if (RM) { this.particles = []; return; }
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.vx *= 0.98; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private drawAbove(s: State, view: View) {
    const g = this.above; g.clear();
    const bar = (x: number, y: number, w: number, f: number, col: number) => {
      g.rect(x + 2, y, w - 4, 3).fill({ color: 0x000000, alpha: 0.55 });
      g.rect(x + 2, y, (w - 4) * Math.max(0, Math.min(1, f)), 3).fill(col);
    };
    for (const b of Object.values(s.buildings)) {
      if (!this.inView(b.x, b.y, 4)) continue;
      const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
      if (!b.done) { bar(x, y + h - 4, w, b.progress, 0xffc726); continue; }
      if (b.pest > 0) for (let k = 0; k < 6; k++) { const an = k * 1.7 + this.time * 3; g.rect(x + w / 2 + Math.cos(an) * 8, y + h / 2 + Math.sin(an * 1.3) * 6, 1.5, 1.5).fill(0x2a1a10); }
      if (b.hp < b.maxHp) { const f = b.hp / b.maxHp; bar(x, y - 6, w, f, f > 0.5 ? 0x6cc24a : f > 0.25 ? 0xffb03a : 0xe2553f); }
    }
    // whatever is selected glows gold and pulses, the same gold as the panel that describes it
    const sel = view.sel, pulse = RM ? 0.8 : 0.5 + 0.5 * Math.sin(this.time * 4.5), GOLD = 0xffc726;
    const box = (x: number, y: number, w: number, h: number) => {
      g.roundRect(x - 2, y - 2, w + 4, h + 4, 3).stroke({ width: 3, color: GOLD, alpha: 0.2 + 0.25 * pulse });
      g.roundRect(x - 0.5, y - 0.5, w + 1, h + 1, 2).stroke({ width: 1.2, color: GOLD });
    };
    const selB = sel?.kind === 'building' ? s.buildings[sel.id] : sel?.kind === 'player' ? Object.values(s.buildings).find((b) => b.owner === sel.id && b.type === 'tc') : undefined;
    if (selB) box(selB.x * T, selB.y * T, selB.w * T, selB.h * T);
    if (sel?.kind === 'node') {
      const n = s.nodes[sel.id];
      if (n) { const cx = (n.x + 0.5) * T, cy = (n.y + 0.6) * T; g.ellipse(cx, cy, 10 + pulse, 6 + pulse).stroke({ width: 3, color: GOLD, alpha: 0.2 + 0.25 * pulse }); g.ellipse(cx, cy, 9, 5).stroke({ width: 1.2, color: GOLD }); }
    }
    const ids = sel?.kind === 'workers' ? sel.ids : null;
    for (const w of Object.values(s.workers)) {
      const p = this.workerPos(w.id); if (!p || !this.inView(p.x, p.y)) continue;
      const x = p.x * T, y = p.y * T + 6;
      if (ids?.has(w.id)) {
        g.ellipse(x, y, 6, 2.6).stroke({ width: 2.5, color: GOLD, alpha: 0.25 + 0.25 * pulse }).ellipse(x, y, 5.5, 2.2).stroke({ width: 1, color: GOLD });
        if (ids.size <= 12) { const by = y - 22 - 1.5 * pulse; g.poly([x - 3, by - 3, x + 3, by - 3, x, by + 1]).fill(GOLD).stroke({ width: 0.8, color: 0x5a3f00 }); }
      }
      if (w.working && !RM) {
        // a hoe or cutlass swinging
        const an = Math.sin(this.time * 10 + w.id) * 0.9, f = w.face || 1;
        g.moveTo(x + 3 * f, y - 9).lineTo(x + (3 + Math.cos(an) * 5) * f, y - 9 - Math.sin(an) * 5).stroke({ width: 1, color: 0x4a3420 });
      }
    }
    for (const p of this.particles) g.rect(p.x - 1, p.y - 1, 2, 2).fill({ color: p.c, alpha: Math.min(1, p.life * 1.5) });
    // the guide's bouncing pointer over the thing to tap next
    if (this.coachTile) {
      const cx = this.coachTile.x * T, bob = RM ? 0 : Math.abs(Math.sin(this.time * 3.2)) * 5, y = this.coachTile.y * T - 22 - bob;
      g.ellipse(cx, this.coachTile.y * T + 4, 9 + (RM ? 0 : Math.sin(this.time * 3.2) * 1.5), 5).stroke({ width: 1.5, color: GOLD, alpha: 0.8 });
      g.poly([cx - 5, y - 7, cx + 5, y - 7, cx + 5, y - 2, cx + 9, y - 2, cx, y + 7, cx - 9, y - 2, cx - 5, y - 2]).fill(GOLD).stroke({ width: 1.2, color: 0x3a2a00 });
    }
    for (const m of view.marks) g.circle(m.x * T, m.y * T, (1 - m.t / 0.7) * 7 + 3).stroke({ width: 1.5, color: GOLD, alpha: m.t / 0.7 });
  }

  /** Where the selection is, in tiles. */
  selCenter(s: State, view: View): { x: number; y: number } | null {
    const sel = view.sel; if (!sel) return null;
    if (sel.kind === 'building') { const b = s.buildings[sel.id]; return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; }
    if (sel.kind === 'node') { const n = s.nodes[sel.id]; return n ? { x: n.x + 0.5, y: n.y + 0.5 } : null; }
    if (sel.kind === 'player') { const b = Object.values(s.buildings).find((q) => q.owner === sel.id && q.type === 'tc'); return b ? { x: b.x + 1.5, y: b.y + 1.5 } : null; }
    if (sel.kind === 'workers') {
      let sx = 0, sy = 0, n = 0;
      for (const id of sel.ids) { const p = this.workerPos(id); if (p) { sx += p.x; sy += p.y; n++; } }
      return n ? { x: sx / n, y: sy / n } : null;
    }
    return null;
  }
  /** When the selected thing is off screen, a gold arrow at the edge points the way to it. */
  private drawSelArrow(s: State, view: View) {
    const at = this.selCenter(s, view); if (!at) return;
    const sx = (at.x * T - this.cam.x) * this.z, sy = (at.y * T - this.cam.y) * this.z;
    const top = Math.max(60, this.insetTop + 10), bottom = Math.min(this.vh - 60, this.vh - this.insetBottom - 10), m = 26;
    if (sx > m && sx < this.vw - m && sy > top && sy < bottom) return;
    const cx = this.vw / 2, cy = (top + bottom) / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((this.vw / 2 - m) / Math.abs(dx || 1e-6), ((bottom - top) / 2) / Math.abs(dy || 1e-6));
    const ax = cx + dx * k, ay = cy + dy * k, an = Math.atan2(dy, dx), pulse = RM ? 0 : Math.sin(this.time * 5) * 3;
    const px = ax - Math.cos(an) * pulse, py = ay - Math.sin(an) * pulse;
    const pt = (r: number, a: number) => [px + Math.cos(an + a) * r, py + Math.sin(an + a) * r];
    this.fx.poly([...pt(14, 0), ...pt(11, 2.5), ...pt(4, Math.PI), ...pt(11, -2.5)]).fill(0xffc726).stroke({ width: 2, color: 0x3a2a00 });
  }

  /** Storm clouds and rain; a warm haze in a drought. */
  private drawWeather(s: State) {
    const g = this.fx;
    if (s.weather.stormT > 0) {
      const a = Math.min(1, s.weather.stormT / 1.5) * 0.4;
      g.rect(0, 0, this.vw, this.vh).fill({ color: 0x141e32, alpha: a });
      if (!RM) { for (let k = 0; k < 90; k++) { const rx = Math.random() * this.vw, ry = Math.random() * this.vh; g.moveTo(rx, ry).lineTo(rx - 10, ry + 18); } g.stroke({ width: 1, color: 0xc8dcff, alpha: 0.45 }); }
    } else if (drought(s)) g.rect(0, 0, this.vw, this.vh).fill({ color: 0xffaa3c, alpha: 0.08 });
  }

  // ---------- the island view
  private drawIsland(s: State, view: View) {
    this.island.scale.set(this.iz);
    this.island.position.set(-this.icam.x * this.iz, -this.icam.y * this.iz);
    if (s.parishVersion !== this.ownVer) { bakeOwnership(s, Math.min(1, this.TS), this.ownCanvas); this.ownSpr!.texture.source.update(); this.ownVer = s.parishVersion; }
    const g = this.islandG; g.clear();
    const sel = view.sel;
    if (sel?.kind === 'parish') g.poly(s.parishes[sel.id].poly.map((v) => v * IT)).fill({ color: 0xffc726, alpha: 0.14 }).stroke({ width: 3 / this.iz, color: 0xffc726 });
    if (s.agro.warned && s.agro.target !== null) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 5);
      g.poly(s.parishes[s.agro.target].poly.map((v) => v * IT)).fill({ color: 0xe2553f, alpha: 0.14 * pulse }).stroke({ width: 3 / this.iz, color: 0xff6a52, alpha: pulse });
    }
    // co-op stands: a little flag in the parish's colour
    for (const p of s.parishes) {
      if (!p.stand) continue;
      const col = p.stand === AGRO ? 0xe2553f : parseInt((player(s, p.stand)?.color ?? '#ffffff').slice(1), 16);
      const x = p.lx * IT + 14, y = p.ly * IT + 6;
      g.rect(x, y - 14, 1.6, 16).fill(0x2a1e14);
      g.poly([x + 1.6, y - 14, x + 12, y - 10, x + 1.6, y - 6]).fill(col).stroke({ width: 1, color: 0x2a1e14 });
    }
    for (const type of ['port', 'airport'] as Landmark[]) {
      const [lx, ly] = LANDMARK_AT[type];
      g.circle(lx * IT, ly * IT, 9).fill(0xffffff).stroke({ width: 2, color: 0x0a3478 });
      if (type === 'port') g.rect(lx * IT - 5, ly * IT - 1, 10, 4).fill(0x0a3478).rect(lx * IT - 1, ly * IT - 6, 2, 5).fill(0x0a3478);
      else g.poly([lx * IT - 6, ly * IT + 1, lx * IT + 6, ly * IT - 3, lx * IT + 6, ly * IT, lx * IT - 3, ly * IT + 3]).fill(0x0a3478);
    }
    // labels and town banners, kept upright at screen size
    s.parishes.forEach((p, k) => {
      const t = this.labels[k], [x, y] = this.toScreenI(p.lx, p.ly - 0.6);
      t.position.set(x, y);
      const col = p.owner === AGRO ? '#FFB4A6' : p.owner ? (player(s, p.owner)?.color ?? '#FFFFFF') : '#FFFFFF';
      if (t.style.fill !== col) t.style.fill = col;
    });
    (['port', 'airport'] as Landmark[]).forEach((type, k) => { const [lx, ly] = LANDMARK_AT[type], [x, y] = this.toScreenI(lx, ly); this.labels[s.parishes.length + k].position.set(x, y + 18); });
    const est = s.parishes[AGRO_HOME], [ex, ey] = this.toScreenI(est.lx, est.ly + 1.4);
    this.labels[s.parishes.length + 2].position.set(ex, ey);
    for (const b of this.banners) {
      const p = player(s, b.pid); if (!p) continue;
      const home = s.parishes[p.home], [x, y] = this.toScreenI(home.lx, home.ly + 1.4);
      b.t.position.set(x, y);
    }
    void LANDMARK_PARISH; void TC_LOCAL;
  }
}
