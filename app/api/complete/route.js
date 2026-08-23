import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { formatSqlDateTime } from '@/lib/schedule-logic';
export async function POST(request) {
  try {
    const { taskId } = await request.json();
    const n = new Date();
const now = formatSqlDateTime(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds())));
    await query(`UPDATE Tsk_tbl SET Complited=1, Finish_DateTime=? WHERE TaskID=?`, [now, Number(taskId)]);
    await query(`UPDATE TimeDate_tbl SET EndDateTime=?, Finish_DateTime=? WHERE TaskID=?`, [now, now, Number(taskId)]);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}