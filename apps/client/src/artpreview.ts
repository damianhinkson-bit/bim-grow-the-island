// Development only: lays out a sample town with every sprite, to check the pixel art.
import { PX, buildingTex, drawGround, drawPath, nodeTex, workerTex } from './pixel';
import type { BType, NodeType } from '@bim/sim';

const TW = 30, TH = 22, S = 3;
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = TW * PX * S; c.height = TH * PX * S;
const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
const ground = document.createElement('canvas'); ground.width = TW * PX; ground.height = TH * PX;
const gg = ground.getContext('2d')!;
const kindAt = (x: number, y: number) => (x < 0 || y < 0 || x >= TW || y >= TH ? 4 : y === 0 || y === TH - 1 || x === TW - 1 ? 4 : x < 3 ? 3 : x < 5 ? 2 : x < 7 ? 1 : 0);
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) drawGround(gg, kindAt(x, y), x, y, x * PX, y * PX, (dx, dy) => kindAt(x + dx, y + dy));
const path = new Set<number>(); for (let x = 8; x < 29; x++) path.add(10 * TW + x); for (let y = 4; y < 20; y++) path.add(y * TW + 15);
for (const i of path) { const x = i % TW, y = (i / TW) | 0; drawPath(gg, x > 20 ? 0 : y > 12 ? 2 : 1, x, y, x * PX, y * PX, { l: path.has(i - 1), r: path.has(i + 1), u: path.has(i - TW), d: path.has(i + TW) }); }
g.drawImage(ground, 0, 0, ground.width * S, ground.height * S);
const items: { y: number; draw: () => void }[] = [];
const put = (src: { source: { resource: CanvasImageSource; width: number; height: number } }, tx: number, ty: number, w: number, h: number) => {
  const cv = src.source.resource, cw = src.source.width, ch = src.source.height;
  items.push({ y: ty + h, draw: () => g.drawImage(cv, (tx * PX + (w * PX - cw) / 2) * S, ((ty + h) * PX - ch) * S, cw * S, ch * S) });
};
const nodes: [NodeType, number, number, number][] = [['tree', 9, 3, 0], ['tree', 10, 4, 1], ['tree', 11, 2, 2], ['tree', 12, 5, 0], ['rock', 9, 16, 0], ['rock', 10, 17, 1], ['spring', 12, 17, 0], ['fish', 3, 6, 0], ['fish', 4, 12, 0]];
for (const [t, x, y, v] of nodes) put(nodeTex(t, v) as never, x, y, 1, 1);
const blds: [BType, number, number, number, number, number, number][] = [
  ['tc', 16, 6, 3, 3, 1, 0], ['tc', 25, 2, 3, 3, 3, 0], ['tc', 25, 13, 3, 3, 5, 0],
  ['house', 17, 12, 2, 2, 1, 0], ['house', 20, 12, 2, 2, 2, 1], ['house', 17, 16, 2, 2, 3, 2], ['house', 20, 16, 2, 2, 4, 3], ['house', 23, 17, 2, 2, 5, 4],
  ['farm', 8, 12, 3, 3, 2, 0], ['market', 20, 7, 2, 2, 1, 0], ['rumshop', 22, 4, 2, 2, 1, 0], ['dock', 5, 9, 2, 1, 1, 0], ['dock', 5, 14, 2, 1, 1, 1],
  ['flowers', 14, 8, 1, 1, 1, 0], ['palm', 7, 5, 1, 1, 1, 0], ['bench', 14, 11, 1, 1, 1, 0], ['lamp', 16, 11, 1, 1, 1, 0], ['fountain', 12, 7, 2, 2, 1, 0], ['bandstand', 22, 8, 2, 2, 1, 0],
  ['cistern', 19, 4, 1, 1, 1, 0], ['composter', 12, 14, 1, 1, 1, 0], ['windbreak', 13, 14, 1, 1, 1, 0], ['depot', 26, 9, 2, 2, 1, 0], ['solar', 9, 19, 2, 1, 1, 0], ['aqua', 11, 19, 3, 2, 1, 0], ['seawall', 6, 18, 1, 1, 1, 0],
];
for (const [t, x, y, w, h, look, v] of blds) put(buildingTex(t, w, h, look, v) as never, x, y, w, h);
for (let k = 0; k < 6; k++) put(workerTex(['#FFC726', '#3FD0C9', '#FF7AC8'][k % 3], 1 + (k % 5), k % 2, [null, 'food', 'stone', 'water'][k % 4]) as never, 9 + k, 10, 1, 1);
items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
