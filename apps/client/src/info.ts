import { AGES, BT, COMPOST_R, HOUSES, SEA_R, WINDBREAK_R, fmtCost, type BType, type Cost } from '@bim/sim';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const WIND = ['Blows down easily', 'Handles high winds (half the damage)', 'Hurricane-proof'];

/**
 * A short fact card about a kind of building: what it holds, how it stands up to hurricanes, what extra it gives,
 * and, for houses, what it becomes in the next age. Used in the Build menu, while placing, and on a tapped building.
 */
export function infoCard(type: BType, lvl = 1, opts: { cost?: Cost; showNext?: boolean } = {}): string {
  const rows: [string, string][] = [];
  let about = '';
  if (type === 'house') {
    const h = HOUSES[lvl - 1];
    about = h.about;
    rows.push(['Holds', `${h.pop} people`]);
    rows.push(['Hurricanes', WIND[h.wind]]);
    if (h.garden) rows.push([lvl >= 4 ? 'Rooftop garden' : 'Kitchen garden', `+${Math.round(h.garden * 60)} food a minute`]);
  } else {
    const d = BT[type];
    about = d.desc;
    if (d.pop) rows.push(['Holds', `${d.pop} people`]);
    if (type === 'seawall') rows.push(['Hurricanes', `Shields buildings within ${SEA_R} tiles`]);
    else if (type === 'windbreak') rows.push(['Hurricanes', `Shields buildings within ${WINDBREAK_R} tiles`]);
    else if (type === 'composter') rows.push(['Reach', `Farm plots within ${COMPOST_R} tiles`]);
    else if (type !== 'tc') rows.push(['Hurricanes', 'Needs a seawall or windbreak nearby']);
    if (d.drop) rows.push(['Drop-off', 'Workers bring resources here']);
  }
  if (opts.cost) rows.push(['Costs', fmtCost(opts.cost) || 'Free']);
  let next = '';
  if (type === 'house' && opts.showNext !== false && lvl < HOUSES.length) {
    const n = HOUSES[lvl];
    next = `<p class="next">Next: <strong>${n.name}</strong> in the ${AGES[lvl].name}. Holds ${n.pop}${n.wind > HOUSES[lvl - 1].wind ? `, ${WIND[n.wind].toLowerCase()}` : ''}.</p>`;
  }
  return `<div class="info"><p class="about">${esc(about)}</p><dl class="kv facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${next}</div>`;
}
