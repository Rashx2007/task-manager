// lib/map-converter.js
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import DxfParser from "dxf-parser";
import { normalizeDigits } from "./assetRules";

export const hashFile = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

// ✅ Esc کامل برای جلوگیری از SVG injection
export const esc = (t) =>
  String(t == null ? "" : t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const likeToRegex = (p) =>
  new RegExp(
    "^" +
      String(p)
        .split("%")
        .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
    "i",
  );

// ✅ رمزگشایی ایمن DXF: اول UTF-8 معتبر؛ وگرنه کدپیج خود فایل (فارسی = windows-1256)
function decodeDxf(buf) {
  // ۱) UTF-8 سخت‌گیر: اگر کل فایل معتبر است، همان درست است
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {}
  // ۲) UTF-8 غیرسخت‌گیر: اگر نویسه‌های نامعتبر بسیار کم باشند (چند بایت سرگردان)،
  //    همچنان UTF-8 صحیح است و نباید کل فایل را با کدپیج فارسی خراب کرد
  const loose = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const bad = (loose.match(/\uFFFD/g) || []).length;
  if (bad <= Math.max(20, loose.length * 0.0005)) return loose;
  // ۳) در غیر این صورت فایل با کدپیج فارسی (ANSI 1256) نوشته شده است
  const head = buf.slice(0, 8000).toString("latin1");
  const m = head.match(/\$DWGCODEPAGE[\s\S]{0,60}?ANSI_(\d+)/);
  const cp = m ? "windows-" + m[1] : "windows-1256";
  try {
    return new TextDecoder(cp).decode(buf);
  } catch {
    return loose;
  }
}

function findAcad() {
  if (process.env.ACCORECONSOLE_PATH && fs.existsSync(process.env.ACCORECONSOLE_PATH))
    return process.env.ACCORECONSOLE_PATH;
  const roots = ["C:\\Program Files\\Autodesk", "C:\\Program Files (x86)\\Autodesk"];
  for (const root of roots) {
    try {
      const dirs = fs
        .readdirSync(root)
        .filter((d) => /AutoCAD\s?20\d\d/i.test(d))
        .sort()
        .reverse();
      for (const d of dirs) {
        const p = path.join(root, d, "accoreconsole.exe");
        if (fs.existsSync(p)) return p;
      }
    } catch {}
  }
  return null;
}

export function ensureDxf(dwgPath) {
  const dxfNext = dwgPath.replace(/\.dwg$/i, ".dxf");
  try {
    if (
      fs.existsSync(dxfNext) &&
      fs.statSync(dxfNext).mtimeMs >= fs.statSync(dwgPath).mtimeMs
    )
      return dxfNext;
  } catch {}

  const acad = findAcad();
  if (!acad)
    throw new Error(
      "accoreconsole.exe پیدا نشد؛ مسیر آن را در متغیر محیطی ACCORECONSOLE_PATH تنظیم کنید.",
    );

  const stamp = Date.now();
  const asciiDxf = path.join(os.tmpdir(), `dwg_export_${stamp}.dxf`);
  const scr = path.join(os.tmpdir(), `dwg_export_${stamp}.scr`);
  fs.writeFileSync(scr, 'FILEDIA\n0\nDXFOUT\n"' + asciiDxf + '"\n\n16\n');
  const r = spawnSync(acad, ["/i", dwgPath, "/s", scr, "/l", "en-US"], {
    timeout: 300000,
  });

  if (!fs.existsSync(asciiDxf)) {
    const log = ((r.stdout || "").toString() + "\n" + (r.stderr || "").toString()).slice(-800);
    throw new Error(`AutoCAD DXF export failed. ACAD=${acad} | DWG=${dwgPath} | ${log}`);
  }
  try {
    fs.copyFileSync(asciiDxf, dxfNext);
    return dxfNext;
  } catch {
    return asciiDxf;
  }
}

const cleanMtext = (t) =>
  String(t || "")
    .replace(/[{}]/g, "")
    .replace(/\\P/g, " ")
    .replace(/[A-Za-z\\][^;]*;/g, "")
    .trim();

/**
 * ✅ نسخهٔ پایدار: همهٔ مختصات SVG و متادیتا در یک سیستم واحد (X, Y).
 * ✅ ATTRIBها (اعداد داخل دایره/بلوک) هم رندر و هم ثبت می‌شوند.
 */
export function dxfToSvg(dxfPath, basePatterns = []) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(decodeDxf(fs.readFileSync(dxfPath)));
  const ents = dxf.entities || [];
  const blocks = dxf.blocks || {};
  const isBase = (l) => basePatterns.some((p) => likeToRegex(p).test(l || ""));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const addP = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  const addB = (x, y) => {
    if (x < bMinX) bMinX = x;
    if (x > bMaxX) bMaxX = x;
    if (y < bMinY) bMinY = y;
    if (y > bMaxY) bMaxY = y;
  };

  const geoPoints = (e, cb) => {
    if (e.type === "LINE") {
      cb(e.vertices[0].x, e.vertices[0].y);
      cb(e.vertices[1].x, e.vertices[1].y);
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE")
      (e.vertices || []).forEach((v) => cb(v.x, v.y));
    else if (e.type === "CIRCLE" || e.type === "ARC") {
      cb(e.center.x - e.radius, e.center.y - e.radius);
      cb(e.center.x + e.radius, e.center.y + e.radius);
    } else if ((e.type === "TEXT" || e.type === "MTEXT" || e.type === "ATTRIB") && e.startPoint)
      cb(e.startPoint.x, e.startPoint.y);
    else if (e.type === "INSERT" && e.insertionPoint)
      cb(e.insertionPoint.x, e.insertionPoint.y);
    else if (e.type === "SPLINE")
      (e.fitPoints || e.controlPoints || []).forEach((v) => cb(v.x, v.y));
    else if (e.type === "ELLIPSE" && e.center) cb(e.center.x, e.center.y);
    else if (e.type === "SOLID" && e.vertices) e.vertices.forEach((v) => cb(v.x, v.y));
  };

  for (const e of ents) {
    geoPoints(e, addP);
    if (isBase(e.layer)) geoPoints(e, addB);
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const W = 1400, H = 900;
  const s = Math.min(W / Math.max(1, maxX - minX), H / Math.max(1, maxY - minY));
  const TX = -minX * s;
  const TY = maxY * s;
  const wx = (x) => x * s;
  const wy = (y) => -y * s;
  const X = (x) => wx(x) + TX;
  const Y = (y) => wy(y) + TY;

  const texts = [];
  let gidSeq = 0;

  const pushText = (layer, raw, x, y, groupId, type) => {
    const t = normalizeDigits(String(raw ?? "")).trim();
    if (!t) return;
    texts.push({ layer, text: t, x, y, groupId, type });
  };

  const render = (e, inherit) => {
    try {
      const L = e.layer && e.layer !== "0" ? e.layer : inherit;
      switch (e.type) {
        case "LINE":
          return `<line x1="${X(e.vertices[0].x).toFixed(1)}" y1="${Y(e.vertices[0].y).toFixed(1)}" x2="${X(e.vertices[1].x).toFixed(1)}" y2="${Y(e.vertices[1].y).toFixed(1)}"/>`;
        case "LWPOLYLINE":
        case "POLYLINE":
          return `<polyline fill="none" points="${(e.vertices || [])
            .map((v) => X(v.x).toFixed(1) + "," + Y(v.y).toFixed(1))
            .join(" ")}"/>`;
        case "CIRCLE":
          return `<circle fill="none" cx="${X(e.center.x).toFixed(1)}" cy="${Y(e.center.y).toFixed(1)}" r="${(e.radius * s).toFixed(1)}"/>`;
        case "ARC": {
          const a0 = (e.startAngle * Math.PI) / 180, a1 = (e.endAngle * Math.PI) / 180;
          const x0 = e.center.x + e.radius * Math.cos(a0), y0 = e.center.y + e.radius * Math.sin(a0);
          const x1 = e.center.x + e.radius * Math.cos(a1), y1 = e.center.y + e.radius * Math.sin(a1);
          let d = a1 - a0;
          while (d < 0) d += 2 * Math.PI;
          const laf = d > Math.PI ? 1 : 0;
          return `<path fill="none" d="M ${X(x0).toFixed(1)} ${Y(y0).toFixed(1)} A ${(e.radius * s).toFixed(1)} ${(e.radius * s).toFixed(1)} 0 ${laf} 0 ${X(x1).toFixed(1)} ${Y(y1).toFixed(1)}"/>`;
        }
        case "ELLIPSE": {
          const len = Math.hypot(e.majorAxis.x, e.majorAxis.y);
          const ang = (Math.atan2(e.majorAxis.y, e.majorAxis.x) * 180) / Math.PI;
          return `<ellipse fill="none" cx="${X(e.center.x).toFixed(1)}" cy="${Y(e.center.y).toFixed(1)}" rx="${(len * s).toFixed(1)}" ry="${(len * (e.axisRatio || 1) * s).toFixed(1)}" transform="rotate(${ang.toFixed(1)} ${X(e.center.x).toFixed(1)} ${Y(e.center.y).toFixed(1)})"/>`;
        }
        case "SPLINE": {
          const pts = e.fitPoints && e.fitPoints.length ? e.fitPoints : e.controlPoints || [];
          if (!pts.length) return "";
          return `<polyline fill="none" points="${pts.map((v) => X(v.x).toFixed(1) + "," + Y(v.y).toFixed(1)).join(" ")}"/>`;
        }
        case "SOLID":
          return `<polygon points="${(e.vertices || []).map((v) => X(v.x).toFixed(1) + "," + Y(v.y).toFixed(1)).join(" ")}"/>`;
        case "HATCH": {
          const out = [];
          for (const loop of e.edges || []) {
            for (const ed of loop.edges || loop || []) {
              if (ed && ed.type === "line" && ed.start && ed.end)
                out.push(
                  `<line x1="${X(ed.start.x).toFixed(1)}" y1="${Y(ed.start.y).toFixed(1)}" x2="${X(ed.end.x).toFixed(1)}" y2="${Y(ed.end.y).toFixed(1)}"/>`,
                );
            }
          }
          return out.join("");
        }
        // ✅ ATTRIB مستقل (اعداد داخل دایره/بلوک): رندر + ثبت در texts
        case "ATTRIB": {
          if (!e.startPoint) return "";
          pushText(e.layer || "0", e.text ?? e.value, X(e.startPoint.x), Y(e.startPoint.y), null, "ATTRIB");
          return `<text data-tag="${esc(normalizeDigits(String(e.text ?? e.value ?? "")).trim())}" x="${X(e.startPoint.x).toFixed(1)}" y="${Y(e.startPoint.y).toFixed(1)}" font-size="10">${esc(normalizeDigits(String(e.text ?? e.value ?? "")).trim())}</text>`;
        }
        case "INSERT": {
          const b = blocks[e.name];
          const gid = ++gidSeq;
          const rotRad = Number(e.rotation) || 0;
          const sx = Number(e.xScale ?? 1) || 1, sy = Number(e.yScale ?? 1) || 1;
          const cos = Math.cos(rotRad), sin = Math.sin(rotRad);
          const toWorld = (px, py) => {
            const lx = px * sx, ly = py * sy;
            return {
              x: e.insertionPoint.x + (lx * cos - ly * sin),
              y: e.insertionPoint.y + (lx * sin + ly * cos),
            };
          };
          // ✅ ATTRIBهای چسبیده به خود INSERT
          if (Array.isArray(e.attribs)) {
            for (const a of e.attribs) {
              if (!a.startPoint) continue;
              const w = toWorld(a.startPoint.x, a.startPoint.y);
              pushText(a.layer && a.layer !== "0" ? a.layer : L, a.text ?? a.value, X(w.x), Y(w.y), gid, "ATTRIB");
            }
          }
          if (b && b.entities) {
            for (const c of b.entities) {
              if ((c.type === "TEXT" || c.type === "MTEXT" || c.type === "ATTRIB") && c.startPoint) {
                const raw = c.type === "MTEXT" ? cleanMtext(c.text) : (c.text ?? c.value);
                const w = toWorld(c.startPoint.x, c.startPoint.y);
                pushText(c.layer && c.layer !== "0" ? c.layer : L, raw, X(w.x), Y(w.y), gid, c.type);
              }
            }
          }
          const rotDeg = (-rotRad * 180) / Math.PI;
          const inner = b && b.entities ? b.entities.map((c) => render(c, L)).join("") : "";
          return `<g transform="translate(${X(e.insertionPoint.x).toFixed(1)} ${Y(e.insertionPoint.y).toFixed(1)}) rotate(${rotDeg.toFixed(2)}) scale(${sx} ${sy})">${inner}</g>`;
        }
        case "TEXT":
        case "MTEXT": {
          const raw = e.type === "TEXT" ? e.text : cleanMtext(e.text);
          if (!raw || !e.startPoint) return "";
          pushText(e.layer || "0", raw, X(e.startPoint.x), Y(e.startPoint.y), null, e.type);
          const t = normalizeDigits(String(raw)).trim();
          return `<text data-tag="${esc(t)}" x="${X(e.startPoint.x).toFixed(1)}" y="${Y(e.startPoint.y).toFixed(1)}" font-size="11">${esc(t)}</text>`;
        }
        default:
          return "";
      }
    } catch {
      return "";
    }
  };

  const layers = [...new Set(ents.map((e) => e.layer || "0"))];
  const groups = {};
  layers.forEach((l) => (groups[l] = []));
  for (const e of ents) {
    const str = render(e, e.layer || "0");
    if (str) groups[e.layer || "0"].push(str);
  }

  const body = layers
    .map((l) => `<g data-layer="${esc(l)}" stroke="#333" fill="none" stroke-width="1">${groups[l].join("")}</g>`)
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n${body}\n</svg>`;

  const hasBase = isFinite(bMinX);
  const center = hasBase
    ? { x: X((bMinX + bMaxX) / 2), y: Y((bMinY + bMaxY) / 2) }
    : { x: W / 2, y: H / 2 };

  return { svg, texts, layers, center };
}