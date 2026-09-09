import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const IMG = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];

export async function GET(request) {
  const dir = new URL(request.url).searchParams.get('path');
  try {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return NextResponse.json({ preview: null });
    const files = fs.readdirSync(dir).filter((f) => IMG.includes(path.extname(f).toLowerCase()));
    return NextResponse.json({ preview: files.length ? path.join(dir, files[0]) : null });
  } catch {
    return NextResponse.json({ preview: null });
  }
}