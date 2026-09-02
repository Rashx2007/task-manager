import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { items, building, block, floor } = await request.json();
    const ids = [];
    for (const it of items || []) {
      if (it.deactivate) {
        await query(`UPDATE Asset_2_tbl SET IsActive=0 WHERE AssetID=?`, [Number(it.assetId)]); // هرگز حذف نمی‌شود
      } else if (it.assetId) {
        await query(`UPDATE Asset_2_tbl SET MapTag=? WHERE AssetID=?`, [it.text, Number(it.assetId)]);
        ids.push(Number(it.assetId));
      } else {
        const r = await query(`INSERT INTO Asset_2_tbl (AssetName, Building, Block, Floor, MapTag, IsActive) OUTPUT INSERTED.AssetID VALUES (?,?,?,?,?,1)`,
          [it.deviceType, building, block || '', floor, it.text]);
        ids.push(r[0].AssetID);
      }
    }
    return NextResponse.json({ success: true, ids });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
