import { Texture } from 'pixi.js';
import type { BType, NodeType } from '@bim/sim';
import { T } from './terrain';

/** Sprite textures are drawn once with Canvas 2D at 3x, then reused by every sprite. */
const RES = 3;
type Draw = (g: CanvasRenderingContext2D) => void;
function make(w: number, h: number, draw: Draw): Texture {
  const c = document.createElement('canvas'); c.width = w * RES; c.height = h * RES;
  const g = c.getContext('2d')!; g.scale(RES, RES); g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  return Texture.from(c);
}
const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const ellipse = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };

export const HOUSE_COL = ['#F4A6B8', '#9EE0C9', '#FFE08A', '#9CC9F5', '#F7B98A', '#C9B6F2'];

function drawNode(g: CanvasRenderingContext2D, type: NodeType) {
  const x = 0, y = 0;
  if (type === 'tree') {
    g.fillStyle = 'rgba(0,0,0,.18)'; ellipse(g, x + 12, y + 20, 8, 3);
    g.fillStyle = '#6B4A2B'; g.fillRect(x + 10.5, y + 12, 3, 8);
    g.fillStyle = '#246B2B'; circle(g, x + 12, y + 10, 8);
    g.fillStyle = '#3E9A3E'; circle(g, x + 10, y + 8, 5);
    g.fillStyle = '#C3DD5E'; [[15, 11], [9, 12], [13, 6]].forEach(([a, b]) => circle(g, x + a, y + b, 1.8));
  } else if (type === 'rock') {
    g.fillStyle = 'rgba(0,0,0,.2)'; ellipse(g, x + 12, y + 19, 9, 3);
    g.fillStyle = '#E7E0CC'; g.beginPath(); g.moveTo(x + 3, y + 18); g.lineTo(x + 6, y + 9); g.lineTo(x + 14, y + 7); g.lineTo(x + 21, y + 13); g.lineTo(x + 20, y + 18); g.closePath(); g.fill();
    g.fillStyle = '#B4A98F'; g.beginPath(); g.moveTo(x + 14, y + 7); g.lineTo(x + 21, y + 13); g.lineTo(x + 20, y + 18); g.lineTo(x + 13, y + 18); g.closePath(); g.fill();
    g.fillStyle = 'rgba(120,110,90,.6)'; g.fillRect(x + 9, y + 12, 1.6, 1.6); g.fillRect(x + 13, y + 14, 1.6, 1.6);
  } else if (type === 'spring') {
    g.fillStyle = '#2E8FC4'; ellipse(g, x + 12, y + 13, 9, 7);
    g.fillStyle = '#7FD3F5'; ellipse(g, x + 12, y + 12, 6, 4.5);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + 12, y + 12, 3.5, 2.5, 0, 0, Math.PI * 2); g.stroke();
  } else {
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + 12, y + 14, 9, 3, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#D8F6FF'; ellipse(g, x + 11, y + 11, 5, 2.2);
    g.beginPath(); g.moveTo(x + 15, y + 11); g.lineTo(x + 19, y + 8); g.lineTo(x + 19, y + 14); g.closePath(); g.fill();
    g.fillStyle = 'rgba(216,246,255,.55)'; g.beginPath(); g.moveTo(x + 10, y + 10); g.lineTo(x + 13, y + 5); g.lineTo(x + 14, y + 10); g.fill();
  }
}

function drawBuilding(g: CanvasRenderingContext2D, type: BType, variant: number, opts: { dry?: boolean } = {}) {
  const x = 0, y = 0, w = type === 'tc' || type === 'hq' ? 2 * T : T, h = w;
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 3, y + h - 5, w - 4, 4);
  switch (type) {
    case 'tc':
      g.fillStyle = '#EFE3C8'; g.fillRect(x + 5, y + 16, w - 10, h - 20); g.fillStyle = '#D7C7A2'; g.fillRect(x + 5, y + h - 8, w - 10, 4);
      g.fillStyle = '#B5452F'; g.beginPath(); g.moveTo(x + 2, y + 18); g.lineTo(x + w / 2, y + 5); g.lineTo(x + w - 2, y + 18); g.closePath(); g.fill();
      g.fillStyle = '#5A3A22'; g.fillRect(x + w / 2 - 4, y + h - 17, 8, 13);
      g.fillStyle = '#2E6FB8'; g.fillRect(x + 10, y + 22, 6, 6); g.fillRect(x + w - 16, y + 22, 6, 6);
      g.fillStyle = '#3A2A1A'; g.fillRect(x + w - 9, y + 1, 1.6, 16);
      g.fillStyle = '#00267F'; g.fillRect(x + w - 7.4, y + 1, 3, 6); g.fillStyle = '#FFC726'; g.fillRect(x + w - 4.4, y + 1, 3, 6); g.fillStyle = '#00267F'; g.fillRect(x + w - 1.4, y + 1, 1.4, 6);
      break;
    case 'hq':
      g.fillStyle = '#2B2F3A'; g.fillRect(x + 6, y + 4, w - 12, h - 8); g.fillStyle = '#3A4050'; g.fillRect(x + 6, y + 4, 6, h - 8);
      g.fillStyle = '#E2553F'; g.fillRect(x + 6, y + 12, w - 12, 4);
      g.fillStyle = '#9AA3B5'; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.fillRect(x + 15 + c * 7, y + 20 + r * 7, 4, 4);
      break;
    case 'house':
      g.fillStyle = HOUSE_COL[variant % HOUSE_COL.length]; g.fillRect(x + 5, y + 11, 14, 10);
      g.fillStyle = '#7A3B2E'; g.beginPath(); g.moveTo(x + 3, y + 12); g.lineTo(x + 12, y + 3); g.lineTo(x + 21, y + 12); g.closePath(); g.fill();
      g.fillStyle = '#FFFFFF'; g.fillRect(x + 5, y + 11, 14, 1.5); g.fillStyle = '#5A3A22'; g.fillRect(x + 10, y + 15, 4, 6);
      g.fillStyle = '#FFF7E0'; g.fillRect(x + 15.5, y + 14, 2.5, 2.5); g.fillRect(x + 6, y + 14, 2.5, 2.5);
      break;
    case 'farm':
      g.fillStyle = '#7A5230'; g.fillRect(x + 1.5, y + 1.5, 21, 21); g.fillStyle = '#5C3C22'; for (let r = 0; r < 4; r++) g.fillRect(x + 3, y + 4 + r * 5, 18, 1.5);
      g.fillStyle = '#6CC24A'; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) circle(g, x + 4.5 + c * 3.8, y + 3.5 + r * 5, 1.6);
      break;
    case 'depot':
      g.fillStyle = '#9C6B3C'; g.fillRect(x + 3, y + 7, 18, 14); g.strokeStyle = '#6E4723'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + 3, y + 11 + k * 4); g.lineTo(x + 21, y + 11 + k * 4); g.stroke(); }
      g.fillStyle = '#C99A5B'; g.fillRect(x + 2, y + 4, 20, 4); g.fillStyle = '#E8C27A'; g.fillRect(x + 14, y + 14, 6, 6); g.strokeStyle = '#8A5A2E'; g.strokeRect(x + 14, y + 14, 6, 6);
      break;
    case 'cistern':
      g.fillStyle = '#9AA3AB'; ellipse(g, x + 12, y + 15, 9, 7); g.fillStyle = '#B8C0C7'; g.fillRect(x + 3, y + 9, 18, 6);
      g.fillStyle = '#C9D0D6'; ellipse(g, x + 12, y + 9, 9, 4); g.fillStyle = opts.dry ? '#6C8090' : '#5BC0EB'; ellipse(g, x + 12, y + 9, 6, 2.5);
      break;
    case 'seawall':
      g.fillStyle = '#7F8A94'; g.fillRect(x + 1, y + 8, 22, 12); g.fillStyle = '#A9B3BC'; for (let k = 0; k < 3; k++) g.fillRect(x + 2 + k * 7.2, y + 6, 6.4, 5);
      g.strokeStyle = '#5F6A74'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 8, y + 11); g.lineTo(x + 8, y + 20); g.moveTo(x + 16, y + 11); g.lineTo(x + 16, y + 20); g.stroke();
      break;
    case 'market':
      g.fillStyle = '#E9D8B0'; g.fillRect(x + 4, y + 10, 16, 11);
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#FFFFFF' : '#D94B3B'; g.fillRect(x + 2 + k * 4, y + 5, 4, 6); }
      g.fillStyle = '#6CC24A'; g.fillRect(x + 6, y + 15, 4, 3); g.fillStyle = '#FFC726'; g.fillRect(x + 11, y + 15, 3, 3); g.fillStyle = '#E2553F'; g.fillRect(x + 15, y + 15, 3, 3);
      break;
    case 'aqua':
      g.fillStyle = 'rgba(200,240,225,.85)'; g.fillRect(x + 2, y + 5, 20, 16); g.strokeStyle = '#5E8F7E'; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 2 + k * 6.6, y + 5); g.lineTo(x + 2 + k * 6.6, y + 21); g.stroke(); }
      g.fillStyle = '#2E8FC4'; g.fillRect(x + 4, y + 15, 16, 5); g.fillStyle = '#FFB03A'; g.fillRect(x + 8, y + 16.5, 3, 1.6);
      g.fillStyle = '#3E9A3E'; for (let k = 0; k < 5; k++) circle(g, x + 5 + k * 3.5, y + 11, 1.8);
      break;
    case 'solar':
      g.fillStyle = '#BCC6D0'; g.fillRect(x + 2, y + 4, 20, 16); g.fillStyle = '#1D3466'; g.fillRect(x + 3, y + 5, 18, 14);
      g.strokeStyle = '#6F8FD8'; g.lineWidth = 0.8; g.beginPath();
      for (let k = 1; k < 4; k++) { g.moveTo(x + 3 + k * 4.5, y + 5); g.lineTo(x + 3 + k * 4.5, y + 19); }
      for (let k = 1; k < 3; k++) { g.moveTo(x + 3, y + 5 + k * 4.7); g.lineTo(x + 21, y + 5 + k * 4.7); }
      g.stroke();
      break;
  }
}

function drawWorker(g: CanvasRenderingContext2D, color: string) {
  // drawn centred at (8, 12) in a 16x20 box
  const x = 8, y = 12;
  g.fillStyle = 'rgba(0,0,0,.25)'; ellipse(g, x, y + 6, 5, 2);
  g.fillStyle = '#1F3E8C'; g.fillRect(x - 3, y + 1, 2.4, 5); g.fillRect(x + 0.6, y + 1, 2.4, 5);
  g.fillStyle = color; g.beginPath(); g.roundRect(x - 4, y - 5, 8, 8, 2.5); g.fill();
  g.fillStyle = '#7A4B2A'; circle(g, x, y - 8, 3.2);
}

const cache = new Map<string, Texture>();
const once = (key: string, f: () => Texture) => { let t = cache.get(key); if (!t) { t = f(); cache.set(key, t); } return t; };

export const nodeTex = (t: NodeType) => once('n:' + t, () => make(T, T, (g) => drawNode(g, t)));
export function buildingTex(t: BType, variant: number, opts: { dry?: boolean; foundation?: boolean } = {}) {
  const size = t === 'tc' || t === 'hq' ? 2 * T : T;
  const key = `b:${t}:${t === 'house' ? variant % 6 : 0}:${opts.dry ? 1 : 0}:${opts.foundation ? 1 : 0}`;
  return once(key, () => make(size, size, (g) => {
    if (opts.foundation) {
      g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(2, 2, size - 4, size - 4);
      g.globalAlpha = 0.45; drawBuilding(g, t, variant, opts); g.globalAlpha = 1;
      g.setLineDash([4, 3]); g.strokeStyle = '#FFC726'; g.lineWidth = 1.5; g.strokeRect(2.5, 2.5, size - 5, size - 5); g.setLineDash([]);
    } else drawBuilding(g, t, variant, opts);
  }));
}
export const workerTex = (color: string) => once('w:' + color, () => make(16, 20, (g) => drawWorker(g, color)));
