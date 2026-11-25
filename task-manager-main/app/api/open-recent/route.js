// app/api/open-recent/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

const PRUNE = new Set([
  "$Recycle.Bin",
  "System Volume Information",
  "Windows",
  "Program Files",
  "Program Files (x86)",
  "ProgramData",
  "node_modules",
  ".git",
  "AppData",
  "Recovery",
  "PerfLogs",
]);

// ✅ فهرست درایوهای موجود ویندوز
function drives() {
  const list = [];
  for (let i = 65; i <= 90; i++) {
    const L = String.fromCharCode(i);
    const root = `${L}:\\`;
    try {
      if (fs.existsSync(root)) list.push(root);
    } catch {}
  }
  return list;
}

function findRecentFile(name, maxAgeMs) {
  // ۱) اول مسیرهای رایج (سریع)
  const common = [
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Documents"),
    "D:\\Task(01)\\Reports",
  ];
  for (const r of common) {
    try {
      const full = path.join(r, name);
      if (fs.existsSync(full) && Date.now() - fs.statSync(full).mtimeMs <= maxAgeMs) return full;
    } catch {}
  }

  // ۲) جست‌وجوی BFS در همهٔ درایوها (با هرس پوشه‌های سیستمی و سقف عمق/تعداد)
  const queue = drives().map((d) => ({ dir: d, depth: 0 }));
  let visited = 0;
  while (queue.length && visited < 30000) {
    const { dir, depth } = queue.shift();
    if (depth > 6) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    visited++;
    for (const en of entries) {
      const full = path.join(dir, en.name);
      if (en.isFile()) {
        if (en.name === name) {
          try {
            if (Date.now() - fs.statSync(full).mtimeMs <= maxAgeMs) return full;
          } catch {}
        }
      } else if (en.isDirectory() && !PRUNE.has(en.name)) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const { fileName, openFolder } = await request.json();
    if (!fileName)
      return NextResponse.json({ success: false, error: "نام فایل ارسال نشد." }, { status: 400 });

    const found = findRecentFile(fileName, 10 * 60 * 1000); // فایل‌های ۱۰ دقیقهٔ اخیر
    if (!found) return NextResponse.json({ success: false, notfound: true });

    if (openFolder) {
      const child = spawn("explorer", ["/select,", found], { detached: true, stdio: "ignore" });
      child.unref();
    } else {
      const child = spawn("cmd", ["/c", "start", "", found], { detached: true, stdio: "ignore" });
      child.unref();
    }
    return NextResponse.json({ success: true, path: found });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}