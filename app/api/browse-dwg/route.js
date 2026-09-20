import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ✅ ریشه‌های مرور؛ قابل تغییر با متغیر محیطی MAP_DWG_ROOTS
const ROOTS = String(process.env.MAP_DWG_ROOTS || 'D:\\(فنّی),E:\\(Work)')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isDwg = (f) => f.toLowerCase().endsWith('.dwg') && !/_recover\.dwg$/i.test(f);

// ✅ GET: فهرست پوشه‌ها و فایل‌های DWG یک مسیر (بدون مسیر → اولین ریشهٔ موجود)
export async function GET(request) {
  try {
    const req = new URL(request.url).searchParams.get('path') || '';
    let dir = String(req).trim();
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      dir = ROOTS.find((r) => fs.existsSync(r)) || ROOTS[0] || 'D:\\';
      if (!fs.existsSync(dir)) {
        return NextResponse.json({ success: false, error: 'هیچ ریشهٔ موجودی یافت نشد: ' + dir }, { status: 404 });
      }
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, full: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const files = entries
      .filter((e) => e.isFile() && isDwg(e.name))
      .map((e) => {
        const full = path.join(dir, e.name);
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        return { name: e.name, full, size };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return NextResponse.json({ success: true, path: dir, roots: ROOTS, dirs, files });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ✅ POST: دیالوگ ویندوز فقط نام+حجم می‌دهد؛ سرور مسیر واقعی را از ریشه‌ها می‌یابد
export async function POST(request) {
  try {
    const { name, size } = await request.json();
    const target = String(name || '').toLowerCase();
    if (!target) return NextResponse.json({ success: false, error: 'نام فایل ارسال نشد.' });
    let found = null;
    const walk = (dir, depth) => {
      if (found || depth > 6) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const en of entries) {
        if (found) return;
        const full = path.join(dir, en.name);
        if (en.isFile() && en.name.toLowerCase() === target) {
          if (size == null || Number(size) === 0) { found = full; return; }
          try {
            if (fs.statSync(full).size === Number(size)) { found = full; return; }
          } catch {}
          if (!found) found = full; // تطبیق نام به‌عنوان fallback
        } else if (en.isDirectory()) {
          walk(full, depth + 1);
        }
      }
    };
    for (const r of ROOTS) walk(r, 0);
    if (!found) {
      return NextResponse.json({ success: false, error: 'فایل انتخاب‌شده در ریشه‌های نقشه پیدا نشد: ' + name });
    }
    return NextResponse.json({ success: true, full: found });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}