import {
  AGES, AGRO, DIFFICULTY, DUES, EAT, HOUSES, MAX_AGE, STALL, drought, fmtCost, houseLevelFor, owned, player, popCap, rivalPrice, tcOf,
  teamOwned, winTarget, workersOf, type Player, type Res, type State,
} from '@bim/sim';
import { ICON, type IconName } from './icons';

export type PopKind = 'food' | 'water' | 'stone' | 'people' | 'bbd' | 'age' | 'storm' | 'drought' | 'parishes' | 'agro';
export interface PopCtx {
  s: State; me: Player;
  rates: { gain: Record<Res, number>; upkeep: Record<Res, number>; spent: Record<Res, number>; eaten: number } | null;
}

const fmtT = (sec: number) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const n0 = (v: number) => Math.round(v).toLocaleString('en');
const sign = (v: number) => (v >= 0 ? '+' : '−') + n0(Math.abs(v));
const btn = (act: string, label: string, opts: { primary?: boolean; disabled?: boolean } = {}) =>
  `<button class="btn${opts.primary ? ' primary' : ''}" data-act="${act}"${opts.disabled ? ' disabled' : ''}>${label}</button>`;
const head = (icon: IconName, title: string, value: string) => `<div class="pop-head">${ICON[icon]}<strong>${title}</strong><span class="pop-val">${value}</span></div>`;
/** Rows of what comes in and goes out each minute. */
const flow = (rows: [string, number][]) => {
  const net = rows.reduce((a, [, v]) => a + v, 0);
  return `<dl class="kv pop-flow">${rows.map(([k, v]) => `<dt>${k}</dt><dd class="${v >= 0 ? 'up' : 'down'}">${sign(v)}/min</dd>`).join('')}<dt><strong>Overall</strong></dt><dd class="${net >= 0 ? 'up' : 'down'}"><strong>${sign(net)}/min</strong></dd></dl>`;
};
const warming = '<p class="pop-hint">Working out your rates…</p>';

/**
 * What each top-bar item means, how you get it, what uses it, and how it's going right now. Opened by tapping the item;
 * the item stays highlighted while its pop-up is open, so you can see which one you're reading about.
 */
export function popContent(kind: PopKind, { s, me, rates }: PopCtx): string {
  const r = me.res, ws = workersOf(s, me.id), cap = popCap(s, me.id);
  switch (kind) {
    case 'food': {
      const eat = EAT * 60 * ws.length, gain = rates?.gain.food ?? 0, net = gain - eat;
      const lasts = net < -0.5 ? `<p class="pop-warn">At this rate your food runs out in about ${Math.max(1, Math.floor(r.food / -net))} min.</p>` : '';
      return head('food', 'Food', n0(r.food)) +
        `<p>Breadfruit, flying fish and farm crops. Your people eat it, and you spend it to train workers, advance ages and feed parishes.</p>` +
        (rates ? flow([['Gathered and grown', gain], [`Eaten by ${ws.length} people`, -eat]]) : warming) + lasts +
        `<p class="pop-hint">Get more: tap a worker, then a breadfruit tree or fish. Farm plots (Farming Age) grow food without running out.</p>`;
    }
    case 'water': {
      const gain = rates?.gain.water ?? 0, use = rates?.upkeep.water ?? 0;
      return head('water', 'Water', n0(r.water)) +
        `<p>From springs and cisterns. Farm plots and aquaponics use it, and you need it to advance ages and feed parishes.</p>` +
        (rates ? flow([['Collected', gain], ['Used by farms and aquaponics', -use]]) : warming) +
        `<p class="pop-hint">Get more: send a worker to a blue spring. A cistern (Farming Age) catches rain on its own${drought(s) ? ', but not in a drought' : ''}.</p>`;
    }
    case 'stone': {
      const gain = rates?.gain.stone ?? 0, used = (rates?.upkeep.stone ?? 0) + (rates?.spent.stone ?? 0);
      return head('stone', 'Coral stone', n0(r.stone)) +
        `<p>Cut from the coral rock that Barbados sits on. You build with it: houses, farms, roads and repairs.</p>` +
        (rates ? flow([['Quarried', gain], ['Spent on building', -used]]) : warming) +
        `<p class="pop-hint">Get more: tap a worker, then a pale coral rock.</p>`;
    }
    case 'people': {
      const tc = tcOf(s, me.id), full = ws.length >= cap, h = HOUSES[houseLevelFor(s, me.id) - 1];
      return head('people', 'People', `${ws.length} of ${cap}`) +
        `<p>Your workers, and how many you have room for. Each one eats ${EAT * 60} food a minute.</p>` +
        `<dl class="kv"><dt>Workers</dt><dd>${ws.length}</dd><dt>Room in your homes</dt><dd>${cap}</dd><dt>Idle right now</dt><dd>${ws.filter((w) => !w.task).length}</dd></dl>` +
        (full ? `<p class="pop-warn">You're full. Build a ${h.name} (room for ${h.pop}) or upgrade a house.</p>` : `<p class="pop-hint">Train a worker at your Town Centre for 50 food.</p>`) +
        `<div class="btns">${tc ? btn('train', 'Train a worker · 50 food', { primary: !full, disabled: r.food < 50 || full }) : ''}${btn('place:house', `Build a ${h.name}`, { primary: full })}</div>`;
    }
    case 'bbd': {
      const n = owned(s, me.id), dues = DUES * n * 60, gain = rates?.gain.bbd ?? dues, spent = (rates?.upkeep.bbd ?? 0) + (rates?.spent.bbd ?? 0);
      return head('bbd', 'Money', `${n0(r.bbd)} BBD`) +
        `<p>Barbados dollars. You need money to advance ages, feed parishes, and build cisterns, aquaponics and solar.</p>` +
        `<dl class="kv pop-flow"><dt>Co-op dues from ${n} parish${n === 1 ? '' : 'es'}</dt><dd class="up">+${n0(dues)}/min</dd>` +
        (gain - dues > 1 ? `<dt>Sales and trade</dt><dd class="up">+${n0(gain - dues)}/min</dd>` : '') +
        (spent > 1 ? `<dt>Spent</dt><dd class="down">−${n0(spent)}/min</dd>` : '') + `</dl>` +
        `<p class="pop-hint">Earn more: feed more parishes (each pays ${DUES * 60} BBD a minute), or sell spare food.</p>` +
        `<div class="btns">${tcOf(s, me.id) ? btn('stall-food', `Sell ${STALL.food} food for ${STALL.bbd} BBD`, { primary: true, disabled: r.food < STALL.food }) : ''}</div>`;
    }
    case 'age': {
      const next = AGES[me.age];
      const status = me.ageT >= 0 && next ? `<p class="pop-hint">Advancing now: ready in ${Math.ceil(next.time - me.ageT)}s.</p>` : '';
      return head('age', AGES[me.age - 1].name, `${me.age} of ${MAX_AGE}`) +
        `<p>Five ages, from foraging to the Co-op Age. Each one unlocks new buildings and better houses. You must reach the Co-op Age to win.</p>` +
        (next ? `<dl class="kv"><dt>Next</dt><dd>${next.name}</dd><dt>Costs</dt><dd>${fmtCost(next.cost)}</dd><dt>Unlocks</dt><dd>${next.unlocks}</dd></dl>${status}<div class="btns">${btn('age', `Advance to ${next.short} Age`, { primary: true, disabled: me.ageT >= 0 })}</div>` : '<p class="pop-hint">You\'ve reached the final age.</p>');
    }
    case 'storm': {
      const left = s.weather.nextHurr - s.time;
      return head('storm', 'Hurricane', s.weather.stormT > 0 ? 'Now!' : `in ${fmtT(left)}`) +
        `<p>Hurricanes knock down or damage buildings, strip breadfruit trees and sink fishing boats. AgroCorp loses money too.</p>` +
        `<p class="pop-hint">Protect your co-op: a seawall shields buildings near the coast, a windbreak shields them inland, and coral stone houses or better stand up on their own.</p>`;
    }
    case 'drought':
      return head('sun', 'Drought', fmtT(s.weather.droughtUntil - s.time)) +
        `<p>No rain: cisterns stop filling and springs slow down. Farms and aquaponics still use water.</p><p class="pop-hint">Keep a stock of water before one hits.</p>`;
    case 'parishes': {
      const mine = s.mode === 'coop' ? teamOwned(s, me.team) : owned(s, me.id), target = winTarget(s);
      return head('parish', 'Parishes fed', `${mine} of ${target}`) +
        `<p>Win by feeding <strong>${target} of the 11 parishes</strong> and reaching the <strong>Co-op Age</strong>.</p>` +
        `<p class="pop-hint">Tap a parish next to yours to feed it. Then put a building in it, so AgroCorp${s.players.length > 1 ? ' and rivals' : ''} can't take it.</p>`;
    }
    case 'agro': {
      const ag = s.agro, d = DIFFICULTY[s.difficulty];
      let now: string;
      if (s.time < d.grace) now = `Setting up. Starts buying land in ${fmtT(d.grace - s.time)}.`;
      else if (ag.target !== null) {
        const p = s.parishes[ag.target], pct = Math.min(99, Math.floor((ag.bbd / rivalPrice(s)) * 100));
        const whose = p.owner === me.id ? 'your parish ' : p.owner && p.owner !== AGRO ? `${player(s, p.owner)?.name}'s parish ` : '';
        now = ag.warned ? `<strong>About to buy ${whose}${p.name}</strong> (${pct}% saved).` : `Surveying ${whose}${p.name}, ${pct}% of the price saved.`;
      } else now = 'No land it can buy right now.';
      return head('agro', 'AgroCorp', `${owned(s, AGRO)} of 6`) +
        `<p>A big agribusiness buying up the island for cane. If it owns 6 parishes, everyone loses.</p>` +
        `<dl class="kv"><dt>Now</dt><dd>${now}</dd></dl>` +
        `<p class="pop-hint">Stop it: feed parishes before it buys them, and keep a building in each of yours. It can't buy a parish with your building in it.</p>` +
        `<div class="btns">${btn('pop-agro', 'Show me on the map', { primary: true })}</div>`;
    }
  }
}
