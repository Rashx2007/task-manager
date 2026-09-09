// serve-file/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
export async function GET(request) {
  const p = new URL(request.url).searchParams.get('path');
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return NextResponse.json({ success: false }, { status: 404 });
  const data = fs.readFileSync(p);
  return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}