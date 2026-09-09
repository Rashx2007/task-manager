import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
const DEFAULT_FOLDER = 'C:\\DBBackups';

// ---------- تبدیل میلادی به شمسی (الگوریتم استاندارد jalaali) ----------
function toJalali(date) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return { jy, jm, jd };
}

const pad = (n) => String(n).padStart(2, '0');

// مُهر زمانی شمسی — دقیقاً مثل فرمت C#: 1405.05.21-22.30.27
function shamsiStamp(date = new Date()) {
  const { jy, jm, jd } = toJalali(date);
  return `${jy}.${pad(jm)}.${pad(jd)}-${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

// ---------- GET: لیست فایل‌های .bak پوشه ----------
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = (searchParams.get('folder') || DEFAULT_FOLDER).trim();
    if (!fs.existsSync(folder)) return NextResponse.json({ success: true, files: [] });
    const files = fs.readdirSync(folder)
      .filter((f) => f.toLowerCase().endsWith('.bak'))
      .map((f) => {
        const st = fs.statSync(path.join(folder, f));
        return { name: f, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return NextResponse.json({ success: true, files });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ---------- POST: ایجاد بکاپ با نام شمسی ----------
export async function POST(request) {
  try {
    const body = await request.json();
    const folder = (body.folder && String(body.folder).trim()) || DEFAULT_FOLDER;
    fs.mkdirSync(folder, { recursive: true });

    const now = new Date();
    const file = path.join(folder, `(${shamsiStamp(now)}) _WorkDB.bak`);
    const sqlFile = file.replace(/'/g, "''");

    await query(
      `BACKUP DATABASE [WorkDB] TO DISK = N'${sqlFile}' WITH NOFORMAT, NOINIT, NAME = N'WorkDB-Full Database Backup', SKIP, NOREWIND, NOUNLOAD, STATS = 10, CHECKSUM`
    );
    return NextResponse.json({ success: true, file });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}