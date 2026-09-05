import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const IMGS = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];

function firstImage(dir) {
  try {
    const es = fs.readdirSync(dir, { withFileTypes: true });
    const f = es.find((e) => e.isFile() && IMGS.includes(path.extname(e.name).toLowerCase()));
    return f ? path.join(dir, f.name) : null;
  } catch { return null; }
}
function previewForFile(dir, name) {
  const base = name.replace(/\.[^.]+$/, '');
  for (const ext of IMGS) {
    const p = path.join(dir, base + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const p = searchParams.get('path') || '';
  try {
    if (!p) {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i) + ':\\';
        try { if (fs.existsSync(letter)) drives.push(letter); } catch {}
      }
      return NextResponse.json({ success: true, drives });
    }
    const cur = path.resolve(p);
    if (!fs.existsSync(cur) || !fs.statSync(cur).isDirectory()) {
      return NextResponse.json({ success: false, error: 'مسیر معتبر نیست: ' + p }, { status: 404 });
    }
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => ({ name: e.name, preview: firstImage(path.join(cur, e.name)) })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const files = entries.filter((e) => e.isFile() && /\.dwg$/i.test(e.name)).map((e) => ({ name: e.name, preview: previewForFile(cur, e.name) })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    const parent = path.dirname(cur);
    return NextResponse.json({ success: true, current: cur, parent, dirs, files, isRoot: parent === cur });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}