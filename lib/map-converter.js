import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import DxfParser from 'dxf-parser';

const ACAD = process.env.ACCORECONSOLE_PATH || 'C:\\Program Files\\Autodesk\\AutoCAD 2024\\accoreconsole.exe';

export const hashFile = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export const likeToRegex = (p) => new RegExp('^' + String(p).split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');

// اگر DXF هم‌نامِ DWG تازه‌تر وجود دارد همان را مصرف کن، وگرنه با AutoCAD بساز
export function ensureDxf(dwgPath) {
  const dxfPath = dwgPath.replace(/\.dwg$/i, '.dxf');
  if (fs.existsSync(dxfPath) && fs.statSync(dxfPath).mtimeMs >= fs.statSync(dwgPath).mtimeMs) return dxfPath;
  const scr = path.join(path.dirname(dxfPath), '_export.scr');
  fs.writeFileSync(scr, 'FILEDIA\n0\nDXFOUT\n"' + dxfPath + '"\n\n16\n');
  const r = spawnSync(ACAD, ['/i', dwgPath, '/s', scr, '/l', 'en-US'], { timeout: 180000 });
  if (!fs.existsSync(dxfPath)) throw new Error('AutoCAD DXF export failed: ' + (r.stderr || r.stdout || '').toString().slice(0, 400));
  return dxfPath;
}

function arcPath(e, X, Y, s) {
  const a0 = (e.startAngle * Math.PI) / 180, a1 = (e.endAngle * Math.PI) / 180;
  const x0 = e.center.x + e.radius * Math.cos(a0), y0 = e.center.y + e.radius * Math.sin(a0);
  const x1 = e.center.x + e.radius * Math.cos(a1), y1 = e.center.y + e.radius * Math.sin(a1);
  let d = a1 - a0; while (d < 0) d += 2 * Math.PI;
  const laf = d > Math.PI ? 1 : 0;
  return `<path fill="none" d="M ${X(x0).toFixed(1)} ${Y(y0).toFixed(1)} A ${(e.radius * s).toFixed(1)} ${(e.radius * s).toFixed(1)} 0 ${laf} 0 ${X(x1).toFixed(1)} ${Y(y1).toFixed(1)}"/>`;
}
const cleanMtext = (t) => String(t || '').replace(/[{}]/g, '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').trim();

export function dxfToSvg(dxfPath) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(fs.readFileSync(dxfPath, 'utf8'));
  const ents = dxf.entities || [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const addP = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  for (const e of ents) {
    if (e.type === 'LINE') { addP(e.vertices[0].x, e.vertices[0].y); addP(e.vertices[1].x, e.vertices[1].y); }
    else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') (e.vertices || []).forEach((v) => addP(v.x, v.y));
    else if (e.type === 'CIRCLE' || e.type === 'ARC') { addP(e.center.x - e.radius, e.center.y - e.radius); addP(e.center.x + e.radius, e.center.y + e.radius); }
    else if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.startPoint) addP(e.startPoint.x, e.startPoint.y);
  }
  const W = 1400, H = 900;
  const s = Math.min(W / Math.max(1, maxX - minX), H / Math.max(1, maxY - minY));
  const X = (x) => (x - minX) * s, Y = (y) => (maxY - y) * s;
  const layers = [...new Set(ents.map((e) => e.layer || '0'))];
  const groups = {}; layers.forEach((l) => (groups[l] = []));
  const texts = [];
  for (const e of ents) {
    const L = e.layer || '0';
    if (e.type === 'LINE') groups[L].push(`<line x1="${X(e.vertices[0].x).toFixed(1)}" y1="${Y(e.vertices[0].y).toFixed(1)}" x2="${X(e.vertices[1].x).toFixed(1)}" y2="${Y(e.vertices[1].y).toFixed(1)}"/>`);
    else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') groups[L].push(`<polyline fill="none" points="${(e.vertices || []).map((v) => X(v.x).toFixed(1) + ',' + Y(v.y).toFixed(1)).join(' ')}"/>`);
    else if (e.type === 'CIRCLE') groups[L].push(`<circle fill="none" cx="${X(e.center.x).toFixed(1)}" cy="${Y(e.center.y).toFixed(1)}" r="${(e.radius * s).toFixed(1)}"/>`);
    else if (e.type === 'ARC') groups[L].push(arcPath(e, X, Y, s));
    else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const txt = e.type === 'TEXT' ? String(e.text || '').trim() : cleanMtext(e.text);
      if (txt && e.startPoint) {
        texts.push({ layer: L, text: txt, x: X(e.startPoint.x), y: Y(e.startPoint.y) });
        groups[L].push(`<text data-tag="${esc(txt)}" x="${X(e.startPoint.x).toFixed(1)}" y="${Y(e.startPoint.y).toFixed(1)}" font-size="11">${esc(txt)}</text>`);
      }
    }
  }
  const body = layers.map((l) => `<g data-layer="${esc(l)}" stroke="#333" fill="none" stroke-width="1">${groups[l].join('')}</g>`).join('\n');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n${body}\n</svg>`, texts, layers };
}