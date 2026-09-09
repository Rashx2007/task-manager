import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const rows = await query(
      `SELECT a.FolderPath FROM Asset_Task_tbl at INNER JOIN Asset_2_tbl a ON at.AssetID = a.AssetID WHERE at.TaskID = ?`,
      [taskId]);
    return NextResponse.json({ success: true, folderPath: rows.length ? (rows[0].FolderPath || '') : '' });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { assetId, folderPath } = await request.json();
    await query(`UPDATE Asset_2_tbl SET FolderPath = ? WHERE AssetID = ?`, [folderPath || null, Number(assetId)]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}