import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
const num = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : 0);
const dec = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : null);
export async function GET(request, { params }) {
  const { id } = await params;
  const rows = await query(`SELECT * FROM Asset_2_tbl WHERE AssetID=?`, [Number(id)]);
  if (!rows.length) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: rows[0] });
}
export async function PUT(request, { params }) {
  const { id } = await params; const b = await request.json();
  await query(`UPDATE Asset_2_tbl SET AssetName=?, AssetNumber=?, Building=?, Block=?, Floor=?, Entrance=?, Location=?, MechSystem=?, Specifications=?, PropertyCode=?, SerialNumber=?, FolderPath=? WHERE AssetID=?`,
    [b.AssetName, num(b.AssetNumber), b.Building, b.Block || null, dec(b.Floor), b.Entrance || null, b.Location || null, b.MechSystem || null, b.Specifications || null, num(b.PropertyCode), num(b.SerialNumber), b.FolderPath || null, Number(id)]);
  return NextResponse.json({ success: true });
}
export async function DELETE(request, { params }) {
  const { id } = await params;
  const deps = await query(`SELECT COUNT(*) AS c FROM Asset_Task_tbl WHERE AssetID=?`, [Number(id)]);
  if (deps[0].c > 0) return NextResponse.json({ success: false, error: `برای این دستگاه ${deps[0].c} کار تعریف شده است.` }, { status: 400 });
  await query(`DELETE FROM Asset_2_tbl WHERE AssetID=?`, [Number(id)]);
  return NextResponse.json({ success: true });
}