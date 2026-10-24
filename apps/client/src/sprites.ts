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

// ---------- the five age looks (1 Foraging, 2 Rain-fed Farming, 3 Recovery, 4 Sustainable Tech, 5 Co-op)
function flag(g: CanvasRenderingContext2D, w: number) {
  g.fillStyle = '#3A2A1A'; g.fillRect(w - 9, 1, 1.6, 16);
  g.fillStyle = '#00267F'; g.fillRect(w - 7.4, 1, 3, 6); g.fillStyle = '#FFC726'; g.fillRect(w - 4.4, 1, 3, 6); g.fillStyle = '#00267F'; g.fillRect(w - 1.4, 1, 1.4, 6);
}
function solarRoof(g: CanvasRenderingContext2D, x: number, y: number, n: number) {
  for (let k = 0; k < n; k++) { g.fillStyle = '#1D3466'; g.fillRect(x + k * 5, y, 4.4, 3.4); g.fillStyle = 'rgba(111,143,216,.8)'; g.fillRect(x + k * 5, y, 4.4, 0.8); }
}
function drawTC(g: CanvasRenderingContext2D, w: number, h: number, age: number) {
  if (age <= 1) {
    // timber hall with a thatch roof and a fire pit
    g.fillStyle = '#8A5A33'; g.fillRect(7, 20, w - 14, h - 24);
    g.strokeStyle = '#6E4723'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(7, 24 + k * 5); g.lineTo(w - 7, 24 + k * 5); g.stroke(); }
    g.fillStyle = '#D9B66A'; g.beginPath(); g.moveTo(2, 22); g.lineTo(w / 2, 6); g.lineTo(w - 2, 22); g.closePath(); g.fill();
    g.strokeStyle = '#B8934A'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(8 + k * 6, 20); g.lineTo(w / 2 - 2 + k, 9); g.stroke(); }
    g.fillStyle = '#3A2A1A'; g.fillRect(w / 2 - 4, h - 15, 8, 11);
    g.fillStyle = '#E2553F'; circle(g, 7, h - 6, 2.2); g.fillStyle = '#FFC726'; circle(g, 7, h - 6.5, 1.1);
    flag(g, w); return;
  }
  const walls = age === 2 ? '#C8A27A' : '#EFE3C8', roof = age >= 5 ? '#2E8C8C' : '#B5452F';
  g.fillStyle = walls; g.fillRect(5, 16, w - 10, h - 20);
  if (age === 2) { g.strokeStyle = '#A88158'; g.lineWidth = 0.8; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(5, 19 + k * 5); g.lineTo(w - 5, 19 + k * 5); g.stroke(); } }
  else { g.fillStyle = '#D7C7A2'; g.fillRect(5, h - 8, w - 10, 4); }
  g.fillStyle = roof; g.beginPath(); g.moveTo(2, 18); g.lineTo(w / 2, 5); g.lineTo(w - 2, 18); g.closePath(); g.fill();
  if (age === 2) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.7; for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(5 + k * 4.5, 17); g.lineTo(w / 2, 6); g.stroke(); } }
  g.fillStyle = '#5A3A22'; g.fillRect(w / 2 - 4, h - 17, 8, 13);
  g.fillStyle = '#2E6FB8'; g.fillRect(10, 22, 6, 6); g.fillRect(w - 16, 22, 6, 6);
  if (age >= 4) { solarRoof(g, 9, 11, 2); solarRoof(g, w - 19, 11, 2); g.fillStyle = '#5BC0EB'; g.fillRect(w - 6, 26, 4, 14); g.fillStyle = '#3E8FB8'; g.fillRect(w - 6, 26, 4, 2); }
  if (age >= 5) {
    // Co-op Hall: market canopy and sign
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#FFFFFF' : '#2E8C8C'; g.fillRect(4 + k * 3.4, h - 15, 3.4, 4); }
    g.fillStyle = '#FFC726'; g.fillRect(w / 2 - 9, 19, 18, 3.5);
    g.fillStyle = '#6CC24A'; g.fillRect(5, h - 9, 3, 2); g.fillStyle = '#E2553F'; g.fillRect(10, h - 9, 3, 2); g.fillStyle = '#FFC726'; g.fillRect(15, h - 9, 3, 2);
  }
  flag(g, w);
}
function drawHouse(g: CanvasRenderingContext2D, variant: number, age: number) {
  if (age <= 1) {
    // thatch hut
    g.fillStyle = '#9C6B3C'; g.fillRect(6, 12, 12, 9);
    g.fillStyle = '#D9B66A'; g.beginPath(); g.moveTo(3, 14); g.lineTo(12, 3); g.lineTo(21, 14); g.closePath(); g.fill();
    g.strokeStyle = '#B8934A'; g.lineWidth = 0.8; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(6 + k * 4, 13); g.lineTo(11 + k * 0.6, 5); g.stroke(); }
    g.fillStyle = '#3A2A1A'; g.fillRect(10, 16, 4, 5); return;
  }
  const pastel = HOUSE_COL[variant % HOUSE_COL.length];
  if (age >= 5) {
    // two-storey chattel house with a veranda
    g.fillStyle = pastel; g.fillRect(5, 6, 14, 15);
    g.fillStyle = '#7A3B2E'; g.beginPath(); g.moveTo(3, 7); g.lineTo(12, 0.5); g.lineTo(21, 7); g.closePath(); g.fill();
    g.fillStyle = '#FFF7E0'; g.fillRect(7, 9, 2.5, 2.5); g.fillRect(14.5, 9, 2.5, 2.5);
    g.fillStyle = '#FFFFFF'; g.fillRect(3, 14, 18, 1.4); for (let k = 0; k < 5; k++) g.fillRect(3.5 + k * 4.2, 14, 0.9, 7);
    g.fillStyle = '#5A3A22'; g.fillRect(10, 16, 4, 5);
    return;
  }
  const walls = age === 2 ? '#B98D5E' : pastel, roof = age === 2 ? '#9AA3AB' : '#7A3B2E';
  g.fillStyle = walls; g.fillRect(5, 11, 14, 10);
  if (age === 2) { g.strokeStyle = '#9C7347'; g.lineWidth = 0.7; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(5, 13.5 + k * 2.8); g.lineTo(19, 13.5 + k * 2.8); g.stroke(); } }
  g.fillStyle = roof; g.beginPath(); g.moveTo(3, 12); g.lineTo(12, 3); g.lineTo(21, 12); g.closePath(); g.fill();
  if (age === 2) { g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 0.6; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(5 + k * 3.5, 11.5); g.lineTo(12, 4); g.stroke(); } }
  else { g.fillStyle = '#FFFFFF'; g.fillRect(5, 11, 14, 1.5); }
  g.fillStyle = '#5A3A22'; g.fillRect(10, 15, 4, 6);
  g.fillStyle = '#FFF7E0'; g.fillRect(15.5, 14, 2.5, 2.5); g.fillRect(6, 14, 2.5, 2.5);
  if (age >= 4) { solarRoof(g, 13, 6.5, 1); g.fillStyle = '#3E8FB8'; g.fillRect(19.5, 15, 3, 6); g.fillStyle = '#5BC0EB'; g.fillRect(19.5, 15, 3, 1.2); }
}
function drawFarm(g: CanvasRenderingContext2D, age: number) {
  const soil = age === 3 ? '#9C7A45' : '#7A5230';
  g.fillStyle = soil; g.fillRect(1.5, 1.5, 21, 21);
  g.fillStyle = age === 3 ? '#C9A85E' : '#5C3C22'; for (let r = 0; r < 4; r++) g.fillRect(3, 4 + r * 5, 18, 1.5);
  if (age >= 4) { g.strokeStyle = '#3E8FB8'; g.lineWidth = 0.7; for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(2.5, 5.5 + r * 5); g.lineTo(21.5, 5.5 + r * 5); g.stroke(); } }
  const pr = age >= 5 ? 2.1 : 1.6;
  g.fillStyle = age >= 5 ? '#4FB43A' : '#6CC24A'; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) circle(g, 4.5 + c * 3.8, 3.5 + r * 5, pr);
  if (age >= 5) { g.fillStyle = '#E2553F'; for (let c = 0; c < 5; c += 2) circle(g, 5 + c * 3.8, 9, 0.9); }
  if (age === 3) { g.fillStyle = '#5C3C22'; g.beginPath(); g.moveTo(16, 22); g.lineTo(19.5, 16); g.lineTo(23, 22); g.closePath(); g.fill(); }
  if (age >= 4) { g.fillStyle = 'rgba(30,40,40,.28)'; g.fillRect(1.5, 1.5, 21, 7); }
  if (age >= 5) { g.strokeStyle = '#E9D8B0'; g.lineWidth = 1; g.strokeRect(1, 1, 22, 22); }
}
function drawDepot(g: CanvasRenderingContext2D, age: number) {
  if (age <= 1) {
    // lean-to with thatch and baskets
    g.fillStyle = '#8A5A33'; g.fillRect(4, 10, 2, 11); g.fillRect(18, 10, 2, 11);
    g.fillStyle = '#D9B66A'; g.beginPath(); g.moveTo(2, 12); g.lineTo(22, 7); g.lineTo(22, 10); g.lineTo(2, 15); g.closePath(); g.fill();
    g.fillStyle = '#C99A5B'; ellipse(g, 9, 19, 3, 2.2); ellipse(g, 15, 19, 3, 2.2); return;
  }
  g.fillStyle = '#9C6B3C'; g.fillRect(3, 7, 18, 14); g.strokeStyle = '#6E4723'; g.lineWidth = 1;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(3, 11 + k * 4); g.lineTo(21, 11 + k * 4); g.stroke(); }
  g.fillStyle = age >= 3 ? '#9AA3AB' : '#C99A5B'; g.fillRect(2, 4, 20, 4);
  g.fillStyle = '#E8C27A'; g.fillRect(14, 14, 6, 6); g.strokeStyle = '#8A5A2E'; g.strokeRect(14, 14, 6, 6);
  if (age >= 4) solarRoof(g, 4, 4.3, 2);
  if (age >= 5) { g.fillStyle = '#3FA7D6'; g.fillRect(1, 16, 9, 5); g.fillStyle = '#F4F1E8'; g.fillRect(6, 14, 4, 3); g.fillStyle = '#222'; circle(g, 3, 21, 1.3); circle(g, 8, 21, 1.3); }
}

function drawBuilding(g: CanvasRenderingContext2D, type: BType, variant: number, opts: { dry?: boolean; age?: number } = {}) {
  const age = opts.age ?? 3;
  const x = 0, y = 0, w = type === 'tc' || type === 'hq' || type === 'port' || type === 'airport' ? 2 * T : T, h = w;
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 3, y + h - 5, w - 4, 4);
  switch (type) {
    case 'tc': drawTC(g, w, h, age); break;
    case 'hq':
      g.fillStyle = '#2B2F3A'; g.fillRect(x + 6, y + 4, w - 12, h - 8); g.fillStyle = '#3A4050'; g.fillRect(x + 6, y + 4, 6, h - 8);
      g.fillStyle = '#E2553F'; g.fillRect(x + 6, y + 12, w - 12, 4);
      g.fillStyle = '#9AA3B5'; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.fillRect(x + 15 + c * 7, y + 20 + r * 7, 4, 4);
      break;
    case 'house': drawHouse(g, variant, age); break;
    case 'farm': drawFarm(g, age); break;
    case 'depot': drawDepot(g, age); break;
    case 'composter':
      for (let k = 0; k < 3; k++) {
        g.fillStyle = '#8A5A33'; g.fillRect(2 + k * 7, 9, 6, 12); g.fillStyle = ['#5C3C22', '#6E4A2A', '#7D5A34'][k]; g.fillRect(3 + k * 7, 10, 4, 6);
        g.strokeStyle = '#6E4723'; g.lineWidth = 0.8; g.strokeRect(2 + k * 7, 9, 6, 12);
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
      for (const sx of [5, 12, 19]) { g.beginPath(); g.moveTo(sx, 8); g.quadraticCurveTo(sx + 2, 5, sx, 2); g.stroke(); }
      break;
    case 'windbreak':
      g.fillStyle = '#4E7A2E'; g.fillRect(2, 18, 20, 3);
      for (const [cx, hh, col] of [[5, 15, '#2F6B2A'], [12, 18, '#3E8A35'], [19, 14, '#2F6B2A']] as [number, number, string][]) {
        g.fillStyle = '#8FB34A'; g.fillRect(cx - 0.8, 20 - hh, 1.6, hh);
        g.fillStyle = col; ellipse(g, cx, 20 - hh + 4, 3.6, 5.5);
        g.fillStyle = 'rgba(255,255,255,.15)'; ellipse(g, cx - 1, 20 - hh + 3, 1.2, 2.5);
      }
      break;
    case 'hub':
      g.fillStyle = '#EFE3C8'; g.fillRect(2, 8, 20, 13); g.fillStyle = '#2E8C8C'; g.fillRect(1, 5, 22, 4);
      g.fillStyle = '#5A3A22'; g.fillRect(8, 13, 8, 8); g.fillStyle = '#FFC726'; g.fillRect(5, 9.5, 14, 2.5);
      g.fillStyle = '#3FA7D6'; g.fillRect(16, 16, 7, 4); g.fillStyle = '#F4F1E8'; g.fillRect(19.5, 14.5, 3.5, 2.5); g.fillStyle = '#222'; circle(g, 18, 20.5, 1.2); circle(g, 22, 20.5, 1.2);
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
    case 'port':
      // quay, containers, two cranes and a ship alongside
      g.fillStyle = '#8E99A3'; g.fillRect(x + 2, y + 18, w - 4, h - 22);
      g.fillStyle = '#B8C0C7'; g.fillRect(x + 2, y + 18, w - 4, 3);
      [['#E2553F', 6, 26], ['#3FA7D6', 14, 26], ['#FFC726', 6, 32], ['#6CC24A', 14, 32], ['#F4A6B8', 22, 32], ['#3FA7D6', 22, 26]].forEach(([c, cx, cy]) => { g.fillStyle = c as string; g.fillRect(x + (cx as number), y + (cy as number), 7, 5); });
      g.strokeStyle = '#F28C28'; g.lineWidth = 2;
      for (const cx of [32, 40]) { g.beginPath(); g.moveTo(x + cx, y + 36); g.lineTo(x + cx, y + 8); g.lineTo(x + cx - 10, y + 8); g.stroke(); g.beginPath(); g.moveTo(x + cx - 8, y + 8); g.lineTo(x + cx - 8, y + 15); g.stroke(); }
      g.fillStyle = '#2B3A55'; g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + 26, y + 4); g.lineTo(x + 23, y + 13); g.lineTo(x + 7, y + 13); g.closePath(); g.fill();
      g.fillStyle = '#F4F1E8'; g.fillRect(x + 17, y + 0.5, 6, 4); g.fillStyle = '#E2553F'; g.fillRect(x + 8, y + 6, 12, 2);
      break;
    case 'airport':
      // terminal, control tower and a plane on the apron
      g.fillStyle = '#5E636B'; g.fillRect(x + 2, y + 30, w - 4, h - 33);
      g.fillStyle = '#F4F1E8'; g.fillRect(x + 4, y + 16, 30, 13); g.fillStyle = '#2E6FB8'; g.fillRect(x + 4, y + 16, 30, 4);
      g.fillStyle = '#7FB7D9'; for (let k = 0; k < 5; k++) g.fillRect(x + 7 + k * 5.5, y + 22, 3, 4);
      g.fillStyle = '#D7DCE0'; g.fillRect(x + 37, y + 8, 5, 21); g.fillStyle = '#2E6FB8'; g.fillRect(x + 35, y + 4, 9, 5);
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(x + 10, y + 39); g.lineTo(x + 34, y + 39); g.lineTo(x + 37, y + 41); g.lineTo(x + 34, y + 43); g.lineTo(x + 10, y + 43); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x + 20, y + 41); g.lineTo(x + 26, y + 33); g.lineTo(x + 28, y + 33); g.lineTo(x + 25, y + 41); g.closePath(); g.fill();
      g.fillStyle = '#00267F'; g.fillRect(x + 10, y + 36.5, 3, 3); g.fillStyle = '#FFC726'; g.fillRect(x + 14, y + 40, 16, 1.2);
      break;
  }
}

function drawWorker(g: CanvasRenderingContext2D, color: string, age: number) {
  // drawn centred at (8, 12) in a 16x20 box
  const x = 8, y = 12;
  g.fillStyle = 'rgba(0,0,0,.25)'; ellipse(g, x, y + 6, 5, 2);
  g.fillStyle = '#1F3E8C'; g.fillRect(x - 3, y + 1, 2.4, 5); g.fillRect(x + 0.6, y + 1, 2.4, 5);
  g.fillStyle = color; g.beginPath(); g.roundRect(x - 4, y - 5, 8, 8, 2.5); g.fill();
  g.fillStyle = '#7A4B2A'; circle(g, x, y - 8, 3.2);
  if (age <= 1) { g.fillStyle = '#D9B66A'; ellipse(g, x, y - 9.5, 5, 1.6); circle(g, x, y - 10.5, 2.2); }
  else if (age === 3) { g.fillStyle = '#5C8A3A'; g.fillRect(x - 3.2, y - 11.6, 6.4, 2.2); g.fillRect(x, y - 10, 4.5, 1.2); }
  else if (age === 4) { g.fillStyle = '#F4F1E8'; ellipse(g, x, y - 10, 3.6, 2.2); }
  else if (age >= 5) { g.fillStyle = '#FFFFFF'; g.fillRect(x - 4, y - 2, 8, 1.6); g.fillStyle = '#2E8C8C'; ellipse(g, x, y - 10, 3.6, 2); }
}

const cache = new Map<string, Texture>();
const once = (key: string, f: () => Texture) => { let t = cache.get(key); if (!t) { t = f(); cache.set(key, t); } return t; };

export const nodeTex = (t: NodeType) => once('n:' + t, () => make(T, T, (g) => drawNode(g, t)));
const AGED = new Set<BType>(['tc', 'house', 'farm', 'depot']);
export function buildingTex(t: BType, variant: number, opts: { dry?: boolean; foundation?: boolean; age?: number } = {}) {
  const size = t === 'tc' || t === 'hq' || t === 'port' || t === 'airport' ? 2 * T : T;
  const key = `b:${t}:${t === 'house' ? variant % 6 : 0}:${opts.dry ? 1 : 0}:${opts.foundation ? 1 : 0}:${AGED.has(t) ? opts.age ?? 3 : 0}`;
  return once(key, () => make(size, size, (g) => {
    if (opts.foundation) {
      g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(2, 2, size - 4, size - 4);
      g.globalAlpha = 0.45; drawBuilding(g, t, variant, opts); g.globalAlpha = 1;
      g.setLineDash([4, 3]); g.strokeStyle = '#FFC726'; g.lineWidth = 1.5; g.strokeRect(2.5, 2.5, size - 5, size - 5); g.setLineDash([]);
    } else drawBuilding(g, t, variant, opts);
  }));
}
export const workerTex = (color: string, age = 3) => once(`w:${color}:${age}`, () => make(16, 20, (g) => drawWorker(g, color, age)));
