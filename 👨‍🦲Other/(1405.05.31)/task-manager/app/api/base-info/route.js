import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function GET() {
  const names = await query(`SELECT AssetNameID, AssetName FROM AssetNames_tbl ORDER BY AssetName`);
  const systems = await query(`SELECT MechSystemsID, MechSystem FROM MechSystems_tbl ORDER BY MechSystem`);
  return NextResponse.json({ success: true, names, systems });
}
export async function POST(request) {
  const { kind, value } = await request.json();
  if (!value || !String(value).trim()) return NextResponse.json({ success: false, error: 'مقدار خالی است' }, { status: 400 });
  if (kind === 'name') await query(`INSERT INTO AssetNames_tbl (AssetName, MechSystemID) VALUES (?,0)`, [String(value).trim()]);
  else await query(`INSERT INTO MechSystems_tbl (MechSystem) VALUES (?)`, [String(value).trim()]);
  return NextResponse.json({ success: true });
}