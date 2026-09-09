import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const esc = (s) => String(s).replace(/'/g, "''");
const has = (s) => s !== undefined && s !== null && String(s).trim() !== '';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const conditions = [];
    if (has(search)) {
      const t = esc(search);
      conditions.push(`((AssetID = TRY_PARSE('${t}' AS INT)) OR (Building LIKE '%${t}%') OR (Block LIKE '%${t}%') OR (Entrance LIKE '%${t}%') OR (Location LIKE '%${t}%') OR (MechSystem LIKE '%${t}%') OR (AssetName LIKE '%${t}%') OR (Specifications LIKE '%${t}%') OR (PropertyCode LIKE '%${t}%') OR (SerialNumber LIKE '%${t}%') OR (Floor = TRY_PARSE('${t}' AS decimal(4,1))) OR (AssetNumber = TRY_PARSE('${t}' AS INT)))`);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const rows = await query(`SELECT AssetID, AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, MechSystem, Specifications, PropertyCode, SerialNumber, FolderPath FROM Asset_2_tbl ${where} ORDER BY Building, Floor, AssetName`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// افزودن دستگاه (معادل AddToAsset.AddToAssetMethod)
export async function POST(request) {
  try {
    const b = await request.json();
    const r = await query(
      `INSERT INTO Asset_2_tbl (AssetName, AssetNumber, PropertyCode, SerialNumber, Building, MechSystem, Block, Floor, Location, Entrance, Specifications, FolderPath)
       OUTPUT INSERTED.AssetID
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.AssetName || null, num(b.AssetNumber), num(b.PropertyCode), b.SerialNumber || null,
       b.Building || null, b.MechSystem || null, b.Block || null, dec(b.Floor),
       b.Location || null, b.Entrance || null, b.Specifications || null, b.FolderPath || null]);
    return NextResponse.json({ success: true, AssetID: r[0].AssetID });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

function num(v) { return v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : 0; }
function dec(v) { return v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : null; }