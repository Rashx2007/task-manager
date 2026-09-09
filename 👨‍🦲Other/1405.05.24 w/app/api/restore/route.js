import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

// اجرای بچ SQL با sqlcmd و در صورت نبود، osql (هر دو با احراز هویت ویندوزی)
async function runSql(batch) {
  const attempts = [
    ['sqlcmd', ['-E', '-S', '(local)', '-b', '-Q', batch]],
    ['osql', ['-E', '-S', '(local)', '-b', '-Q', batch]],
  ];
  let lastErr = null;
  for (const [cmd, args] of attempts) {
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 600000, windowsHide: true });
      return { stdout, stderr };
    } catch (e) {
      lastErr = e;
      if (e.code === 'ENOENT') continue; // دستور پیدا نشد → ابزار بعدی
      break; // خطای SQL → همان را گزارش کن
    }
  }
  throw lastErr || new Error('sqlcmd/osql در دسترس نیست.');
}

export async function POST(request) {
  try {
    const { file = '' } = await request.json();
    const p = String(file).trim();
    if (!p) return NextResponse.json({ success: false, error: 'مسیر فایل پشتیبان مشخص نشده است.' }, { status: 400 });
    if (!fs.existsSync(p)) return NextResponse.json({ success: false, error: 'فایل پشتیبان پیدا نشد: ' + p }, { status: 404 });

    const safe = p.replace(/'/g, "''");
    const batch =
      "ALTER DATABASE [WorkDB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;\n" +
      "RESTORE DATABASE [WorkDB] FROM DISK = N'" + safe + "' WITH FILE = 1, REPLACE, STATS = 5;\n" +
      "ALTER DATABASE [WorkDB] SET MULTI_USER;";

    const { stdout, stderr } = await runSql(batch);
    return NextResponse.json({ success: true, output: String(stdout || stderr || '').slice(0, 2000) });
  } catch (e) {
    // اطمینان از اینکه دیتابیس در حالت SINGLE_USER نماند
    try { await runSql("ALTER DATABASE [WorkDB] SET MULTI_USER;"); } catch {}
    const msg = e && (e.stderr || e.stdout) ? String(e.stderr || e.stdout) : String((e && e.message) || e);
    return NextResponse.json({ success: false, error: msg.slice(0, 2000) }, { status: 500 });
  }
}