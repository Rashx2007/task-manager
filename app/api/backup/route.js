// app/api/backup/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { query } from "@/lib/db";

const ROOT = process.env.DB_BACKUP_ROOT || "F:\\(Task)\\Projects\\DBBackups";
const DB = process.env.DB_NAME || "WorkDB";

const esc = (p) => String(p).replace(/'/g, "''");
const errMsg = (e) => {
  if (!e) return "خطای نامشخص";
  if (Array.isArray(e))
    return e.map((x) => (x && (x.message || x.description)) || String(x)).join(" | ");
  if (typeof e === "string") return e;
  return e.message || e.description || JSON.stringify(e);
};

function findFile(dir, name, size, depth = 0) {
  if (depth > 3) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const en of entries) {
    const full = path.join(dir, en.name);
    if (en.isFile() && en.name === name) {
      if (size == null || Number(size) === 0) return full;
      try { if (fs.statSync(full).size === Number(size)) return full; } catch {}
    }
  }
  for (const en of entries) {
    if (!en.isDirectory()) continue;
    const r = findFile(path.join(dir, en.name), name, size, depth + 1);
    if (r) return r;
  }
  return null;
}
function findDir(dir, name, depth = 0) {
  if (depth > 3) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const en of entries) {
    if (!en.isDirectory()) continue;
    if (en.name === name) return path.join(dir, en.name);
    const r = findDir(path.join(dir, en.name), name, depth + 1);
    if (r) return r;
  }
  return null;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  try {
    const resolve = sp.get("resolve");
    if (resolve) {
      const full = findFile(ROOT, resolve, sp.get("size"));
      return full
        ? NextResponse.json({ success: true, full })
        : NextResponse.json({ success: false, error: "فایل زیر ریشهٔ پشتیبان‌ها پیدا نشد." }, { status: 404 });
    }
    const resolveDir = sp.get("resolveDir");
    if (resolveDir) {
      const full = findDir(ROOT, resolveDir);
      return full
        ? NextResponse.json({ success: true, full })
        : NextResponse.json({ success: false, error: "پوشه زیر ریشهٔ پشتیبان‌ها پیدا نشد." }, { status: 404 });
    }
    const root = sp.get("root") || ROOT;
    if (!fs.existsSync(root)) return NextResponse.json({ success: true, files: [], root });
    const files = fs
      .readdirSync(root)
      .filter((f) => f.toLowerCase().endsWith(".bak"))
      .map((f) => {
        let size = 0, mtime = "";
        try { const st = fs.statSync(path.join(root, f)); size = st.size; mtime = st.mtimeMs; } catch {}
        return { name: f, size, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return NextResponse.json({ success: true, files, root });
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { folder } = await request.json();
    const dir = folder && fs.existsSync(folder) ? folder : ROOT;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const name = `${DB}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.bak`;
    const full = path.join(dir, name);
    await query(`BACKUP DATABASE [${DB}] TO DISK = '${esc(full)}' WITH INIT, STATS = 10;`);
    return NextResponse.json({ success: true, file: name, full });
  } catch (e) {
    return NextResponse.json({ success: false, error: errMsg(e) }, { status: 500 });
  }
}