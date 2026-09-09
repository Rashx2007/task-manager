import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const rows = await query(`SELECT FolderID, TaskID, FileName, FolderPath FROM Folder_tbl WHERE TaskID = ?`, [taskId]);
    if (rows.length) return NextResponse.json({ success: true, exists: true, data: rows[0] });
    return NextResponse.json({ success: true, exists: false, data: null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { taskId, fileName, folderPath } = await request.json();
    const tid = Number(taskId);
    const rows = await query(`SELECT FolderID FROM Folder_tbl WHERE TaskID = ?`, [tid]);
    if (rows.length) {
      await query(`UPDATE Folder_tbl SET FileName = ?, FolderPath = ? WHERE TaskID = ?`, [fileName || null, folderPath || null, tid]);
    } else {
      await query(`INSERT INTO Folder_tbl (TaskID, FileName, FolderPath) VALUES (?, ?, ?)`, [tid, fileName || null, folderPath || null]);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}