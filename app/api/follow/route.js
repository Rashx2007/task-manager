import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { wallToDate, formatSqlDateTime } from '@/lib/schedule-logic';
import { durationToStr } from '@/lib/scheduler-logic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const taskId = Number(searchParams.get('taskId'));
  try {
    const rows = await query(`SELECT * FROM Follow_tbl WHERE TaskID=? ORDER BY DueDateTime DESC`, [taskId]);
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { taskId, description, dueDateTime, endDateTime, updateDescription } = await request.json();
    const tid = Number(taskId);
    const due = wallToDate(dueDateTime);
    const end = wallToDate(endDateTime);
    const durMs = Math.max(0, end - due);
    await query(`INSERT INTO Follow_tbl (TaskID, Description, DueDateTime, EndDateTime, Duration) VALUES (?,?,?,?,?)`,
      [tid, description, formatSqlDateTime(due), formatSqlDateTime(end), durationToStr(durMs)]);

    // ✅ جایگزینی شرح کار با متن پیگیری جدید (سابقهٔ کامل در Follow_tbl محفوظ است)
    if (updateDescription) {
      await query(`UPDATE Tsk_tbl SET Descriptions = ? WHERE TaskID=?`, [description, tid]);
    }

    // ✅ به‌روزرسانی زمان پایان کار در TimeDate_tbl (بیشینهٔ پایان پیگیری‌ها)
    try {
      const mx = await query(`SELECT MAX(EndDateTime) AS Finish FROM Follow_tbl WHERE TaskID=?`, [tid]);
      if (mx.length && mx[0].Finish) {
        await query(`UPDATE TimeDate_tbl SET Finish_DateTime=? WHERE TaskID=?`, [mx[0].Finish, tid]);
      }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { followId, description, dueDateTime, endDateTime } = await request.json();
    const due = wallToDate(dueDateTime);
    const end = wallToDate(endDateTime);
    const durMs = Math.max(0, end - due);
    await query(`UPDATE Follow_tbl SET Description=?, DueDateTime=?, EndDateTime=?, Duration=? WHERE FollowID=?`,
      [description, formatSqlDateTime(due), formatSqlDateTime(end), durationToStr(durMs), Number(followId)]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  try {
    await query(`DELETE FROM Follow_tbl WHERE FollowID=?`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}