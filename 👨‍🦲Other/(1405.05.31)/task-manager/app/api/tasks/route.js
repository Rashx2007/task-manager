import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { formatSqlDateTime } from '@/lib/schedule-logic';
const p2 = (n) => String(n).padStart(2, '0');
const tStr = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
export async function POST(request) {
  try {
    const b = await request.json();
    const now = new Date();
    const due = b.DueDateTime ? new Date(b.DueDateTime) : now;
    const end = b.EndDateTime ? new Date(b.EndDateTime) : due;
    const r = await query(`INSERT INTO Tsk_tbl (TaskTtl, Descriptions, Priorities, tskType, IsConsiderableAction, Complited, fixedDueTime, Submit_Date, Submit_Time)
      OUTPUT INSERTED.TaskID VALUES (?,?,?,?,?,?,?,?,?)`,
      [b.TaskTtl, b.Descriptions || null, b.Priorities || '3.متوسط', b.tskType || null, b.IsConsiderableAction || null, Number(b.Complited) || 0, Number(b.FixedDueTime) || 0, formatSqlDateTime(now), tStr(now)]);
    const taskId = r[0].TaskID;
    if (b.AssetID) await query(`INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?,?)`, [taskId, b.AssetID]);
    await query(`INSERT INTO TimeDate_tbl (TaskID, Submit_Date, Submit_Time, Priorities, FixedDueTime, Durationtime, DueDateTime, EndDateTime) VALUES (?,?,?,?,?,?,?,?)`,
      [taskId, formatSqlDateTime(now), tStr(now), b.Priorities || '3.متوسط', Number(b.FixedDueTime) || 0, '00:00:00', formatSqlDateTime(due), formatSqlDateTime(end)]);
    return NextResponse.json({ success: true, TaskID: taskId });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}