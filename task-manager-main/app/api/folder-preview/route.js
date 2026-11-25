// folder-preview/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
const IMG = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
export async function GET(request) {
  const dir = new URL(request.url).searchParams.get('path');
  try {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return NextResponse.json({ preview: null });
    const f = fs.readdirSync(dir).find((x) => IMG.includes(path.extname(x).toLowerCase()));
    return NextResponse.json({ preview: f ? path.join(dir, f) : null });
  } catch { return NextResponse.json({ preview: null }); }
}