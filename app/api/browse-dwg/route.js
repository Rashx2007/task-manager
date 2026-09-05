import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const p = searchParams.get('path') || '';
  try {
    // ✅ حالت خالی: فهرست همهٔ درایوهای ویندوز
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
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'fa'));
    const files = entries.filter((e) => e.isFile() && /\.dwg$/i.test(e.name)).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'fa'));
    const parent = path.dirname(cur);
    return NextResponse.json({ success: true, current: cur, parent, dirs, files, isRoot: parent === cur });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}