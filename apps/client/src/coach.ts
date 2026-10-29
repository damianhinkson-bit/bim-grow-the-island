import { HOUSES, houseLevelFor, tcOf, workersOf, type Player, type State } from '@bim/sim';
import type { View } from './render';

/**
 * The guided first few minutes: one small job at a time, each pointed at on the map or in the controls, ticked off
 * when the player actually does it. Shown once per browser (and again only if asked for); Skip ends it.
 */
export interface CoachView { step: number; total: number; title: string; text: string; tile?: { x: number; y: number }; el?: string }
interface Step { title: string; text: (c: Ctx) => string; done: (c: Ctx) => boolean; tile?: (c: Ctx) => { x: number; y: number } | undefined; el?: string }
interface Ctx { s: State; me: Player; view: View; pop: string | null; startWorkers: number }

const KEY = 'bim:coach-done';
const nearest = (c: Ctx, types: string[]) => {
  const ws = workersOf(c.s, c.me.id), w = ws[0]; if (!w) return undefined;
  let best: { x: number; y: number } | undefined, bd = Infinity;
  for (const n of c.s.nodes) {
    if (n.amt <= 0 || !types.includes(n.type)) continue;
    const d = (n.x - w.x) ** 2 + (n.y - w.y) ** 2; if (d < bd) { bd = d; best = { x: n.x + 0.5, y: n.y + 0.5 }; }
  }
  return best;
};
const gathering = (c: Ctx, types: string[]) => workersOf(c.s, c.me.id).some((w) => w.task?.k === 'gather' && types.includes(c.s.nodes[w.task.n].type));

const STEPS: Step[] = [
  { title: 'Pick a worker', text: () => 'Tap one of your workers, the little people in your colour near your Town Centre.',
    done: (c) => c.view.sel?.kind === 'workers' || gathering(c, ['tree', 'fish', 'rock', 'spring']),
    tile: (c) => { const w = workersOf(c.s, c.me.id).find((q) => !q.task) ?? workersOf(c.s, c.me.id)[0]; return w ? { x: w.x, y: w.y } : undefined; } },
  { title: 'Gather food', text: () => 'Now tap a breadfruit tree. Your worker will pick fruit and carry it home. Food feeds your people.',
    done: (c) => gathering(c, ['tree', 'fish']), tile: (c) => nearest(c, ['tree']) },
  { title: 'Grow your co-op', text: () => 'Tap your Town Centre, then Train worker. More hands gather more.',
    done: (c) => (tcOf(c.s, c.me.id)?.queue ?? 0) > 0 || workersOf(c.s, c.me.id).length > c.startWorkers,
    tile: (c) => { const t = tcOf(c.s, c.me.id); return t ? { x: t.x + 1, y: t.y + 0.4 } : undefined; } },
  { title: 'Cut coral stone', text: () => 'Pick another worker and tap a pale coral rock. You build with stone.',
    done: (c) => gathering(c, ['rock']), tile: (c) => nearest(c, ['rock']) },
  { title: 'Build a home', text: (c) => `Tap Build, then ${HOUSES[houseLevelFor(c.s, c.me.id) - 1].name}, then an empty spot in your parish. Homes make room for more people.`,
    done: (c) => Object.values(c.s.buildings).some((b) => b.owner === c.me.id && b.type === 'house'), el: '#b-build' },
  { title: 'Watch your money', text: () => 'Tap the gold money badge. It shows where your BBD comes from and how to earn more.',
    done: (c) => c.pop === 'bbd', el: '#c-bbd' },
];

export class Coach {
  private i = 0;
  private startWorkers = 0;
  active: boolean;
  private finishedAt = -1;
  constructor() {
    let done = false; try { done = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
    this.active = !done;
  }
  start(s: State, me: string) {
    let done = false; try { done = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
    this.active = !done; this.i = 0; this.finishedAt = -1; this.startWorkers = workersOf(s, me).length;
  }
  skip() { this.active = false; try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } }
  restart() { this.active = true; this.i = 0; this.finishedAt = -1; try { localStorage.removeItem(KEY); } catch { /* blocked */ } }
  /** The current job, moving on past any already done; a short well-done at the end, then it goes away. */
  update(s: State, me: Player, view: View, pop: string | null): CoachView | null {
    if (!this.active) return null;
    const c: Ctx = { s, me, view, pop, startWorkers: this.startWorkers };
    while (this.i < STEPS.length && STEPS[this.i].done(c)) this.i++;
    if (this.i >= STEPS.length) {
      if (this.finishedAt < 0) this.finishedAt = s.time;
      if (s.time - this.finishedAt > 14) { this.skip(); return null; }
      return { step: STEPS.length, total: STEPS.length, title: "You're growing!", text: 'Next: advance to the Farming Age at your Town Centre, and tap a parish next to yours to feed it. Tap any icon at the top to learn what it means.' };
    }
    const st = STEPS[this.i];
    return { step: this.i + 1, total: STEPS.length, title: st.title, text: st.text(c), tile: st.tile?.(c), el: st.el };
  }
}
