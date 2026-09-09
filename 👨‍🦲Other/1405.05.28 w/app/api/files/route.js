import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dir = (searchParams.get('path') || '').trim();
  try {
    // حالت ریشه: فهرست درایوها
    if (!dir) {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const root = letter + ':\\';
        try { if (fs.existsSync(root) && fs.statSync(root).isDirectory()) drives.push({ name: letter + ':', path: root }); } catch {}
      }
      return NextResponse.json({ success: true, current: '', parent: '', folders: drives, files: [] });
    }
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return NextResponse.json({ success: false, error: 'مسیر معتبر نیست.' }, { status: 400 });
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith('$'))
      .map((e) => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const files = entries.filter((e) => e.isFile())
      .map((e) => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const parentDir = path.dirname(resolved);
    const parent = parentDir === resolved ? '' : parentDir;
    return NextResponse.json({ success: true, current: resolved, parent, folders, files });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}