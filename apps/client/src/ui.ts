import {
  AGES, AGRO, AGRO_HOME, MAX_AGE, BOAT_COST, BOAT_RATE, BT, BUILD_LIST, DEALS, DUES, MAX_BOATS, NT, RELIEF, ROAD_COST, STALL, TOURISM, TRAIN, W,
  airportOpen, aquaPowered, canAfford, claimBlock, claimCost, dealTerms, drought, fmtCost, landmarkHolder, linked, owned,
  parishBuilt, player, popCap, protectedB, rivalCost, tcOf, teamOwned, winTarget, workersOf,
  type BType, type Command, type DealId, type Landmark, type Res, type State, type Worker,
} from '@bim/sim';
import { FlowTracker, dashboardHTML } from './dashboard';
import type { GameSession } from './game';
import type { Renderer, View } from './render';
import { T } from './terrain';

const $ = <E extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as E;
const fmtT = (sec: number) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class UI {
  /** Whether a finger is down inside this element (without :has(), which older iPhones don't support). */
  private pressedIn(sel: string) { const el = document.querySelector(sel); const a = el?.ownerDocument.querySelectorAll(':active'); return !!el && !!a && [...a].some((x) => el.contains(x)); }

  view: View = { sel: null, buildMode: null, marks: [], roadMode: false, roadDraft: new Set() };
  private menu: 'build' | 'money' | 'trade' | null = null;
  /** The trade or gift form: who it's for. */
  private tradeWith: { pid: string; kind: 'offer' | 'gift' } | null = null;
  private lastPanel = '';
  private panelT = 0;
  private miniT = 0;
  private idleIdx = 0;
  private hudCache: Record<string, string> = {};
  private panel = $('#panel');
  private flows = new FlowTracker();
  private dashOpen = false;
  private dashT = 0;
  private lastDash = '';
  private seenAge = 1;
  private bannerT = 0;
  storyShown = false;
  private mini = $<HTMLCanvasElement>('#mini');
  running = false;

  constructor(private game: GameSession, private r: Renderer, private onEnd: () => void) {
    this.bindPanel(); this.bindBar(); this.bindInput(); this.bindKeys(); this.bindDash();
  }
  setGame(game: GameSession) { this.seenAge = 1; this.storyShown = false; this.flows.reset(); this.closeDash(); this.game = game; this.view = { sel: null, buildMode: null, marks: [], roadMode: false, roadDraft: new Set() }; this.menu = null; this.lastPanel = ''; this.hudCache = {}; }

  private get s(): State { return this.game.state; }
  private get me() { return player(this.s, this.game.me)!; }

  // ---------- commands
  private send(c: Command) {
    const res = this.game.send(c);
    if (!res.ok && res.msg) this.toast(res.msg);
    else if (res.msg) this.toast(res.msg);
    return res;
  }
  private selectedWorkers(): Worker[] {
    const sel = this.view.sel; if (sel?.kind !== 'workers') return [];
    return [...sel.ids].map((id) => this.s.workers[id]).filter((w): w is Worker => !!w && w.owner === this.game.me);
  }
  private mark(x: number, y: number) { this.view.marks.push({ x, y, t: 0.7 }); }

  tick(dt: number) {
    for (const m of this.view.marks) m.t -= dt;
    this.view.marks = this.view.marks.filter((m) => m.t > 0);
    for (const e of this.game.newEvents()) this.toast(e.msg, e.kind === 'info' ? undefined : e.kind);
    this.hud();
    if (this.me.age > this.seenAge) { this.seenAge = this.me.age; this.ageUp(); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('#ageBanner').hidden = true; }
    this.flows.sample(this.s, this.game.me);
    if (this.dashOpen) { this.dashT -= dt; if (this.dashT <= 0) { this.dashT = 0.5; this.renderDash(); } }
    this.panelT -= dt; if (this.panelT <= 0) { this.panelT = 0.25; this.renderPanel(); }
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = 0.3; this.drawMini(); }
    if (this.s.ended && this.running) this.end();
  }

  // ---------- tap handling
  tap(sx: number, sy: number) {
    const s = this.s, r = this.r;
    const wx = sx / r.z + r.cam.x, wy = sy / r.z + r.cam.y, tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    if (this.view.buildMode) {
      const type = this.view.buildMode;
      const res = this.send({ type: 'place', building: type, x: tx, y: ty, workers: this.selectedWorkers().map((w) => w.id) });
      if (res.ok) {
        this.mark(tx + 0.5, ty + 0.5); this.view.buildMode = null;
        const builders = Object.values(s.workers).filter((w) => w.task?.k === 'build' && w.task.b === res.building);
        this.view.sel = builders.length ? { kind: 'workers', ids: new Set(builders.map((w) => w.id)) } : { kind: 'building', id: res.building! };
      }
      this.renderPanel(true); return;
    }
    this.menu = null;
    // workers first: generous hit radius for fingers
    const rad = Math.max(0.55, 16 / (r.z * T)); let hit: Worker | null = null, hd = rad;
    for (const w of Object.values(s.workers)) {
      if (w.owner !== this.game.me) continue;
      const p = r.workerPos(w.id) ?? w, d = Math.hypot(p.x - wx / T, p.y - wy / T);
      if (d < hd) { hd = d; hit = w; }
    }
    if (hit) { this.view.sel = { kind: 'workers', ids: new Set([hit.id]) }; this.renderPanel(true); return; }
    if (tx < 0 || ty < 0 || tx >= W || ty >= s.map.land.length / W) { this.view.sel = null; this.renderPanel(true); return; }
    const i = ty * W + tx, bid = s.bAt[i], b = bid >= 0 ? s.buildings[bid] : undefined, nid = s.nodeAt[i], n = nid >= 0 ? s.nodes[nid] : undefined;
    const ws = this.selectedWorkers();
    if (ws.length) {
      const ids = ws.map((w) => w.id);
      if (n) { this.send({ type: 'gather', workers: ids, node: n.id }); this.mark(tx + 0.5, ty + 0.5); this.renderPanel(true); return; }
      if (b && b.owner === this.game.me && (!b.done || b.type === 'farm')) { this.send({ type: 'work', workers: ids, building: b.id }); this.mark(b.x + b.w / 2, b.y + b.h / 2); this.renderPanel(true); return; }
      if (b) { this.view.sel = b.type === 'hq' ? { kind: 'parish', id: AGRO_HOME } : { kind: 'building', id: b.id }; this.renderPanel(true); return; }
      if (s.map.land[i]) { this.send({ type: 'move', workers: ids, tile: i }); this.mark(tx + 0.5, ty + 0.5); }
      this.renderPanel(true); return;
    }
    if (b) this.view.sel = b.type === 'hq' ? { kind: 'parish', id: AGRO_HOME } : { kind: 'building', id: b.id };
    else if (n) this.view.sel = { kind: 'node', id: n.id };
    else if (s.map.land[i]) this.view.sel = { kind: 'parish', id: s.map.pid[i] };
    else this.view.sel = null;
    this.renderPanel(true);
  }

  private act(a: string) {
    const s = this.s, tc = tcOf(s, this.game.me), sel = this.view.sel;
    if (a === 'build') { this.menu = this.menu === 'build' ? null : 'build'; this.view.buildMode = null; }
    else if (a.startsWith('place:')) { this.view.buildMode = a.slice(6) as BType; this.menu = null; }
    else if (a === 'cancel') { this.view.buildMode = null; this.menu = null; this.view.roadMode = false; this.view.roadDraft.clear(); }
    else if (a === 'roadmode') { this.view.roadMode = true; this.view.buildMode = null; this.menu = null; this.view.roadDraft.clear(); }
    else if (a.startsWith('trade:')) { const [, at, deal] = a.split(':'); this.send({ type: 'trade', at: at as Landmark, deal: deal as DealId }); }
    else if (a === 'boat') this.send({ type: 'boat' });
    else if (a === 'trade-send' && this.tradeWith) {
      const num = (id: string) => Math.max(0, Math.floor(Number(($(id) as HTMLInputElement | null)?.value ?? 0)) || 0);
      const res = (id: string) => (($(id) as HTMLSelectElement | null)?.value ?? 'food') as Res;
      const give = { [res('#t-gr')]: num('#t-gn') };
      const r = this.tradeWith.kind === 'gift'
        ? this.send({ type: 'gift', to: this.tradeWith.pid, give })
        : this.send({ type: 'offer', to: this.tradeWith.pid, give, get: { [res('#t-wr')]: num('#t-wn') } });
      if (r.ok) { this.menu = null; this.tradeWith = null; if (this.game.online) this.toast('Sent.'); }
    }
    else if (a === 'deselect') { this.view.sel = null; this.menu = null; this.view.buildMode = null; this.view.roadMode = false; this.view.roadDraft.clear(); }
    else if (a === 'train' && tc) this.send({ type: 'train', building: tc.id });
    else if (a === 'age') this.send({ type: 'age' });
    else if (a === 'sell-food' || a === 'sell-stone' || a === 'buy-water' || a === 'stall-food') this.send({ type: 'market', trade: a });
    else if (a === 'money') { this.menu = this.menu === 'money' ? null : 'money'; this.view.buildMode = null; }
    else if (a === 'repair' && sel?.kind === 'building') this.send({ type: 'repair', building: sel.id });
    else if (a === 'claim' && sel?.kind === 'parish') this.send({ type: 'claim', parish: sel.id });
    this.renderPanel(true);
  }

  // ---------- panel
  private btn(a: string, label: string, sub?: string, o: { primary?: boolean; disabled?: boolean } = {}) {
    return `<button class="btn${o.primary ? ' primary' : ''}" data-act="${a}"${o.disabled ? ' disabled' : ''}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  }
  private wStatus(w: Worker) {
    const t = w.task; let st = 'Idle';
    if (t) {
      if (t.k === 'move') st = 'Walking';
      else if (t.k === 'build') st = `Building ${BT[this.s.buildings[t.b]?.type ?? 'house'].name}`;
      else if (t.k === 'farm') st = 'Farming';
      else st = `Gathering ${NT[this.s.nodes[t.n].type].label.toLowerCase()}`;
      if (w.phase === 'drop') st += ', heading to drop off';
    }
    if (w.amt >= 1) st += `. Carrying ${Math.floor(w.amt)} ${w.carry}`;
    return st + '.';
  }
  private panelHTML(): string {
    const s = this.s, me = this.me, sel = this.view.sel;
    if (this.view.roadMode) {
      const linkedTo = (['port', 'airport'] as const).filter((t) => linked(s, me.id, t)).map((t) => BT[t].name);
      return `<h3>Lay road</h3><p>Drag across tiles in your parishes. <strong>${ROAD_COST} coral stone a tile</strong>; you have ${Math.floor(me.res.stone)}. Workers walk twice as fast on roads. Gold roads connect to your Town Centre, Depots and Markets${linkedTo.length ? `, and already reach ${linkedTo.join(' and ')}` : ''}.</p><div class="btns">${this.btn('cancel', 'Done', undefined, { primary: true })}</div>`;
    }
    if (this.view.buildMode) {
      const d = BT[this.view.buildMode];
      return `<h3>Place ${d.name}</h3><p>Tap ${d.coast ? 'a coast tile' : 'an empty tile'} inside your parishes. ${d.desc}</p><div class="btns">${this.btn('cancel', 'Cancel')}</div>`;
    }
    if (this.menu === 'trade' && this.tradeWith) {
      const other = player(s, this.tradeWith.pid);
      if (!other) { this.menu = null; return this.panelHTML(); }
      const opts = (sel: Res) => (['food', 'water', 'stone', 'bbd'] as Res[]).map((r) => `<option value="${r}"${r === sel ? ' selected' : ''}>${r === 'bbd' ? 'BBD' : r[0].toUpperCase() + r.slice(1)}</option>`).join('');
      const giveRow = `<div class="trow"><span>You give</span><input id="t-gn" type="number" inputmode="numeric" min="0" step="10" value="50" aria-label="Amount to give"><select id="t-gr" aria-label="Resource to give">${opts('food')}</select></div>`;
      if (this.tradeWith.kind === 'gift') return `<h3>Send to <span style="color:${other.color}">${other.name}</span></h3><p>A gift to your teammate. It arrives straight away.</p>${giveRow}<div class="btns">${this.btn('trade-send', 'Send gift', undefined, { primary: true })}${this.btn('deselect', 'Cancel')}</div>`;
      return `<h3>Trade with <span style="color:${other.color}">${other.name}</span></h3><p>They have 60 seconds to accept. Nothing moves unless both of you can pay then.</p>${giveRow}
        <div class="trow"><span>You get</span><input id="t-wn" type="number" inputmode="numeric" min="0" step="10" value="50" aria-label="Amount to get"><select id="t-wr" aria-label="Resource to get">${opts('stone')}</select></div>
        <div class="btns">${this.btn('trade-send', 'Send offer', undefined, { primary: true })}${this.btn('deselect', 'Cancel')}</div>`;
    }
    if (this.menu === 'money') {
      const n = owned(s, me.id), hasMarket = Object.values(s.buildings).some((b) => b.owner === me.id && b.type === 'market' && b.done);
      return `<h3>Earning BBD</h3><ul class="money">
        <li><strong>Co-op dues:</strong> every parish you feed pays ${DUES} BBD a second. You feed ${n}, so you earn <strong>${Math.round(DUES * n * 60)} BBD a minute</strong>. Feeding more parishes is the main way to grow your income.</li>
        <li><strong>Roadside stall</strong> at your Town Centre: sell ${STALL.food} food for ${STALL.bbd} BBD, any time.</li>
        <li><strong>Market</strong> (${fmtCost(BT.market.cost)}): better prices, 100 food for 50 BBD or 100 stone for 40 BBD.${hasMarket ? ' You have one.' : ''}</li>
      </ul><div class="btns">${tcOf(s, me.id) ? this.btn('stall-food', `Sell ${STALL.food} food now`, `+${STALL.bbd} BBD`, { primary: true, disabled: me.res.food < STALL.food }) : ''}${this.btn('deselect', 'Close')}</div>`;
    }
    if (this.menu === 'build') {
      return `<h3>Build</h3><p>Costs come out when you place it. Selected or idle workers go build it.</p><div class="grid2">${this.btn('roadmode', 'Road', `${ROAD_COST} stone a tile`, { disabled: me.res.stone < ROAD_COST })}${BUILD_LIST.map((k) => {
        const d = BT[k], locked = (d.age ?? 1) > me.age;
        return this.btn('place:' + k, d.name, locked ? `${AGES[(d.age ?? 1) - 1].short} Age` : fmtCost(d.cost), { disabled: locked || !canAfford(me.res, d.cost) });
      }).join('')}</div>`;
    }
    if (!sel) return `<h3>Grow the island</h3><p>Goal: feed <strong>${winTarget(s)} parishes</strong> and reach the <strong>Co-op Age</strong>. Tap a worker, then tap breadfruit, coral stone, a spring or fish. Tap any parish to see it.</p>`;
    if (sel.kind === 'workers') {
      const ws = this.selectedWorkers(); if (!ws.length) { this.view.sel = null; return this.panelHTML(); }
      const head = ws.length === 1 ? 'Worker' : `${ws.length} workers`;
      const body = ws.length === 1 ? this.wStatus(ws[0]) : `${ws.filter((w) => !w.task).length} idle.`;
      return `<h3>${head}</h3><p>${body} Tap a resource to gather, a farm to work it, a foundation to build it, or land to walk there.</p><div class="btns">${this.btn('build', 'Build…')}${this.btn('deselect', 'Deselect')}</div>`;
    }
    if (sel.kind === 'node') {
      const n = s.nodes[sel.id]; if (!n || n.amt <= 0) { this.view.sel = null; return this.panelHTML(); }
      const d = NT[n.type];
      return `<h3>${d.label}</h3><p>${d.max === Infinity ? 'Never runs dry, but slows in a drought.' : `${Math.ceil(n.amt)} ${d.res} left.`} Select a worker first, then tap here to gather ${d.res}.</p><div class="btns">${this.btn('deselect', 'Close')}</div>`;
    }
    if (sel.kind === 'building') {
      const b = s.buildings[sel.id]; if (!b) { this.view.sel = null; return this.panelHTML(); }
      const d = BT[b.type], mine = b.owner === this.game.me;
      if (b.type === 'port' || b.type === 'airport') return this.landmarkHTML(b.type);
      const ownerName = mine ? '' : ` <span class="tag t-free">${player(s, b.owner)?.name ?? 'AgroCorp'}</span>`;
      if (!b.done) return `<h3>${d.name}${ownerName}</h3><p>Under construction: ${Math.floor(b.progress * 100)}%. Select workers and tap it to help build.</p><div class="btns">${this.btn('deselect', 'Close')}</div>`;
      let info = d.desc, btns = '';
      if (b.type === 'tc' && mine) {
        info = `Trains workers. ${b.queue ? `Training ${b.queue} (next in ${Math.ceil(TRAIN - b.trainT)}s${workersOf(s, me.id).length >= popCap(s, me.id) ? ', needs a house' : ''}).` : ''}`;
        btns += this.btn('train', 'Train worker', '50 food', { primary: true, disabled: me.res.food < 50 || b.queue >= 5 });
        btns += this.btn('stall-food', `Sell ${STALL.food} food`, `+${STALL.bbd} BBD`, { disabled: me.res.food < STALL.food });
        if (me.age < MAX_AGE) {
          const next = AGES[me.age];
          btns += me.ageT >= 0 ? this.btn('noop', `Entering ${next.short} Age…`, `${Math.ceil(next.time - me.ageT)}s left`, { disabled: true })
            : this.btn('age', `Advance to ${next.short} Age`, `${fmtCost(next.cost)} · unlocks ${next.unlocks.charAt(0).toLowerCase()}${next.unlocks.slice(1)}`, { disabled: !canAfford(me.res, next.cost) });
        }
      }
      if (b.type === 'market' && mine) btns += this.btn('sell-food', 'Sell 100 food', '+50 BBD', { disabled: me.res.food < 100 }) + this.btn('sell-stone', 'Sell 100 stone', '+40 BBD', { disabled: me.res.stone < 100 }) + this.btn('buy-water', 'Truck in 100 water', '50 BBD', { disabled: me.res.bbd < 50 });
      if (b.type === 'farm') info = `${b.worker !== null ? 'Being farmed.' : 'No farmer. Select a worker and tap this plot.'}${b.pest > 0 ? ` Pests: ${Math.ceil(b.pest)}s left.` : ''}${me.res.water < 1 ? ' Out of water, so growth is slow.' : ''}`;
      if (b.type === 'aqua') info = aquaPowered(s, b) ? 'Powered by solar. +2 food/s.' : 'No solar array within 5 tiles, so it runs at half speed.';
      if (mine && b.hp < b.maxHp) { const c = Math.ceil((b.maxHp - b.hp) * 0.25); btns += this.btn('repair', 'Repair', `${c} stone`, { disabled: me.res.stone < c }); }
      const hp = `Condition ${Math.round((b.hp / b.maxHp) * 100)}%.${b.type !== 'seawall' && b.type !== 'tc' ? (protectedB(s, b) ? ' Shielded by a seawall.' : ' Not shielded from hurricanes.') : ''}`;
      return `<h3>${d.name}${ownerName}</h3><p>${info} ${hp}</p><div class="btns">${btns}${this.btn('deselect', 'Close')}</div>`;
    }
    if (sel.kind === 'parish') {
      const p = s.parishes[sel.id];
      const op = p.owner && p.owner !== AGRO ? player(s, p.owner) : undefined;
      const tag = p.owner === this.game.me ? '<span class="tag t-you">Your co-op</span>' : p.owner === AGRO ? '<span class="tag t-rival">AgroCorp</span>' : op ? `<span class="tag t-free">${op.name}</span>` : '<span class="tag t-free">Unclaimed</span>';
      let body = '', b2 = '';
      if (p.owner === this.game.me) {
        body = p.id === me.home ? 'Your home parish.' : parishBuilt(s, p, me.id) ? 'Protected by your buildings.' : '<strong>No buildings yet.</strong> AgroCorp can buy it out.';
        body += ' Pays 0.4 BBD/s in co-op dues.';
      } else {
        const block = claimBlock(s, me.id, p);
        if (!block) {
          const c = claimCost(s, me.id, p);
          body = p.owner ? 'Locals will switch if you feed them well.' : 'Hungry and next to your land.';
          b2 = this.btn('claim', p.owner ? 'Win it over' : 'Feed this parish', fmtCost(c), { primary: true, disabled: !canAfford(me.res, c) });
        } else body = block;
      }
      if (s.agro.target === p.id && s.agro.warned) body += ' <strong>AgroCorp is about to buy it.</strong>';
      return `<h3>${p.name}</h3><p>${tag} ${body}</p><div class="btns">${b2}${this.btn('deselect', 'Close')}</div>`;
    }
    return '';
  }
  private landmarkHTML(at: Landmark): string {
    const s = this.s, me = this.me, d = BT[at], holder = landmarkHolder(s, at);
    const holderTxt = holder === me.id ? 'You hold this parish, so you pay no fee.' : holder === AGRO ? '<strong>AgroCorp holds this parish</strong> and takes 10% of every deal.' : holder ? `${player(s, holder)?.name} holds this parish and takes 10% of every deal.` : 'Nobody holds this parish yet, so there is no fee.';
    if (!linked(s, me.id, at)) {
      return `<h3>${d.name}</h3><p>${d.desc} <strong>Not connected.</strong> Lay a road from your Town Centre, a Depot or a Market to any highway (Build → Road), then you can trade here. ${holderTxt}</p><div class="btns">${this.btn('roadmode', 'Lay road', `${ROAD_COST} stone a tile`, { primary: true })}${this.btn('deselect', 'Close')}</div>`;
    }
    const closed = at === 'airport' && !airportOpen(s);
    const deals = (Object.keys(DEALS[at]) as DealId[]).map((id) => {
      const t = dealTerms(s, me.id, at, id), dl = t.deal;
      const sub = dl.get.bbd ? `${fmtCost(dl.give)} → ${t.net} BBD` : `${t.net} BBD → ${fmtCost(dl.get)}`;
      const give = { ...dl.give }; if (give.bbd) give.bbd = t.net;
      return this.btn(`trade:${at}:${id}`, dl.label, sub + (t.fee ? ` (fee ${t.fee})` : ''), { disabled: closed || !canAfford(me.res, give) });
    }).join('');
    let extra = '';
    if (at === 'port') extra = this.btn('boat', `Launch fishing boat (${me.boats}/${MAX_BOATS})`, `${fmtCost(BOAT_COST)} · +${Math.round(BOAT_RATE * 60)} food/min`, { disabled: me.boats >= MAX_BOATS || !canAfford(me.res, BOAT_COST) });
    const note = at === 'port' ? `After each hurricane a relief ship brings ${RELIEF} food to every co-op connected here.` : closed ? '<strong>Closed for the hurricane.</strong>' : `Tourists pay ${Math.round(TOURISM * 60)} BBD a minute to whoever holds Christ Church while it's open.`;
    return `<h3>${d.name}</h3><p>Connected by road. ${holderTxt} ${note}</p><div class="grid2">${deals}${extra}</div><div class="btns" style="margin-top:6px">${this.btn('deselect', 'Close')}</div>`;
  }
  /** True while a finger is down on the panel: automatic refreshes wait so the list doesn't jump or swap under it. */
  private panelHeld = false;
  renderPanel(force = false) {
    if (this.panelHeld && !force) return;
    const h = this.panelHTML();
    if (h === this.lastPanel) return;
    const sameView = h.slice(0, 40) === this.lastPanel.slice(0, 40), top = this.panel.scrollTop;
    this.panel.innerHTML = h; this.lastPanel = h;
    this.panel.classList.toggle('tall', this.menu === 'build');
    if (sameView) this.panel.scrollTop = top;
  }
  private bindPanel() {
    // A button fires when the finger lifts without having scrolled, like a normal phone app.
    // While a finger is down the panel isn't refreshed, so the button can't be swapped out mid-tap.
    let press: { act: string; x: number; y: number; el: HTMLElement } | null = null;
    const cancel = () => { press?.el.classList.remove('pressed'); press = null; this.panelHeld = false; };
    this.panel.addEventListener('pointerdown', (e) => {
      this.panelHeld = true;
      const b = (e.target as HTMLElement).closest('button');
      if (!b || b.disabled) { press = null; return; }
      press = { act: b.dataset.act!, x: e.clientX, y: e.clientY, el: b }; b.classList.add('pressed');
    });
    this.panel.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { press.el.classList.remove('pressed'); press = null; } });
    this.panel.addEventListener('scroll', () => { if (press) { press.el.classList.remove('pressed'); press = null; } }, { passive: true });
    this.panel.addEventListener('pointerup', (e) => {
      const p = press; cancel();
      if (!p) return;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('button');
      if (under === p.el || !under) this.act(p.act);
    });
    this.panel.addEventListener('pointercancel', cancel);
    this.panel.addEventListener('pointerleave', () => { if (!press) this.panelHeld = false; });
    // keyboard (Enter/Space) arrives as a click with no pointer
    this.panel.addEventListener('click', (e) => { if (e.detail !== 0) return; const b = (e.target as HTMLElement).closest('button'); if (b && !b.disabled) this.act(b.dataset.act!); });
  }
  private bindBar() {
    $('#b-build').onclick = () => { if (this.running) this.act('build'); };
    $('#c-bbd').onclick = () => { if (this.running) this.act('money'); };
    $('#b-all').onclick = () => { if (!this.running) return; this.view.sel = { kind: 'workers', ids: new Set(workersOf(this.s, this.game.me).map((w) => w.id)) }; this.menu = null; this.view.buildMode = null; this.renderPanel(true); };
    $('#b-idle').onclick = () => {
      if (!this.running) return;
      const idle = workersOf(this.s, this.game.me).filter((w) => !w.task);
      if (!idle.length) { this.toast('Everyone is busy.'); return; }
      const w = idle[this.idleIdx++ % idle.length];
      this.view.sel = { kind: 'workers', ids: new Set([w.id]) }; this.menu = null; this.view.buildMode = null;
      this.r.centerOn(w.x, w.y); this.renderPanel(true);
    };
    $('#b-pause').onclick = () => {
      if (!this.running) return;
      this.game.paused = !this.game.paused;
      // online, the server confirms the pause for everyone and calls showPaused
      if (!this.game.online) this.showPaused(this.game.paused);
    };
  }
  private bindKeys() {
    addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (e.key === 'Escape') { if (this.dashOpen) this.closeDash(); else this.act('deselect'); }
      if (e.key === 'b') this.act('build');
      if (e.key === ' ') { e.preventDefault(); $('#b-pause').click(); }
    });
  }

  // ---------- touch / mouse
  private bindInput() {
    const cv = this.r.app.canvas;
    const ptrs = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let moved = false, pinchD = 0;
    let lastPaint = -1;
    const tileAt = (sx: number, sy: number) => {
      const tx = Math.floor((sx / this.r.z + this.r.cam.x) / T), ty = Math.floor((sy / this.r.z + this.r.cam.y) / T);
      return tx >= 0 && ty >= 0 && tx < W && ty * W < this.s.map.land.length ? ty * W + tx : -1;
    };
    const canRoad = (i: number) => {
      const s = this.s;
      return i >= 0 && s.map.land[i] === 1 && !s.roads[i] && s.nodeAt[i] < 0 && s.bAt[i] < 0 && s.parishes[s.map.pid[i]]?.owner === this.game.me;
    };
    /** Adds the tiles on the line from the last painted tile to this one, so fast drags leave no gaps. */
    const paint = (sx: number, sy: number) => {
      const i = tileAt(sx, sy); if (i < 0 || i === lastPaint) return;
      const from = lastPaint < 0 ? i : lastPaint;
      const x0 = from % W, y0 = (from / W) | 0, x1 = i % W, y1 = (i / W) | 0;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / Math.max(1, n)), y = Math.round(y0 + ((y1 - y0) * k) / Math.max(1, n)), j = y * W + x;
        if (canRoad(j)) this.view.roadDraft.add(j);
      }
      lastPaint = i;
    };
    const commitRoad = () => {
      if (this.view.roadDraft.size) {
        const res = this.send({ type: 'road', tiles: [...this.view.roadDraft] });
        if (res.ok) this.renderPanel(true);
      }
      this.view.roadDraft.clear(); lastPaint = -1;
    };
    cv.addEventListener('pointerdown', (e) => {
      if (ptrs.size === 0) moved = false;
      try { cv.setPointerCapture(e.pointerId); } catch { /* not all browsers */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); pinchD = 0;
      if (this.view.roadMode && ptrs.size === 1 && this.running) { lastPaint = -1; paint(e.clientX, e.clientY); }
      if (ptrs.size === 2) { this.view.roadDraft.clear(); lastPaint = -1; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 1 && this.view.roadMode && this.running) { moved = true; paint(e.clientX, e.clientY); p.x = e.clientX; p.y = e.clientY; return; }
      if (ptrs.size === 1) {
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 9) moved = true;
        if (moved) { this.r.cam.x -= (e.clientX - p.x) / this.r.z; this.r.cam.y -= (e.clientY - p.y) / this.r.z; this.r.clampCam(); }
      } else if (ptrs.size === 2) {
        moved = true; p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) this.r.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
        pinchD = d; return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      if (ptrs.size === 1 && this.view.roadMode && this.running) { if (e.type === 'pointerup') commitRoad(); else { this.view.roadDraft.clear(); lastPaint = -1; } }
      else if (ptrs.size === 1 && !moved && this.running && e.type === 'pointerup') this.tap(e.clientX, e.clientY);
      ptrs.delete(e.pointerId); pinchD = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.r.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    this.mini.addEventListener('pointerdown', (e) => {
      const rect = this.mini.getBoundingClientRect(), m = this.drawMini();
      const wx = (e.clientX - rect.left - m.ox) / m.s, wy = (e.clientY - rect.top - m.oy) / m.s;
      this.r.cam.x = wx - this.r.vw / this.r.z / 2; this.r.cam.y = wy - this.r.vh / this.r.z / 2; this.r.clampCam();
    });
  }

  // ---------- HUD, minimap, toasts
  private setT(id: string, v: string) { if (this.hudCache[id] !== v) { this.hudCache[id] = v; document.getElementById(id)!.textContent = v; } }
  private hud() {
    const s = this.s, me = this.me;
    this.setT('r-food', String(Math.floor(me.res.food))); this.setT('r-water', String(Math.floor(me.res.water)));
    this.setT('r-stone', String(Math.floor(me.res.stone))); this.setT('r-bbd', String(Math.floor(me.res.bbd)));
    this.setT('r-bbd-rate', `+${Math.round(DUES * owned(s, me.id) * 60)}/min`);
    this.setT('r-pop', `${workersOf(s, me.id).length}/${popCap(s, me.id)}`);
    const nextAge = AGES[me.age];
    this.setT('s-age', me.ageT >= 0 && nextAge ? `${nextAge.short} Age in ${Math.ceil(nextAge.time - me.ageT)}s` : `${AGES[me.age - 1].name} · ${me.age}/${MAX_AGE}`);
    const left = s.weather.nextHurr - s.time;
    this.setT('s-hurr', s.weather.stormT > 0 ? 'Hurricane!' : `Hurricane ${fmtT(left)}`);
    $('#s-hurr').classList.toggle('warn', left < 60 || s.weather.stormT > 0);
    const dr = drought(s); $('#s-dry').hidden = !dr; if (dr) this.setT('s-dry', `Drought ${fmtT(s.weather.droughtUntil - s.time)}`);
    const mine = s.mode === 'coop' ? teamOwned(s, me.team) : owned(s, me.id);
    this.setT('s-par', `You ${mine}/${winTarget(s)} · AgroCorp ${owned(s, AGRO)}/6`);
    // online: one dot per player, faded and struck through while they're away
    const pl = $('#s-players');
    if (this.game.online) {
      const html = s.players.map((p) => { const on = this.game.connected?.(p.id) ?? true, ai = this.game.caretaken?.(p.id) ?? false; return `<span class="pdot${on ? '' : ' off'}${ai ? ' ai' : ''}" style="background:${p.color}" title="${p.name}${on ? '' : ai ? ' (away, computer playing)' : ' (away)'}">${ai ? 'AI' : ''}</span>`; }).join('');
      if (this.hudCache['s-players'] !== html) { this.hudCache['s-players'] = html; pl.innerHTML = html; pl.setAttribute('aria-label', 'Players: ' + s.players.map((p) => `${p.name}${(this.game.connected?.(p.id) ?? true) ? '' : ' away'}`).join(', ')); }
      pl.hidden = false;
    } else pl.hidden = true;
    $('#s-solo').hidden = !!this.game.online;
    $('#s-rival').style.width = Math.min(100, (s.agro.bbd / rivalCost(s)) * 100) + '%';
  }
  drawMini() {
    const mini = this.mini, g = mini.getContext('2d')!, r = this.r;
    const mw = mini.clientWidth, mh = mini.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
    if (mini.width !== mw * d) { mini.width = mw * d; mini.height = mh * d; }
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#0A3478'; g.fillRect(0, 0, mw, mh);
    const WW = W * T, HH = (this.s.map.land.length / W) * T;
    const sc = Math.min(mw / WW, mh / HH), ox = (mw - WW * sc) / 2, oy = (mh - HH * sc) / 2;
    g.drawImage(r.terrainCanvas, ox, oy, WW * sc, HH * sc); g.drawImage(r.ownCanvas, ox, oy, WW * sc, HH * sc);
    for (const w of Object.values(this.s.workers)) { g.fillStyle = player(this.s, w.owner)?.color ?? '#fff'; g.fillRect(ox + w.x * T * sc - 1, oy + w.y * T * sc - 1, 2, 2); }
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 1; g.strokeRect(ox + r.cam.x * sc, oy + r.cam.y * sc, (r.vw / r.z) * sc, (r.vh / r.z) * sc);
    return { s: sc, ox, oy };
  }
  toast(msg: string, kind?: string) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : ''); el.textContent = msg; box.appendChild(el);
    while (box.children.length > 3) box.firstChild!.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4500);
  }

  // ---------- dashboard
  private bindDash() {
    $('#b-dash').onclick = () => { if (this.running) (this.dashOpen ? this.closeDash() : this.openDash()); };
    $('#dash-close').onclick = () => this.closeDash();
    const body = $('#dash-body');
    // act on pointerdown (and keyboard click) so the twice-a-second refresh can't swallow a tap
    const handle = (e: Event) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b || b.disabled) return;
      const a = b.dataset.act!;
      if (a === 'dash-house') { this.closeDash(); this.act('place:house'); return; }
      if (a.startsWith('offer:') || a.startsWith('gift:')) {
        const [kind, pid] = a.split(':') as ['offer' | 'gift', string];
        this.tradeWith = { pid, kind }; this.menu = 'trade'; this.view.buildMode = null; this.closeDash(); this.renderPanel(true); return;
      }
      if (a.startsWith('answer:')) { const [, id, yes] = a.split(':'); this.send({ type: 'answer', offer: Number(id), accept: yes === '1' }); }
      if (a === 'dash-train') { const tc = tcOf(this.s, this.game.me); if (tc) this.send({ type: 'train', building: tc.id }); }
      else if (a === 'dash-idle') this.idleToFood();
      else if (a === 'stall-food') this.send({ type: 'market', trade: 'stall-food' });
      this.renderDash(true);
    };
    let downY = 0;
    body.addEventListener('pointerdown', (e) => { downY = e.clientY; });
    // fire on release only if the finger didn't scroll the sheet
    body.addEventListener('pointerup', (e) => { if (Math.abs(e.clientY - downY) < 10) handle(e); });
    body.addEventListener('click', (e) => { if (e.detail === 0) handle(e); });
  }
  private openDash() { this.dashOpen = true; $('#dash').hidden = false; $('#b-dash').classList.add('on'); this.renderDash(true); }
  private closeDash() { this.dashOpen = false; $('#dash').hidden = true; $('#b-dash').classList.remove('on'); }
  private renderDash(force = false) {
    // don't swap the buttons out from under a finger that's pressing one
    if (!force && this.pressedIn('#dash-body')) return;
    const h = dashboardHTML(this.s, this.game.me, this.flows, (pid) => this.game.connected?.(pid) ?? true, (pid) => this.game.caretaken?.(pid) ?? false);
    if (force || h !== this.lastDash) { $('#dash-body').innerHTML = h; this.lastDash = h; }
  }
  /** Sends each idle worker to the nearest breadfruit tree or fishing spot. */
  private idleToFood() {
    const s = this.s;
    for (const w of workersOf(s, this.game.me).filter((x) => !x.task)) {
      let best = -1, bd = Infinity;
      for (const n of s.nodes) {
        if (n.amt <= 0 || (n.type !== 'tree' && n.type !== 'fish')) continue;
        const d = Math.hypot(n.x + 0.5 - w.x, n.y + 0.5 - w.y); if (d < bd) { bd = d; best = n.id; }
      }
      if (best >= 0) this.send({ type: 'gather', workers: [w.id], node: best });
    }
  }

  // ---------- age-up moment
  private ageUp() {
    const a = AGES[this.me.age - 1];
    this.r.celebrate(this.s, this.game.me);
    const el = $('#ageBanner');
    el.innerHTML = `<div class="kicker">Age ${this.me.age} of ${MAX_AGE}</div><div class="ab-title">${a.name}</div><div class="ab-sub">${a.unlocks}</div>`;
    el.hidden = false; this.bannerT = 4;
    if (this.me.age === 3 && !this.storyShown) { this.storyShown = true; setTimeout(() => this.showStory(), 1400); }
  }
  /** The Recovery Age opens with a short history card. The game pauses while it's open. */
  private showStory() {
    // solo games pause while the card is open; online the game keeps going for everyone
    const card = $('#story'); card.hidden = false;
    if (!this.game.online) this.game.paused = true;
    $('#story-go').onclick = () => { card.hidden = true; if (!this.game.online) { this.game.paused = false; this.showPaused(false); } };
  }

  // ---------- start / end
  showPaused(p: boolean, by?: string) {
    $('#b-pause').textContent = p ? 'Resume' : 'Pause'; $('#b-pause').classList.toggle('on', p);
    if (by && this.game.online) this.toast(p ? `${by} paused the game.` : `${by} resumed the game.`);
  }
  /** Outcome of one of my online commands, arriving with the server tick that applied it. */
  result(r: { ok: boolean; msg?: string }) { if (r.msg) this.toast(r.msg, r.ok ? undefined : 'warn'); }
  start() { $('#overlay').hidden = true; this.running = true; if (!this.game.online) this.game.paused = false; this.showPaused(false); this.renderPanel(true); }
  stop() { this.running = false; this.closeDash(); }
  private end() {
    this.running = false;
    const s = this.s, o = s.ended!, won = o.winners.includes(this.game.me);
    const me = this.me;
    $('#card').innerHTML = `<div class="flag"><i></i><i></i><i></i></div><div class="kicker">${fmtT(s.time)} played</div>
      <h1>${won ? 'Food secure!' : o.winners.includes(AGRO) ? 'Bought out' : 'Out-grown'}</h1>
      <p class="sub">${won ? `Your co-op feeds ${owned(s, me.id)} parishes in the Co-op Age. Barbados eats what Barbados grows.` : o.winners.includes(AGRO) ? `AgroCorp now controls ${owned(s, AGRO)} parishes. Feed more parishes earlier and keep a building in each one.` : `${player(s, o.winners[0])?.name} fed their parishes first.`}</p>
      <ul><li><strong>${Math.floor(me.stats.food)}</strong> food grown and gathered</li><li><strong>${workersOf(s, me.id).length}</strong> workers, <strong>${Object.values(s.buildings).filter((b) => b.owner === me.id && b.done).length}</strong> buildings standing</li><li><strong>${s.weather.hurrIdx}</strong> hurricanes weathered</li></ul>
      <button class="btn primary" id="again">Back to the menu</button>`;
    $('#overlay').hidden = false;
    $('#again').onclick = () => this.onEnd();
  }
}
