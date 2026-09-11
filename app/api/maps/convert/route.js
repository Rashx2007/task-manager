import { NextResponse } from "next/server";
import fs from "fs";
import {
  dirname as pDirname,
  basename as pBasename,
  join as pJoin,
} from "path";
import { query } from "@/lib/db";
import {
  hashFile,
  ensureDxf,
  dxfToSvg,
  likeToRegex,
} from "@/lib/map-converter";

const normName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u200c\u200e\u200f\u064b-\u0652]/g, "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();

// ✅ تجزیهٔ نام فایل نقشه (قرارداد جدید + قدیمی)
function parseDwgName(name) {
  let base = String(name || '').replace(/\.dwg$/i, '').replace(/[ـ‌‍‎‏‪‫]/g, '').trim();
  const out = { building: '', block: '', floor: '' };
  const m3 = base.match(/^(.+?)_([A-CX])_(M?\d+(?:-\d+)?)$/i);
  if (m3) {
    out.building = m3[1];
    out.block = m3[2].toUpperCase() === 'X' ? '' : m3[2].toUpperCase();
    let s = m3[3]; let neg = false;
    if (/^M/i.test(s)) { neg = true; s = s.slice(1); }
    if (s.includes('-')) s = s.replace('-', '.');
    out.floor = String(Number(s));
    return out;
  }
  const mFloor = base.match(/(-?\d+(?:\.\d+)?)\s*$/);
  if (mFloor) { out.floor = String(Number(mFloor[1])); base = base.slice(0, mFloor.index); }
  base = base.replace(/[_\-\s]+$/g, '');
  const mBlock = base.match(/([A-Ca-c])$/);
  if (mBlock) { out.block = mBlock[1].toUpperCase(); base = base.slice(0, mBlock.index); }
  out.building = base.replace(/[_\-\s]+$/g, '').trim();
  return out;
}

const normFa = (s) => String(s || '').replace(/[\u200c\u200e\u200f\u064b-\u0652]/g, '').replace(/\s+/g, ' ').trim();

// ✅ جست‌وجوی DWG: ۱) نزدیک مسیر قدیمی بر اساس نام ۲) زیر ریشه‌ها بر اساس ساختمان/بلوک/طبقه
function fuzzyFindDwg(savedPath, map) {
  try {
    const isDwg = (f) => f.toLowerCase().endsWith('.dwg') && !/_recover\.dwg$/i.test(f);
    const base = normName(pBasename(savedPath || ''));
    if (savedPath) {
      const dirs = [pDirname(savedPath), pDirname(pDirname(savedPath))];
      for (const d of dirs) {
        if (!fs.existsSync(d)) continue;
        const hit = fs.readdirSync(d).find((f) => isDwg(f) && normName(f) === base);
        if (hit) return pJoin(d, hit);
      }
    }
    const roots = String(process.env.MAP_DWG_ROOTS || 'E:\\(Work)\\نقشه فن‌کویل‌ها\\C\\DWG')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const want = {
      building: normFa(map?.Building || ''),
      block: String(map?.Block || '').toUpperCase(),
      floor: String(Number(map?.Floor ?? NaN)),
    };
    const walk = (dir, depth) => {
      if (depth > 5 || !fs.existsSync(dir)) return null;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
      for (const en of entries) {
        if (en.isFile() && isDwg(en.name)) {
          if (base && normName(en.name) === base) return pJoin(dir, en.name);
          const pn = parseDwgName(en.name);
          if (
            normFa(pn.building) === want.building &&
            (pn.block || '') === (want.block || '') &&
            String(Number(pn.floor)) === want.floor
          ) return pJoin(dir, en.name);
        }
      }
      for (const en of entries) {
        if (!en.isDirectory()) continue;
        const r = walk(pJoin(dir, en.name), depth + 1);
        if (r) return r;
      }
      return null;
    };
    for (const root of roots) {
      const r = walk(root, 0);
      if (r) return r;
    }
    return null;
  } catch { return null; }
}

export async function POST(request) {
  try {
    const { mapId, force } = await request.json();
    const maps = await query(`SELECT * FROM Map_tbl WHERE MapID=?`, [
      Number(mapId),
    ]);
    if (!maps.length)
      return NextResponse.json(
        { success: false, error: "نقشه یافت نشد." },
        { status: 404 },
      );
    const map = maps[0];
    let dwgPath = map.DwgPath;
        if (!dwgPath || !fs.existsSync(dwgPath)) dwgPath = fuzzyFindDwg(map.DwgPath, map);
    if (!dwgPath || !fs.existsSync(dwgPath)) {
      return NextResponse.json(
        { success: false, error: "فایل DWG پیدا نشد: " + map.DwgPath },
        { status: 404 },
      );
    }
    if (dwgPath !== map.DwgPath) {
      await query("UPDATE Map_tbl SET DwgPath = ? WHERE MapID = ?", [
        dwgPath,
        map.MapID,
      ]);
    }

    const hash = hashFile(map.DwgPath);
    if (!force && hash === map.FileHash)
      return NextResponse.json({ success: true, unchanged: true });

    const rules = await query(`SELECT * FROM MapLayerRule_tbl`);
    const basePatterns = rules.filter((r) => r.IsBase).map((r) => r.LayerLike);
    const { svg, texts, layers, center } = dxfToSvg(
      ensureDxf(map.DwgPath),
      basePatterns,
    );
    const isBase = (l) =>
      rules.some((r) => r.IsBase && likeToRegex(r.LayerLike).test(l));
    const isKnown = (l) =>
      rules.some((r) => !r.IsBase && likeToRegex(r.LayerLike).test(l));
    // ✅ لایه‌های ناشناختهٔ دارای متن → باید از کاربر پرسیده شود
    const unknownLayers = layers.filter(
      (l) => !isBase(l) && !isKnown(l) && texts.some((t) => t.layer === l),
    );

    const dir = path.join(process.cwd(), "public", "maps");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const version = (map.Version || 0) + 1;
    const svgName = `map_${map.MapID}_v${version}.svg`;
    fs.writeFileSync(path.join(dir, svgName), svg, "utf8");

    await query(`DELETE FROM MapText_tbl WHERE MapID=?`, [map.MapID]);
    for (const t of texts)
      await query(
        `INSERT INTO MapText_tbl (MapID, Layer, TagText, X, Y) VALUES (?,?,?,?,?)`,
        [map.MapID, t.layer, t.text, t.x, t.y],
      );
    await query(
      `UPDATE Map_tbl SET FileHash=?, Version=?, SvgPath=?, ConvertedAt=GETDATE(), CenterX=?, CenterY=? WHERE MapID=?`,
      [hash, version, "/maps/" + svgName, center.x, center.y, map.MapID],
    );

    const assets = await query(
      `SELECT AssetID, MapTag FROM Asset_2_tbl WHERE Building=? AND Block=? AND Floor=? AND IsActive=1`,
      [map.Building, map.Block, map.Floor],
    );
    const assetTags = new Set(assets.map((a) => a.MapTag).filter(Boolean));
    const mapTags = new Set(texts.map((t) => t.text));
    const newOnMap = texts
      .filter((t) => isKnown(t.layer) && !assetTags.has(t.text))
      .map((t) => ({ text: t.text, layer: t.layer }));
    const orphanInDb = assets
      .filter((a) => a.MapTag && !mapTags.has(a.MapTag))
      .map((a) => ({ assetId: a.AssetID, tag: a.MapTag }));

    return NextResponse.json({
      success: true,
      unknownLayers,
      newOnMap,
      orphanInDb,
      svgUrl: "/maps/" + svgName,
      version,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}
