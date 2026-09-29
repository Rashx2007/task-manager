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

// ✅ رمزگشایی کلی فایل: UTF-8 معتبر → همان؛ UTF-8 با چند بایت سرگردان → همان؛ وگرنه کدپیج فارسی
function decodeDxf(buf) {
  const head = buf.slice(0, 4000).toString("latin1");
  const ver = (head.match(/\$ACADVER[\s\S]{0,6}?(AC\d{4})/) || [])[1] || "";
  // ✅ AutoCAD 2007+ (AC1021 به بعد): متن DXF همیشه UTF-8 است؛ هدر کدپیج قابل اتکا نیست
  const modern = !ver || ver >= "AC1021";
  if (modern) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {}
    // بلاب‌های باینری (Embedded Object/جدول‌ها) fatal را می‌شکنند؛ non-fatal + حذف نویزه‌ها
    return new TextDecoder("utf-8", { fatal: false }).decode(buf).replace(/\uFFFD/g, "");
  }
  const m = head.match(/\$DWGCODEPAGE[\s\S]{0,60}?ANSI_(\d+)/);
  const cp = m ? "windows-" + m[1] : "windows-1256";
  try {
    return new TextDecoder(cp).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf).replace(/\uFFFD/g, "");
  }
}

// ✅✅ ترمیم متن‌به‌متن: بایت‌های فارسی که مثل cp1252 خوانده شده‌اند (mojibake) را برمی‌گرداند
const CP1252_SPECIAL = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};
const toBytes1252 = (s) => {
  const out = [];
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (CP1252_SPECIAL[cp] != null) out.push(CP1252_SPECIAL[cp]);
    else if (cp <= 0xff) out.push(cp);
    else return null;
  }
  return Buffer.from(out);
};
const persianRatio = (s) =>
  (String(s).match(/[\u0600-\u06ff]/g) || []).length / Math.max(1, String(s).length);
const MOJIBAKE_RX = /[Œœ‹›•†‡ˆ˜™šžŸ—–“”‘’‚„…¢£¤¦§¨©ª¬¯°±²³´µ¶·¸º¾½¼]/;
export const repairEncoding = (t) => {
  const s = String(t ?? "");
  if (!s) return s;
  if (persianRatio(s) > 0.3) return s;
  if (!MOJIBAKE_RX.test(s)) return s;
  const bytes = toBytes1252(s);
  if (!bytes) return s;
  for (const enc of ["windows-1256", "utf-8"]) {
    try {
      const cand = new TextDecoder(enc).decode(bytes);
      if (/[\u0600-\u06ff]/.test(cand) && persianRatio(cand) > persianRatio(s)) return cand;
    } catch {}
  }
  return s;
};

function findAcad() {
  if (process.env.ACCORECONSOLE_PATH && fs.existsSync(process.env.ACCORECONSOLE_PATH))
    return process.env.ACCORECONSOLE_PATH;
  const roots = ["C:\\Program Files\\Autodesk", "C:\\Program Files (x86)\\Autodesk"];
  for (const root of roots) {
    try {
      const dirs = fs.readdirSync(root).filter((d) => /AutoCAD\s?20\d\d/i.test(d)).sort().reverse();
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
    if (fs.existsSync(dxfNext) && fs.statSync(dxfNext).mtimeMs >= fs.statSync(dwgPath).mtimeMs)
      return dxfNext;
  } catch {}
  const acad = findAcad();
  if (!acad)
    throw new Error("accoreconsole.exe پیدا نشد؛ مسیر آن را در متغیر محیطی ACCORECONSOLE_PATH تنظیم کنید.");
  const stamp = Date.now();
  const asciiDxf = path.join(os.tmpdir(), `dwg_export_${stamp}.dxf`);
  const scr = path.join(os.tmpdir(), `dwg_export_${stamp}.scr`);
  fs.writeFileSync(scr, 'FILEDIA\n0\nDXFOUT\n"' + asciiDxf + '"\n\n16\n');
  const r = spawnSync(acad, ["/i", dwgPath, "/s", scr, "/l", "en-US"], { timeout: 300000 });
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

// ✅✅ FALLBACK: خواندن ATTRIBها مستقیم از متن DXF (برخی نسخه‌های dxf-parser آن‌ها را حذف می‌کنند)
//    ساختار DXF خط‌محور است: یک خط کد گروه، یک خط مقدار
function parseAttribsRaw(dxfText) {
  const lines = String(dxfText).split(/\r?\n/);
  const out = [];
  let cur = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const val = lines[i + 1];
    if (code === "0") {
      const t = String(val || "").trim();
      cur = t === "ATTRIB" ? {} : null;
      if (cur) out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (code === "1") cur.text = val;
    else if (code === "2") cur.tag = val;
    else if (code === "8") cur.layer = String(val || "").trim();
    else if (code === "10") cur.x = parseFloat(val);
    else if (code === "20") cur.y = parseFloat(val);
  }
  return out.filter((a) => a.text != null && isFinite(a.x) && isFinite(a.y));
}

export function dxfToSvg(dxfPath, basePatterns = []) {
  const parser = new DxfParser();
  const decoded = decodeDxf(fs.readFileSync(dxfPath));
  const dxf = parser.parseSync(decoded);
  const ents = dxf.entities || [];
  const blocks = dxf.blocks || {};
  const isBase = (l) => basePatterns.some((p) => likeToRegex(p).test(l || ""));
  const isCenterLayer = (l) => /centerline|center-line|^cl$|axe|axis/i.test(l || "");

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
  let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
  const addC = (x, y) => {
    if (x < cMinX) cMinX = x;
    if (x > cMaxX) cMaxX = x;
    if (y < cMinY) cMinY = y;
    if (y > cMaxY) cMaxY = y;
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
    else if (e.type === "INSERT" && e.insertionPoint) cb(e.insertionPoint.x, e.insertionPoint.y);
    else if (e.type === "SPLINE") (e.fitPoints || e.controlPoints || []).forEach((v) => cb(v.x, v.y));
    else if (e.type === "ELLIPSE" && e.center) cb(e.center.x, e.center.y);
    else if (e.type === "SOLID" && e.vertices) e.vertices.forEach((v) => cb(v.x, v.y));
  };

  for (const e of ents) {
    geoPoints(e, addP);
    if (isBase(e.layer)) geoPoints(e, addB);
    if (isCenterLayer(e.layer)) geoPoints(e, addC);
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
    const t = normalizeDigits(repairEncoding(String(raw ?? ""))).trim();
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
          return `<polyline fill="none" points="${(e.vertices || []).map((v) => X(v.x).toFixed(1) + "," + Y(v.y).toFixed(1)).join(" ")}"/>`;
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
                out.push(`<line x1="${X(ed.start.x).toFixed(1)}" y1="${Y(ed.start.y).toFixed(1)}" x2="${X(ed.end.x).toFixed(1)}" y2="${Y(ed.end.y).toFixed(1)}"/>`);
            }
          }
          return out.join("");
        }
        // ✅ ATTRIB مستقل (اعداد داخل دایره/برچسب بلوک): هم رندر می‌شود هم ثبت
        case "ATTRIB": {
          if (!e.startPoint) return "";
          const t = normalizeDigits(repairEncoding(String(e.text ?? e.value ?? ""))).trim();
          if (!t) return "";
          pushText(e.layer || "0", t, X(e.startPoint.x), Y(e.startPoint.y), null, "ATTRIB");
          return `<text data-tag="${esc(t)}" x="${X(e.startPoint.x).toFixed(1)}" y="${Y(e.startPoint.y).toFixed(1)}" font-size="10">${esc(t)}</text>`;
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
                const raw = c.type === "MTEXT" ? cleanMtext(c.text) : c.text ?? c.value;
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
          const t = normalizeDigits(repairEncoding(String(raw))).trim();
          if (!t) return "";
          pushText(e.layer || "0", t, X(e.startPoint.x), Y(e.startPoint.y), null, e.type);
          return `<text data-tag="${esc(t)}" x="${X(e.startPoint.x).toFixed(1)}" y="${Y(e.startPoint.y).toFixed(1)}" font-size="11">${esc(t)}</text>`;
        }
        default:
          return "";
      }
    } catch {
      return "";
    }
  };

  // ✅ ادغام ATTRIBهای خوانده‌شده از متن خام (بدون تکرارِ آنچه پارسر داده)
  {
    const seen = new Set(texts.map((t) => `${t.layer}|${t.text}|${t.x.toFixed(1)}|${t.y.toFixed(1)}`));
    for (const a of parseAttribsRaw(decoded)) {
      const t = normalizeDigits(repairEncoding(String(a.text ?? ""))).trim();
      if (!t) continue;
      const x = X(a.x);
      const y = Y(a.y);
      const key = `${a.layer || "0"}|${t}|${x.toFixed(1)}|${y.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      texts.push({ layer: a.layer || "0", text: t, x, y, groupId: null, type: "ATTRIB" });
    }
  }

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

  // ✅ دایره‌ها (برای قاعدهٔ «عدد داخل دایره»)
  const circles = [];
  for (const e of ents) {
    if (e.type === "CIRCLE" && e.center) {
      circles.push({ cx: X(e.center.x), cy: Y(e.center.y), r: (e.radius || 0) * s });
    } else if (e.type === "INSERT" && e.insertionPoint) {
      const b = blocks[e.name];
      if (!b || !b.entities) continue;
      const rotRad = Number(e.rotation) || 0;
      const sx = Number(e.xScale ?? 1) || 1;
      const cos = Math.cos(rotRad), sin = Math.sin(rotRad);
      for (const c of b.entities) {
        if (c.type === "CIRCLE" && c.center) {
          const lx = c.center.x * sx, ly = c.center.y * sx;
          circles.push({
            cx: X(e.insertionPoint.x + (lx * cos - ly * sin)),
            cy: Y(e.insertionPoint.y + (lx * sin + ly * cos)),
            r: (c.radius || 0) * sx * s,
          });
        }
      }
    }
  }

  const hasCenter = isFinite(cMinX);
  const hasBase = isFinite(bMinX);
  const center = hasCenter
    ? { x: X((cMinX + cMaxX) / 2), y: Y((cMinY + cMaxY) / 2) }
    : hasBase
      ? { x: X((bMinX + bMaxX) / 2), y: Y((bMinY + bMaxY) / 2) }
      : { x: W / 2, y: H / 2 };

  return { svg, texts, layers, center, circles };
}