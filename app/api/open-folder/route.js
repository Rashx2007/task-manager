import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const p = searchParams.get('path') || '';
  try {
    const cur = path.resolve(p);
    if (!fs.existsSync(cur)) return NextResponse.json({ success: false, error: 'مسیر یافت نشد.' }, { status: 404 });
    spawn('explorer.exe', [cur], { detached: true, stdio: 'ignore' });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}