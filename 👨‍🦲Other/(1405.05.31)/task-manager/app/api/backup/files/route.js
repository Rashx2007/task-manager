// backup/files/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
export async function GET(request) {
  const folder = new URL(request.url).searchParams.get('folder') || 'C:\\DBBackups';
  try {
    if (!fs.existsSync(folder)) return NextResponse.json({ success: true, files: [] });
    const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.bak')).sort().reverse();
    return NextResponse.json({ success: true, files });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}