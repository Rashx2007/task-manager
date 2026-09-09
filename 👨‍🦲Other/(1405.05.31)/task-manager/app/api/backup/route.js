// backup/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs'; import path from 'path';
export async function POST(request) {
  try {
    const { folder } = await request.json();
    const dir = String(folder || 'C:\\DBBackups').trim();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const p = (n) => String(n).padStart(2, '0'); const d = new Date();
    const file = path.join(dir, `WorkDB_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.bak`);
    await query(`BACKUP DATABASE WorkDB TO DISK = '${file.replace(/'/g, "''")}' WITH FORMAT, INIT`);
    return NextResponse.json({ success: true, file });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}