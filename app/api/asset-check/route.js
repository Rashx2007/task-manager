import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const b = await request.json();
    const { AssetName, AssetNumber, Building, Block, Floor, Entrance, Location } = b || {};
    
    if (!AssetName || !Building) {
      return NextResponse.json({ success: false, error: 'نام دستگاه و ساختمان الزامی است' }, { status: 400 });
    }
    
    const num = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : null);
    const dec = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : null);
    
    const rows = await query(
      `SELECT AssetID FROM Asset_2_tbl
       WHERE AssetName = ? AND AssetNumber = ? AND Building = ? AND Block = ? AND Floor = ? AND Entrance = ? AND Location = ?`,
      [
        String(AssetName),
        num(AssetNumber),
        String(Building),
        String(Block || '-'),
        dec(Floor),
        String(Entrance || ''),
        String(Location || '')
      ]
    );
    
    if (rows.length > 0) {
      return NextResponse.json({ found: true, AssetID: rows[0].AssetID });
    }
    
    return NextResponse.json({ found: false });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}