// open-path/route.js
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
export async function POST(request) {
  try {
    const { path: p } = await request.json();
    if (!p) return NextResponse.json({ success: false, error: 'مسیر نیست' }, { status: 400 });
    const isDir = fs.existsSync(p) && fs.statSync(p).isDirectory();
    const cmd = isDir ? `explorer "${p}"` : `start "" "${p}"`;
    await new Promise((res, rej) => exec(cmd, (err) => (err ? rej(err) : res())));
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}