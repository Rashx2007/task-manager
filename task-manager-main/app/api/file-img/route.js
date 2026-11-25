import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const p = searchParams.get('path') || '';
  try {
    const cur = path.resolve(p);
    if (!fs.existsSync(cur) || !fs.statSync(cur).isFile()) return new Response('not found', { status: 404 });
    const ext = path.extname(cur).toLowerCase();
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
    const buf = fs.readFileSync(cur);
    return new Response(buf, { headers: { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}