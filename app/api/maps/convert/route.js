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

function fuzzyFindDwg(savedPath) {
  try {
    if (!savedPath) return null;
    const dir = pDirname(savedPath);
    const base = normName(pBasename(savedPath));
    const scan = (d) => fs.existsSync(d)
      ? fs.readdirSync(d).find((f) => f.toLowerCase().endsWith('.dwg') && !/_recover\.dwg$/i.test(f) && normName(f) === base)
      : undefined;
    const hit = scan(dir);
    if (hit) return pJoin(dir, hit);
    const parent = pDirname(dir);
    if (fs.existsSync(parent)) {
      for (const sub of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        const h2 = scan(pJoin(parent, sub.name));
        if (h2) return pJoin(parent, sub.name, h2);
      }
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
    if (!dwgPath || !fs.existsSync(dwgPath))
      dwgPath = fuzzyFindDwg(map.DwgPath);
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
