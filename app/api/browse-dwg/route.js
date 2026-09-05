import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.MAP_ROOT || 'F:\\';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let p = searchParams.get('path') || ROOT;
  try {
    p = path.resolve(p);
    const root = path.resolve(ROOT);
    if (!p.startsWith(root)) p = root;
    const entries = fs.readdirSync(p, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort();
    const files = entries.filter((e) => e.isFile() && /\.dwg$/i.test(e.name)).map((e) => e.name).sort();
    return NextResponse.json({ success: true, current: p, parent: path.dirname(p), dirs, files, root });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}