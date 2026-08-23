import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SKIP = new Set(['$Recycle.Bin', 'System Volume Information', 'Recovery', 'Config.Msi', 'Windows']);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dir = (searchParams.get('path') || '').trim();

  try {
    // ---------- حالت ریشه: فهرست درایوهای A: تا Z: ----------
    if (!dir) {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const root = letter + ':\\';
        try {
          if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
            drives.push({ name: letter + ':', path: root });
          }
        } catch {}
      }
      return NextResponse.json({ success: true, current: '', parent: '', folders: drives });
    }

    // ---------- حالت پوشه: فهرست زیرپوشه‌ها ----------
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return NextResponse.json({ success: false, error: 'مسیر معتبر نیست.' }, { status: 400 });
    }

    const folders = fs.readdirSync(resolved, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));

    const parentDir = path.dirname(resolved);
    const parent = parentDir === resolved ? '' : parentDir; // در ریشهٔ درایو، بازگشت به لیست درایوها

    return NextResponse.json({ success: true, current: resolved, parent, folders });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}