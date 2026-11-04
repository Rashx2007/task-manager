import { NextResponse } from 'next/server';
import { query, runTransaction } from '@/lib/db';
import { lockTaskSchedule, TaskGroupError } from '@/lib/task-groups';
const toHM = (v) => { if (!v) return ''; if (v instanceof Date) { const p = (n) => String(n).padStart(2, '0'); return `${p(v.getHours())}:${p(v.getMinutes())}`; } return String(v).substring(0, 5); };
export async function GET() {
  const rows = await query(`SELECT * FROM Set_tbl WHERE SetID=1001`);
  if (!rows.length) return NextResponse.json({ success: false }, { status: 404 });
  const r = rows[0];
  return NextResponse.json({ success: true, data: { startWork: toHM(r.StartWorkTime), restStart: toHM(r.restTimeStart), restEnd: toHM(r.restTimeEnd), endWork: toHM(r.EndWorkTime), ignore: r.IgnoreTimeSettings === true || r.IgnoreTimeSettings === 1 } });
}
export async function POST(request) {
  const { startWork, restStart, restEnd, endWork, ignore } = await request.json();
  const hms = (v) => (v && v.length === 5 ? v + ':00' : v);
  try {
    await runTransaction(async (tx) => {
      // Serialize settings changes with scheduling and group operations using
      // the same transaction-owned lock. External writers must be controlled separately.
      await lockTaskSchedule(tx);
      await tx(`UPDATE Set_tbl SET StartWorkTime=?, restTimeStart=?, restTimeEnd=?, EndWorkTime=?, IgnoreTimeSettings=? WHERE SetID=1001`, [hms(startWork), hms(restStart), hms(restEnd), hms(endWork), ignore ? 1 : 0]);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TaskGroupError && error.code === 'GROUP_BUSY') {
      return NextResponse.json({ success: false, code: 'GROUP_BUSY', error: 'زمان‌بندی در حال تغییر است؛ لطفاً دوباره تلاش کنید.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'ذخیرهٔ تنظیمات انجام نشد؛ دوباره تلاش کنید.' }, { status: 500 });
  }
}