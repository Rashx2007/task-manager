// files/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
export async function GET(request) {
  const dir = (new URL(request.url).searchParams.get('path') || '').trim();
  try {
    if (!dir) {
      const drives = [];
      for (let i = 65; i <= 90; i++) { const L = String.fromCharCode(i) + ':\\'; try { if (fs.existsSync(L)) drives.push({ name: String.fromCharCode(i) + ':', path: L }); } catch {} }
      return NextResponse.json({ success: true, current: '', parent: '', folders: drives, files: [] });
    }
    const res = path.resolve(dir);
    if (!fs.existsSync(res) || !fs.statSync(res).isDirectory()) return NextResponse.json({ success: false, error: 'مسیر معتبر نیست' }, { status: 400 });
    const en = fs.readdirSync(res, { withFileTypes: true });
    const folders = en.filter((x) => x.isDirectory() && !x.name.startsWith('$')).map((x) => ({ name: x.name, path: path.join(res, x.name) })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const files = en.filter((x) => x.isFile()).map((x) => ({ name: x.name, path: path.join(res, x.name) })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const parentDir = path.dirname(res);
    return NextResponse.json({ success: true, current: res, parent: parentDir === res ? '' : parentDir, folders, files });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}