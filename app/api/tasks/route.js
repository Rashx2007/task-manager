import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { nowWall, formatSqlDateTime, timeStr } from '@/lib/schedule-logic';

export async function GET(request) {
  try {
    const rows = await query(`SELECT * FROM Tsk_tbl ORDER BY DueDateTime`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const now = nowWall();
    const r = await query(
      `INSERT INTO Tsk_tbl (TaskTtl, Submit_Date, Submit_Time, Descriptions, Priorities, tskType, IsConsiderableAction, Complited, fixedDueTime, Temporary, Durationtime, Due_Date, Due_Time, End_Date, End_Time)
       OUTPUT INSERTED.TaskID
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.TaskTtl,
        formatSqlDateTime(now),
        timeStr(now),
        b.Descriptions || null,
        b.Priorities || 'نامشخص',
        b.tskType || null,
        b.IsConsiderableAction || null,
        Number(b.Complited) || 0,
        Number(b.FixedDueTime) || 0,
        1,
        '0:30:0',
        formatSqlDateTime(now),
        timeStr(now),
        formatSqlDateTime(now),
        timeStr(now)
      ]
    );
    const taskId = r[0].TaskID;

    // ✅ معادل Insert_to_Asset_Task_tbl دسکتاپ: ثبت دستگاه کار در Asset_Task_tbl
    if (b.AssetID) {
      await query(`INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?,?)`, [Number(taskId), Number(b.AssetID)]);
      try { await query(`UPDATE Tsk_tbl SET AssetID=? WHERE TaskID=?`, [Number(b.AssetID), Number(taskId)]); } catch {}
    }

    return NextResponse.json({ success: true, TaskID: taskId });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}