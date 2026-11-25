import { NextResponse } from 'next/server';
import { runTransaction } from '@/lib/db';
import { normalizeDigits } from '@/lib/assetRules';
import { formatSqlDateTime, nowWall } from '@/lib/schedule-logic';

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'بدنهٔ درخواست معتبر نیست.' }, { status: 400 }); }
  const raw = body?.taskId;
  const text = typeof raw === 'string' || typeof raw === 'number' ? normalizeDigits(raw).trim() : '';
  const taskId = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(taskId) || taskId < 1 || taskId > 2147483647) {
    return NextResponse.json({ success: false, error: 'کد کار معتبر نیست.' }, { status: 400 });
  }
  try {
    const result = await runTransaction(async (tx) => {
      const rows = await tx(`SELECT TaskID, Complited FROM Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID = ?`, [taskId]);
      if (!rows.length) {
        const error = new Error('کار موردنظر پیدا نشد.'); error.code = 'TASK_NOT_FOUND'; throw error;
      }
      if (Number(rows[0].Complited) === 1) return { alreadyCompleted: true };
      const now = formatSqlDateTime(nowWall());
      // Finish_DateTime belongs to TimeDate_tbl, NOT Tsk_tbl.
      await tx(`UPDATE Tsk_tbl SET Complited = 1 WHERE TaskID = ?`, [taskId]);
      // Preserve the previous completion behavior for existing time rows only.
      await tx(`UPDATE TimeDate_tbl SET EndDateTime = ?, Finish_DateTime = ? WHERE TaskID = ?`, [now, now, taskId]);
      return { alreadyCompleted: false };
    });
    return NextResponse.json({ success: true, taskId, ...result });
  } catch (error) {
    if (error.code === 'TASK_NOT_FOUND') return NextResponse.json({ success: false, error: 'کار موردنظر پیدا نشد.' }, { status: 404 });
    return NextResponse.json({ success: false, error: 'ثبت اتمام کار ناموفق بود؛ وضعیت کار را تازه‌سازی و دوباره بررسی کنید.' }, { status: 500 });
  }
}
