import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DEFAULT_ROOTS = String(process.env.MAP_DWG_ROOTS || 'D:\\(فن‌کویل),E:\\(Work)')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET(request) {
  try {
    const req = new URL(request.url).searchParams.get('path');
    let dir = req && req.trim() ? req.trim() : DEFAULT_ROOTS[0] || 'D:\\';
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      // fallback: اولین ریشهٔ موجود
      dir = DEFAULT_ROOTS.find((r) => fs.existsSync(r)) || dir;
      if (!fs.existsSync(dir)) return NextResponse.json({ success: false, error: 'مسیر یافت نشد: ' + dir }, { status: 404 });
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, full: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dwg') && !/_recover\.dwg$/i.test(e.name))
      .map((e) => ({ name: e.name, full: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return NextResponse.json({
      success: true,
      path: dir,
      roots: DEFAULT_ROOTS,
      dirs,
      files,
      entries: [
        ...dirs.map((d) => ({ ...d, isDir: true })),
        ...files.map((f) => ({ ...f, isDir: false })),
      ],
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}