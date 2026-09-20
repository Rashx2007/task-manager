import { NextResponse } from 'next/server';
import fs from 'fs';
import { query } from '@/lib/db';
import { hashFile } from '@/lib/map-converter';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const building = searchParams.get('building'), block = searchParams.get('block') || '', floor = searchParams.get('floor');
  try {
    const rules = await query(`SELECT * FROM MapLayerRule_tbl`);
const deviceTypes = [...new Set(rules.filter((r) => !r.IsBase && r.DeviceType !== '__IGNORE__').map((r) => r.DeviceType))];    const rows = await query(`SELECT * FROM Map_tbl WHERE Building=? AND Block=? AND Floor=?`, [building, block, floor]);
    if (!rows.length) return NextResponse.json({ success: true, map: null, rules, deviceTypes });
    const map = rows[0];
    let hashChanged = false;
    if (map.DwgPath && fs.existsSync(map.DwgPath)) hashChanged = hashFile(map.DwgPath) !== map.FileHash;
const tags = await query(`SELECT t.*, t.TagText AS text, t.Layer AS layer, t.X AS x, t.Y AS y, a.AssetID FROM MapText_tbl t LEFT JOIN Asset_2_tbl a ON a.MapTag = t.TagText AND a.IsActive = 1 WHERE t.MapID=?`, [map.MapID]);    return NextResponse.json({ success: true, map, hashChanged, rules, deviceTypes, tags, svgUrl: map.SvgPath });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { building, block, floor, dwgPath, checkOnly } = await request.json();
    const ex = await query(`SELECT MapID FROM Map_tbl WHERE Building=? AND Block=? AND Floor=?`, [building, block || '', floor]);
    if (ex.length) {
      const mapId = ex[0].MapID;
      // ✅ حالت استعلام: بدون هیچ تغییری، وضعیت نقشهٔ ذخیره‌شده و اختلاف هش را برگردان
      if (checkOnly) {
        const rows = await query(`SELECT * FROM Map_tbl WHERE MapID=?`, [mapId]);
        const map = rows[0];
        let hashChanged = false;
        if (dwgPath && fs.existsSync(dwgPath)) hashChanged = hashFile(dwgPath) !== map.FileHash;
        return NextResponse.json({
          success: true,
          exists: true,
          mapId,
          svgPath: map.SvgPath || '',
          version: map.Version || 0,
          convertedAt: map.ConvertedAt || null,
          hashChanged,
        });
      }
      await query(`UPDATE Map_tbl SET DwgPath=? WHERE MapID=?`, [dwgPath, mapId]);
      return NextResponse.json({ success: true, mapId });
    }
    if (checkOnly) return NextResponse.json({ success: true, exists: false });
    const r = await query(`INSERT INTO Map_tbl (Building, Block, Floor, DwgPath) OUTPUT INSERTED.MapID VALUES (?,?,?,?)`, [building, block || '', floor, dwgPath]);
    return NextResponse.json({ success: true, mapId: r[0].MapID });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}