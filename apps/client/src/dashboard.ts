import {
  AGRO, BOAT_RATE, BT, DIFFICULTY, DUES, EAT, MAX_BOATS, NT, RES, STALL, TOURISM, TRAIN, airportOpen, drought, landmarkHolder, linked, owned, parishBuilt, player, popCap,
  resourcesOnLand, rivalCost, roadNetwork, tcOf, workersOf,
  type Flow, type Res, type State,
} from '@bim/sim';

const RES_LABEL: Record<Res, string> = { food: 'Food', water: 'Water', stone: 'Coral stone', bbd: 'BBD' };
const fmtT = (sec: number) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const sgn = (v: number) => (v >= 0.5 ? `+${n0(v)}` : v <= -0.5 ? `−${n0(-v)}` : '0');

/** Keeps the last 30 seconds of each player's running totals, to turn them into per-minute rates. */
export class FlowTracker {
  private samples: { t: number; f: Flow }[] = [];
  sample(s: State, me: string) {
    const p = player(s, me); if (!p) return;
    const last = this.samples[this.samples.length - 1];
    if (last && s.time - last.t < 1) return;
    this.samples.push({ t: s.time, f: structuredClone(p.flow) });
    while (this.samples.length > 31) this.samples.shift();
  }
  reset() { this.samples = []; }
  /** Per-minute rates over the window, or null until there are a few seconds of data. */
  rates(): { gain: Record<Res, number>; upkeep: Record<Res, number>; eaten: number } | null {
    if (this.samples.length < 4) return null;
    const a = this.samples[0], b = this.samples[this.samples.length - 1], k = 60 / Math.max(1, b.t - a.t);
    const per = (x: Record<Res, number>, y: Record<Res, number>) => Object.fromEntries(RES.map((r) => [r, (y[r] - x[r]) * k])) as Record<Res, number>;
    return { gain: per(a.f.gain, b.f.gain), upkeep: per(a.f.upkeep, b.f.upkeep), eaten: (b.f.eaten - a.f.eaten) * k };
  }
}

/** The dashboard's HTML for the local player. Buttons carry data-act values the UI handles. */
export function dashboardHTML(s: State, me: string, tr: FlowTracker): string {
  const p = player(s, me)!, ws = workersOf(s, me), cap = popCap(s, me), r = tr.rates();
  const eatPerMin = EAT * 60 * ws.length;
  // ---------- food
  const gainFood = r?.gain.food ?? 0, net = gainFood - eatPerMin;
  const lasts = net < -0.5 ? p.res.food / -net : Infinity;
  const foodState = p.hungry
    ? '<span class="pill bad">Hungry: workers at half speed</span>'
    : net < -0.5 ? `<span class="pill warn">Lasts about ${Math.max(1, Math.floor(lasts))} min</span>`
      : '<span class="pill good">Growing</span>';
  const food = `<section class="dcard"><h4>Food ${foodState}</h4>
    <div class="big">${n0(p.res.food)}<span>stocked</span></div>
    <dl class="kv">
      <dt>Gathered and grown</dt><dd class="pos">${r ? sgn(gainFood) : '…'} /min</dd>
      <dt>Eaten by ${ws.length} worker${ws.length === 1 ? '' : 's'} (${EAT * 60} each)</dt><dd class="neg">−${n0(eatPerMin)} /min</dd>
      <dt>Net</dt><dd class="${net >= 0 ? 'pos' : 'neg'}">${r ? sgn(net) : '…'} /min</dd>
    </dl></section>`;
  // ---------- stockpiles
  const rows = RES.map((k) => {
    const gin = r?.gain[k] ?? 0, gout = (r?.upkeep[k] ?? 0) + (k === 'food' ? eatPerMin : 0);
    const note = k === 'bbd' ? `dues ${n0(DUES * 60 * owned(s, me))}/min` : k === 'water' && drought(s) ? 'drought' : '';
    return `<tr><th>${RES_LABEL[k]}</th><td>${n0(p.res[k])}</td><td class="pos">${r ? sgn(gin) : '…'}</td><td class="neg">${gout >= 0.5 ? '−' + n0(gout) : '0'}</td><td class="note">${note}</td></tr>`;
  }).join('');
  const stock = `<section class="dcard"><h4>Stockpiles</h4><div class="tw"><table class="dt"><thead><tr><th></th><th>Stock</th><th>In/min</th><th>Use/min</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">Use counts eating and running costs (farms and aquaponics drink water). Building costs aren't included.</p></section>`;
  // ---------- people
  const houses = Object.values(s.buildings).filter((b) => b.owner === me && b.type === 'house');
  const doneH = houses.filter((b) => b.done).length, tc = tcOf(s, me);
  const people = `<section class="dcard"><h4>People ${ws.length >= cap ? '<span class="pill warn">Full</span>' : ''}</h4>
    <div class="big">${ws.length}<span>of ${cap} room</span></div>
    <dl class="kv">
      <dt>Town Centre</dt><dd>houses ${BT.tc.pop}</dd>
      <dt>Chattel houses (${doneH}${houses.length > doneH ? ` + ${houses.length - doneH} building` : ''})</dt><dd>${BT.house.pop} each · ${doneH * (BT.house.pop ?? 0)} total</dd>
      ${tc && tc.queue ? `<dt>Training</dt><dd>${tc.queue} queued, next in ${Math.ceil(TRAIN - tc.trainT)}s</dd>` : ''}
    </dl>
    <p class="hint">Each new worker eats ${EAT * 60} food a minute. A Chattel House costs ${BT.house.cost.stone} stone and makes room for ${BT.house.pop} more.</p>
    <div class="btns"><button class="btn" data-act="dash-house">Build a Chattel House</button>${tc ? `<button class="btn" data-act="dash-train"${p.res.food < 50 ? ' disabled' : ''}>Train worker<small>50 food</small></button>` : ''}</div></section>`;
  // ---------- workers
  const count = { idle: 0, tree: 0, fish: 0, rock: 0, spring: 0, farm: 0, build: 0, move: 0 };
  for (const w of ws) {
    const t = w.task;
    if (!t) count.idle++; else if (t.k === 'gather') count[s.nodes[t.n].type]++; else count[t.k]++;
  }
  const wrow = (label: string, v: number) => (v ? `<dt>${label}</dt><dd>${v}</dd>` : '');
  const workers = `<section class="dcard"><h4>Workers ${count.idle ? `<span class="pill warn">${count.idle} idle</span>` : ''}</h4><dl class="kv">
      ${wrow('Idle', count.idle)}${wrow('Breadfruit', count.tree)}${wrow('Fishing', count.fish)}${wrow('Coral stone', count.rock)}${wrow('Water', count.spring)}
      ${wrow('Farming', count.farm)}${wrow('Building', count.build)}${wrow('Walking', count.move)}
    </dl>${count.idle ? '<div class="btns"><button class="btn primary" data-act="dash-idle">Put idle workers on food</button></div>' : ''}</section>`;
  // ---------- land
  const land = resourcesOnLand(s, me);
  const lrow = (t: keyof typeof land, one: string, many: string) => {
    const unit = land[t].count === 1 ? one : many;
    const v = land[t], d = NT[t];
    const amt = d.max === Infinity ? 'never runs dry' : `${n0(v.left)} ${d.res} left`;
    return `<tr><th>${d.label}${d.max !== Infinity ? `<small>up to ${d.max} each</small>` : ''}</th><td>${v.count} ${unit}</td><td>${amt}</td></tr>`;
  };
  const landHTML = `<section class="dcard"><h4>On your land</h4><div class="tw"><table class="dt"><tbody>
      ${lrow('tree', 'tree', 'trees')}${lrow('fish', 'spot', 'spots')}${lrow('rock', 'deposit', 'deposits')}${lrow('spring', 'spring', 'springs')}
    </tbody></table></div><p class="hint">Counts resources inside your parishes and the fish just off their coasts. Feed more parishes to reach more.</p></section>`;
  // ---------- buildings
  const mine = Object.values(s.buildings).filter((b) => b.owner === me && b.done);
  const by = (t: string) => mine.filter((b) => b.type === t);
  const farms = by('farm');
  const brow = (t: keyof typeof BT, effect: string) => (by(t).length ? `<dt>${BT[t].name} × ${by(t).length}</dt><dd>${effect}</dd>` : '');
  const blds = `<section class="dcard"><h4>Buildings</h4><dl class="kv">
      ${brow('farm', `${farms.filter((f) => f.worker !== null).length} farmed${farms.some((f) => f.pest > 0) ? ' · pests!' : ''}`)}
      ${brow('cistern', `+${n0(by('cistern').length * 0.5 * 60)} water/min${drought(s) ? ' (dry now)' : ''}`)}
      ${brow('depot', 'drop-off points')}${brow('market', 'best prices')}${brow('seawall', 'hurricane shield, 5 tiles')}
      ${brow('aqua', '+2 food/s each with solar')}${brow('solar', 'powers aquaponics')}
      ${mine.length <= 1 ? '<dt>Only your Town Centre so far</dt><dd></dd>' : ''}
    </dl></section>`;
  // ---------- parishes
  const ps = s.parishes.filter((q) => q.owner === me);
  const prow = ps.map((q) => {
    const status = q.id === p.home ? '<span class="pill good">Home</span>' : parishBuilt(s, q, me) ? '<span class="pill good">Protected</span>' : '<span class="pill bad">No buildings</span>';
    return `<li><span>${q.name}</span>${status}</li>`;
  }).join('');
  const tgt = s.agro.target !== null && s.agro.warned ? s.parishes[s.agro.target].name : null;
  const pars = `<section class="dcard"><h4>Parishes</h4><ul class="plist">${prow}</ul>
    <dl class="kv"><dt>AgroCorp holds</dt><dd>${owned(s, AGRO)} of 11</dd><dt>Its next buyout</dt><dd>${s.time < DIFFICULTY[s.difficulty].grace ? `starts saving in ${fmtT(DIFFICULTY[s.difficulty].grace - s.time)}` : Math.min(100, Math.round((s.agro.bbd / rivalCost(s)) * 100)) + '% saved'}${tgt ? ` · <strong>${tgt}</strong>` : ''}</dd></dl>
    <p class="hint">A parish with no buildings of yours can be bought out. Each one you feed pays ${n0(DUES * 60)} BBD a minute.</p></section>`;
  // ---------- port and airport
  const roadNet = roadNetwork(s, me);
  const lm = (t: 'port' | 'airport') => {
    const ok = linked(s, me, t, roadNet), h = landmarkHolder(s, t);
    const who = h === me ? 'you' : h === AGRO ? 'AgroCorp' : h ? player(s, h)?.name : 'nobody';
    return `<dt>${BT[t].name}</dt><dd>${ok ? '<span class="pill good">Connected</span>' : '<span class="pill warn">No road link</span>'}</dd><dt class="sub">Fee goes to</dt><dd class="sub">${who}</dd>`;
  };
  const myRoads = s.roads.reduce((a, v) => a + (v === 2 ? 1 : 0), 0);
  const trade = `<section class="dcard"><h4>Roads and trade</h4><dl class="kv">
      ${lm('port')}${lm('airport')}
      <dt>Fishing boats</dt><dd>${p.boats}/${MAX_BOATS}${p.boats ? ` · +${Math.round(p.boats * BOAT_RATE * 60)} food/min` : ''}</dd>
      ${landmarkHolder(s, 'airport') === me ? `<dt>Tourism</dt><dd>${airportOpen(s) ? `+${Math.round(TOURISM * 60)} BBD/min` : 'airport closed'}</dd>` : ''}
      <dt>Road tiles built</dt><dd>${myRoads}</dd>
    </dl><p class="hint">Tap the port or airport on the map to trade. Your Town Centre, a Depot or a Market must connect to it by road.</p></section>`;
  // ---------- threats
  const pests = farms.filter((f) => f.pest > 0).length;
  const threats = `<section class="dcard"><h4>Threats</h4><dl class="kv">
      <dt>Next hurricane</dt><dd>${s.weather.stormT > 0 ? 'Now!' : fmtT(s.weather.nextHurr - s.time)}</dd>
      <dt>Drought</dt><dd>${drought(s) ? `now, ${fmtT(s.weather.droughtUntil - s.time)} left` : `next in about ${fmtT(s.weather.nextDrought - s.time)}`}</dd>
      <dt>Pests</dt><dd>${pests ? `${pests} farm${pests > 1 ? 's' : ''} hit` : 'none'}</dd>
    </dl></section>`;
  const sell = p.res.food >= STALL.food && tc ? `<button class="btn" data-act="stall-food">Sell ${STALL.food} food<small>+${STALL.bbd} BBD</small></button>` : '';
  return `<div class="dgrid">${food}${people}${stock}${workers}${landHTML}${trade}${blds}${pars}${threats}</div>${sell ? `<div class="btns dfoot">${sell}</div>` : ''}`;
}
