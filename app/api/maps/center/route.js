import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { mapId, x, y } = await request.json();
    await query(`UPDATE Map_tbl SET CenterX=?, CenterY=? WHERE MapID=?`, [x, y, Number(mapId)]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}