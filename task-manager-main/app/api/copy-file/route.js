// copy-file/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
const norm = (s) => String(s || '').replace(/[^0-9a-zA-Z\u0600-\u06FF]+/g, '');
function find(cands) {
  for (const c of cands) { const s = String(c || '').trim(); if (s && fs.existsSync(s)) return s; }
  for (const c of cands) {
    const s = String(c || '').trim(); if (!s) continue;
    const dir = path.dirname(s);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    const base = norm(path.basename(s)); if (!base) continue;
    const hit = fs.readdirSync(dir).find((f) => norm(f) === base || norm(f).includes(base) || base.includes(norm(f)));
    if (hit) return path.join(dir, hit);
  }
  return null;
}
export async function POST(request) {
  try {
    const body = await request.json();
    const sources = Array.isArray(body.sources) ? body.sources : [body.src];
    const destDir = String(body.destDir || '').trim();
    let found = find(sources);
    if (!found) return NextResponse.json({ success: false, error: 'مبدأ یافت نشد:\n' + sources.filter(Boolean).join('\n') }, { status: 404 });
    if (body.mirrorDir && fs.statSync(found).isFile()) found = path.dirname(found);
    const { root } = path.parse(found);
    const dest = path.join(destDir, root ? found.slice(root.length) : found);
    if (fs.statSync(found).isDirectory()) { fs.mkdirSync(dest, { recursive: true }); fs.cpSync(found, dest, { recursive: true, force: true }); }
    else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(found, dest); }
    return NextResponse.json({ success: true, dest, src: found });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}