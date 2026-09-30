// app/api/browse-dwg/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ROOTS = String(process.env.MAP_DWG_ROOTS || "D:\\(فنّی),E:\\(Work)")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ✅ پوشه‌هایی که آخرین resolveهای موفق در آن‌ها بوده‌اند (میان‌برِ سریع)
const recentDirs = [];
const rememberDir = (d) => {
  const i = recentDirs.indexOf(d);
  if (i >= 0) recentDirs.splice(i, 1);
  recentDirs.unshift(d);
  if (recentDirs.length > 10) recentDirs.pop();
};

const isDwg = (f) => f.toLowerCase().endsWith(".dwg") && !/_recover\.dwg$/i.test(f);

// ✅ GET: فهرست پوشه‌ها و فایل‌های DWG یک مسیر (برای سازگاری عقب‌مانده)
export async function GET(request) {
  try {
    const req = new URL(request.url).searchParams.get("path") || "";
    let dir = String(req).trim();
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      dir = ROOTS.find((r) => fs.existsSync(r)) || ROOTS[0] || "D:\\";
      if (!fs.existsSync(dir))
        return NextResponse.json({ success: false, error: "هیچ ریشهٔ موجودی یافت نشد: " + dir }, { status: 404 });
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, full: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fa"));
    const files = entries
      .filter((e) => e.isFile() && isDwg(e.name))
      .map((e) => {
        const full = path.join(dir, e.name);
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        return { name: e.name, full, size };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fa"));
    return NextResponse.json({ success: true, path: dir, roots: ROOTS, dirs, files });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ✅ POST: resolve مسیر کامل از روی نام+حجم (پشتیبانِ دیالوگ مرورگر)
export async function POST(request) {
  try {
    const { name, size } = await request.json();
    const target = String(name || "").toLowerCase();
    if (!target) return NextResponse.json({ success: false, error: "نام فایل ارسال نشد." });
    let found = null;

    const match = (full) => {
      if (size == null || Number(size) === 0) return true;
      try { return fs.statSync(full).size === Number(size); } catch { return false; }
    };

    // ۱) پوشه‌های resolveهای اخیر (سریع‌ترین و دقیق‌ترین)
    for (const d of recentDirs) {
      const full = path.join(d, name);
      try {
        if (fs.existsSync(full) && match(full)) { found = full; break; }
      } catch {}
    }

    // ۲) ریشه‌های ثابت (عمق محدود)
    if (!found) {
      const walk = (dir, depth) => {
        if (found || depth > 6) return;
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const en of entries) {
          if (found) return;
          const full = path.join(dir, en.name);
          if (en.isFile() && en.name.toLowerCase() === target && match(full)) { found = full; return; }
          if (en.isDirectory()) walk(full, depth + 1);
        }
      };
      for (const r of ROOTS) walk(r, 0);
    }

    // ۳) جست‌وجوی کم‌عمق در همهٔ درایوها (برای فایل‌های خارج از ریشه‌ها)
    if (!found) {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const L = String.fromCharCode(i);
        try { if (fs.existsSync(`${L}:\\`)) drives.push(`${L}:\\`); } catch {}
      }
      const PRUNE = new Set([
        "Windows", "Program Files", "Program Files (x86)", "ProgramData",
        "$Recycle.Bin", "System Volume Information", "node_modules", "AppData",
      ]);
      const queue = drives.map((d) => ({ dir: d, depth: 0 }));
      let visited = 0;
      while (queue.length && !found && visited < 20000) {
        const { dir, depth } = queue.shift();
        if (depth > 5) continue;
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        visited++;
        for (const en of entries) {
          const full = path.join(dir, en.name);
          if (en.isFile()) {
            if (en.name.toLowerCase() === target && match(full)) { found = full; break; }
          } else if (en.isDirectory() && !PRUNE.has(en.name)) {
            queue.push({ dir: full, depth: depth + 1 });
          }
        }
      }
    }

    if (!found) return NextResponse.json({ success: false, error: "فایل انتخاب‌شده در سرور پیدا نشد: " + name });
    rememberDir(path.dirname(found));
    return NextResponse.json({ success: true, full: found });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}