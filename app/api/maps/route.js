import { NextResponse } from 'next/server';
import fs from 'fs';
import { query } from '@/lib/db';
import { hashFile } from '@/lib/map-converter';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const building = searchParams.get('building'), block = searchParams.get('block') || '', floor = searchParams.get('floor');
  try {
    const rules = await query(`SELECT * FROM MapLayerRule_tbl`);
    const deviceTypes = [...new Set(rules.filter((r) => !r.IsBase).map((r) => r.DeviceType))];
    const rows = await query(`SELECT * FROM Map_tbl WHERE Building=? AND Block=? AND Floor=?`, [building, block, floor]);
    if (!rows.length) return NextResponse.json({ success: true, map: null, rules, deviceTypes });
    const map = rows[0];
    let hashChanged = false;
    if (map.DwgPath && fs.existsSync(map.DwgPath)) hashChanged = hashFile(map.DwgPath) !== map.FileHash;
    const tags = await query(`SELECT t.*, a.AssetID FROM MapText_tbl t LEFT JOIN Asset_2_tbl a ON a.MapTag = t.TagText AND a.IsActive = 1 WHERE t.MapID=?`, [map.MapID]);
    return NextResponse.json({ success: true, map, hashChanged, rules, deviceTypes, tags, svgUrl: map.SvgPath });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { building, block, floor, dwgPath } = await request.json();
    const ex = await query(`SELECT MapID FROM Map_tbl WHERE Building=? AND Block=? AND Floor=?`, [building, block || '', floor]);
    if (ex.length) {
      await query(`UPDATE Map_tbl SET DwgPath=? WHERE MapID=?`, [dwgPath, ex[0].MapID]);
      return NextResponse.json({ success: true, mapId: ex[0].MapID });
    }
    const r = await query(`INSERT INTO Map_tbl (Building, Block, Floor, DwgPath) OUTPUT INSERTED.MapID VALUES (?,?,?,?)`, [building, block || '', floor, dwgPath]);
    return NextResponse.json({ success: true, mapId: r[0].MapID });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}