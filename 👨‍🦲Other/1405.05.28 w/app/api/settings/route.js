import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// معادل LoadSetting در C#
export async function GET() {
  try {
    const rows = await query(
      `SELECT SetID, StartWorkTime, restTimeStart, restTimeEnd, EndWorkTime, IgnoreTimeSettings
       FROM Set_tbl WHERE SetID = 1001`
    );
    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'تنظیمات یافت نشد.' }, { status: 404 });
    }
    const r = rows[0];
    const toHM = (v) => {
      if (v == null) return '';
      if (v instanceof Date) {
        const p = (n) => String(n).padStart(2, '0');
        return `${p(v.getHours())}:${p(v.getMinutes())}`;
      }
      return String(v).substring(0, 5); // "08:00:00.0000000" -> "08:00"
    };
    return NextResponse.json({
      success: true,
      data: {
        startWork: toHM(r.StartWorkTime),
        restStart: toHM(r.restTimeStart),
        restEnd: toHM(r.restTimeEnd),
        endWork: toHM(r.EndWorkTime),
        ignore: r.IgnoreTimeSettings === true || r.IgnoreTimeSettings === 1,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// معادل UpdateDateSet در C#
export async function POST(request) {
  try {
    const { startWork, restStart, restEnd, endWork, ignore } = await request.json();
    const toHMS = (hm) => (hm && hm.length === 5 ? hm + ':00' : hm);
    await query(
      `UPDATE Set_tbl SET StartWorkTime = ?, restTimeStart = ?, restTimeEnd = ?, EndWorkTime = ?, IgnoreTimeSettings = ?
       WHERE SetID = 1001`,
      [toHMS(startWork), toHMS(restStart), toHMS(restEnd), toHMS(endWork), ignore ? 1 : 0]
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}