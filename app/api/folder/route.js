// app/api/folder/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request) {
  try {
    const taskId = Number(new URL(request.url).searchParams.get("taskId"));
    const rows = await query(`SELECT * FROM Folder_tbl WHERE TaskID = ?`, [taskId]);
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const taskId = Number(b.taskId ?? b.TaskID);
    const fileName = (b.FileName ?? b.fileName ?? "") || null;
    const folderPath = (b.FolderPath ?? b.folderPath ?? "") || null;
    const allow = b.AllowedToCopyFiles ?? b.AllowedToCopy ?? b.allowCopy;
    const allowed = allow == null ? 1 : allow ? 1 : 0;

    const ex = await query(`SELECT FolderID FROM Folder_tbl WHERE TaskID = ?`, [taskId]);
    if (ex.length) {
      await query(
        `UPDATE Folder_tbl SET FileName = ?, FolderPath = ?, AllowedToCopyFiles = ? WHERE TaskID = ?`,
        [fileName, folderPath, allowed, taskId],
      );
    } else {
      await query(
        `INSERT INTO Folder_tbl (TaskID, FileName, FolderPath, AllowedToCopyFiles) VALUES (?,?,?,?)`,
        [taskId, fileName, folderPath, allowed],
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}