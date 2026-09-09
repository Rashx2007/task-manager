// folder/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  const rows = await query(`SELECT FolderID, TaskID, FileName, FolderPath FROM Folder_tbl WHERE TaskID=?`, [taskId]);
  return NextResponse.json({ success: true, exists: rows.length > 0, data: rows[0] || null });
}
export async function POST(request) {
  const { taskId, fileName, folderPath } = await request.json();
  const ex = await query(`SELECT FolderID FROM Folder_tbl WHERE TaskID=?`, [Number(taskId)]);
  if (ex.length) await query(`UPDATE Folder_tbl SET FileName=?, FolderPath=? WHERE TaskID=?`, [fileName || null, folderPath || null, Number(taskId)]);
  else await query(`INSERT INTO Folder_tbl (TaskID, FileName, FolderPath) VALUES (?,?,?)`, [Number(taskId), fileName || null, folderPath || null]);
  return NextResponse.json({ success: true });
}