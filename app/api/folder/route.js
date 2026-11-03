// app/api/folder/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// ODBC providers can expose SQL details through nested errors. Inspect only to
// classify the failure; never return database messages or path fragments.
function classifyFolderError(error) {
  const pending = [error], seen = new Set(), messages = [];
  let tooLong = false;
  while (pending.length && seen.size < 30) {
    const value = pending.pop();
    if (typeof value === "string") { messages.push(value); continue; }
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) { pending.push(...value.slice(0, 30)); continue; }
    if (typeof value.message === "string") messages.push(value.message);
    if ([value.number, value.code, value.sqlstate, value.sqlState].some(v => ["2628", "8152", "22001"].includes(String(v ?? "")))) tooLong = true;
    pending.push(value.cause, value.originalError, value.errors);
  }
  const message = messages.join(" ");
  if (/string or binary data would be truncated/i.test(message)) tooLong = true;
  if (!tooLong) return null;
  if (/\bcolumn\s+['"\[]?FileName(?:['"\]]|\b)/i.test(message)) return {
    code: "FILE_NAME_TOO_LONG",
    error: "ذخیره انجام نشد؛ نام یا مسیر فایل برای ثبت طولانی است. فایلی با نام یا مسیر کوتاه‌تر انتخاب کنید و دوباره تلاش کنید.",
  };
  if (/\bcolumn\s+['"\[]?FolderPath(?:['"\]]|\b)/i.test(message)) return {
    code: "FOLDER_PATH_TOO_LONG",
    error: "ذخیره انجام نشد؛ مسیر پوشه برای ثبت طولانی است. پوشه‌ای با مسیر کوتاه‌تر انتخاب کنید و دوباره تلاش کنید.",
  };
  return {
    code: "FOLDER_VALUE_TOO_LONG",
    error: "ذخیره انجام نشد؛ نام فایل یا مسیر واردشده برای ثبت طولانی است. از نام یا مسیر کوتاه‌تری استفاده کنید و دوباره تلاش کنید.",
  };
}

export async function GET(request) {
  try {
    const taskId = Number(new URL(request.url).searchParams.get("taskId"));
    const rows = await query(`SELECT * FROM Folder_tbl WHERE TaskID = ?`, [taskId]);
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch {
    return NextResponse.json({ success: false, error: "دریافت اطلاعات پوشه انجام نشد؛ دوباره تلاش کنید.", code: "FOLDER_READ_FAILED" }, { status: 500 });
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
    const failure = classifyFolderError(e);
    if (failure) return NextResponse.json({ success: false, ...failure }, { status: 400 });
    return NextResponse.json({ success: false, error: "ذخیرهٔ اطلاعات پوشه انجام نشد؛ دوباره تلاش کنید.", code: "FOLDER_SAVE_FAILED" }, { status: 500 });
  }
}