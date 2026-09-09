// restore/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function POST(request) {
  try {
    const { file } = await request.json();
    const f = String(file).replace(/'/g, "''");
    try { await query(`ALTER DATABASE WorkDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE`); } catch {}
    await query(`RESTORE DATABASE WorkDB FROM DISK = '${f}' WITH REPLACE`);
    try { await query(`ALTER DATABASE WorkDB SET MULTI_USER`); } catch {}
    return NextResponse.json({ success: true });
  } catch (e) {
    try { await query(`ALTER DATABASE WorkDB SET MULTI_USER`); } catch {}
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}