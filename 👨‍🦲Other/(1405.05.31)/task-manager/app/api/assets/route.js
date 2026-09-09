import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function GET() {
  try {
    const rows = await query(`SELECT AssetID, AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, MechSystem, Specifications, PropertyCode, SerialNumber, FolderPath FROM Asset_2_tbl ORDER BY Building, Floor, AssetName`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
export async function POST(request) {
  try {
    const b = await request.json();
    const r = await query(`INSERT INTO Asset_2_tbl (AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, MechSystem, Specifications, PropertyCode, SerialNumber, FolderPath)
      OUTPUT INSERTED.AssetID VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.AssetName, num(b.AssetNumber), b.Building, b.Block || null, dec(b.Floor), b.Entrance || null, b.Location || null, b.MechSystem || null, b.Specifications || null, num(b.PropertyCode), num(b.SerialNumber), b.FolderPath || null]);
    return NextResponse.json({ success: true, AssetID: r[0].AssetID });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
const num = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : 0);
const dec = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : null);