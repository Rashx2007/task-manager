import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const rows = await query(`SELECT AssetID, AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, MechSystem, Specifications, PropertyCode FROM Asset_2_tbl ORDER BY AssetName`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}