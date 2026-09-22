// app/api/restore/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { query } from "@/lib/db";

const ROOT = process.env.DB_BACKUP_ROOT || "F:\\(Task)\\Projects\\DBBackups";
const DB = process.env.DB_NAME || "WorkDB";

const esc = (p) => String(p).replace(/'/g, "''");

// ✅ استخراج مقاوم پیام خطا از msnodesql (آرایه/شیء/رشته) تا هرگز undefined نباشد
const errMsg = (e) => {
  if (!e) return "خطای نامشخص";
  if (Array.isArray(e))
    return e.map((x) => (x && (x.message || x.description)) || String(x)).join(" | ");
  if (typeof e === "string") return e;
  return e.message || e.description || JSON.stringify(e);
};

export async function POST(request) {
  let full = "";
  try {
    const body = await request.json();
    if (body.path) full = String(body.path);
    else if (body.file) full = path.join(ROOT, String(body.file));
    else return NextResponse.json({ success: false, error: "فایل یا مسیر مشخص نشده." }, { status: 400 });

    if (!full.toLowerCase().endsWith(".bak") || !fs.existsSync(full)) {
      return NextResponse.json({ success: false, error: "فایل .bak یافت نشد: " + full }, { status: 404 });
    }

    // ✅ همه در یک batch روی یک اتصال: تک‌کاربره → RESTORE با REPLACE → چندنکاره
    const batch =
      `ALTER DATABASE [${DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;\n` +
      `RESTORE DATABASE [${DB}] FROM DISK = '${esc(full)}' WITH REPLACE, STATS = 10;\n` +
      `ALTER DATABASE [${DB}] SET MULTI_USER;`;
    await query(batch);

    return NextResponse.json({ success: true, message: "بازگردانی با موفقیت انجام شد." });
  } catch (e) {
    // ✅ تلاش ایمن برای برگرداندن حالت چندنکاره اگر batch نیمه‌کاره ماند
    try {
      await query(`ALTER DATABASE [${DB}] SET MULTI_USER;`);
    } catch {}
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}