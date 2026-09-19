import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ✅ تمیزکردن کاراکترهای غیرمجاز ویندوز هنگام ذخیرهٔ مسیر
const cleanSegment = (seg) => String(seg).replace(/[*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
const sanitizePath = (p) =>
  String(p || '')
    .split(/[\\/]+/)
    .map((seg, i) => (i === 0 ? seg : cleanSegment(seg)))
    .filter((seg, i) => i === 0 || seg !== '')
    .join('\\');

export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  const rows = await query(
    `SELECT a.AssetID, a.FolderPath FROM Asset_Task_tbl at INNER JOIN Asset_2_tbl a ON at.AssetID=a.AssetID WHERE at.TaskID=?`,
    [taskId]
  );
  return NextResponse.json({
    success: true,
    assetId: rows.length ? rows[0].AssetID : null,
    folderPath: rows.length ? rows[0].FolderPath || '' : '',
  });
}

export async function POST(request) {
  const { assetId, folderPath } = await request.json();
  const clean = sanitizePath(folderPath || '');
  await query(`UPDATE Asset_2_tbl SET FolderPath=? WHERE AssetID=?`, [clean || null, Number(assetId)]);
  return NextResponse.json({ success: true, folderPath: clean });
}