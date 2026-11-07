import { AGES, BT, COMPOST_R, HOUSES, SCORE, SEA_R, WINDBREAK_R, fmtCost, type BType, type Cost } from '@bim/sim';

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
    if (lvl > 1) rows.push(['Good looks', `+${lvl - 1} (★ ${(lvl - 1) * SCORE.beauty} on your town score)`]);
    if (h.garden) rows.push([lvl >= 4 ? 'Rooftop garden' : 'Kitchen garden', `+${Math.round(h.garden * 60)} food a minute`]);
  } else {
    const d = BT[type];
    about = d.desc;
    if (d.pop) rows.push(['Holds', `${d.pop} people`]);
    if (type === 'seawall') rows.push(['Hurricanes', `Shields buildings within ${SEA_R} tiles`]);
    else if (type === 'windbreak') rows.push(['Hurricanes', `Shields buildings within ${WINDBREAK_R} tiles`]);
    else if (type === 'composter') rows.push(['Reach', `Farm plots within ${COMPOST_R} tiles`]);
    else if (d.deco) rows.push(['Hurricanes', d.w * d.h > 1 ? 'Stands up to storms' : 'Can blow away without a windbreak']);
    else if (type !== 'tc' && type !== 'hq') rows.push(['Hurricanes', 'Needs a seawall or windbreak nearby']);
    if (d.beauty) rows.push(['Good looks', `+${d.beauty} (★ ${d.beauty * SCORE.beauty} on your town score)`]);
    if (d.income) rows.push(['Earns', `+${Math.round(d.income * 60)} BBD a minute`]);
    if (d.coast) rows.push(['Where', 'On your shore']);
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

/** The Town Centre in each age: its name and a line about it. Its picture changes to match. */
export const TC_LOOKS = [
  { name: 'Gathering Hall', about: 'Timber and thatch round a fire pit. Where the first co-op meets and shares out the day\'s food.' },
  { name: 'Village Hall', about: 'Timber walls and a galvanised roof. The co-op keeps its books and seed stores here.' },
  { name: 'Coral Stone Town Hall', about: 'Thick walls of cut coral stone, built to last, with a farm plot out back.' },
  { name: 'Green Tech Centre', about: 'Solar on the roof and a rainwater tank: the co-op runs on its own power and water.' },
  { name: 'Co-op Hall', about: 'A market under the canopy where the whole island buys and sells what it grows.' },
];
