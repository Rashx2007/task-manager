import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request, { params }) {
  const { id } = await params;
  const rows = await query(`SELECT * FROM Asset_2_tbl WHERE AssetID = ?`, [Number(id)]);
  if (!rows.length) return NextResponse.json({ success: false, error: 'یافت نشد' }, { status: 404 });
  return NextResponse.json({ success: true, data: rows[0] });
}

// ویرایش (معادل AddToAsset.EditAssetMethod)
export async function PUT(request, { params }) {
  const { id } = await params;
  const b = await request.json();
  await query(
    `UPDATE Asset_2_tbl SET AssetName=?, AssetNumber=?, PropertyCode=?, SerialNumber=?, Building=?, MechSystem=?, Block=?, Floor=?, Location=?, Entrance=?, Specifications=?, FolderPath=?
     WHERE AssetID=?`,
    [b.AssetName || null, num(b.AssetNumber), num(b.PropertyCode), b.SerialNumber || null,
     b.Building || null, b.MechSystem || null, b.Block || null, dec(b.Floor),
     b.Location || null, b.Entrance || null, b.Specifications || null, b.FolderPath || null, Number(id)]);
  return NextResponse.json({ success: true });
}

// حذف با بررسی وابستگی (معادل DeleteBtn_Click)
export async function DELETE(request, { params }) {
  const { id } = await params;
  const deps = await query(`SELECT COUNT(*) AS c FROM Asset_Task_tbl WHERE AssetID = ?`, [Number(id)]);
  if (deps[0].c > 0) {
    return NextResponse.json({ success: false, error: `برای این دستگاه ${deps[0].c} کار تعریف شده است؛ ابتدا آن کارها را ویرایش و دستگاهشان را تغییر دهید.` }, { status: 400 });
  }
  await query(`DELETE FROM Asset_2_tbl WHERE AssetID = ?`, [Number(id)]);
  return NextResponse.json({ success: true });
}

function num(v) { return v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : 0; }
function dec(v) { return v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : null; }