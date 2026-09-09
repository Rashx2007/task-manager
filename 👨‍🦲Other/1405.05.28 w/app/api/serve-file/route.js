import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.bmp': 'image/bmp', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.txt': 'text/plain',
};

export async function GET(request) {
  const p = new URL(request.url).searchParams.get('path');
  if (!p) return NextResponse.json({ success: false }, { status: 400 });
  try {
    const file = String(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return NextResponse.json({ success: false }, { status: 404 });
    const ext = path.extname(file).toLowerCase();
    const data = fs.readFileSync(file);
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}