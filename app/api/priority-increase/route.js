// priority-increase/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rescheduleAll } from '@/lib/scheduler-logic';
import { formatSqlDateTime, nowWall } from '@/lib/schedule-logic';
import { nowWall, formatSqlDateTime } from '@/lib/schedule-logic';
export async function POST() {
  try {
    const rows = await query(`SELECT tsk.TaskID, flw.EndDateTime AS FlwEnd, tsk.Submit_Date, tsk.Submit_Time, tsk.Priorities, tsk.FixedDueTime FROM Tsk_tbl tsk LEFT JOIN Follow_tbl flw ON tsk.TaskID=flw.TaskID WHERE tsk.Complited=0 ORDER BY tsk.TaskID, flw.EndDateTime DESC`);
    const map = { '1.خیلی بالا': { d: 1, to: '0.آنی' }, '2.بالا': { d: 2, to: '1.خیلی بالا' }, '3.متوسط': { d: 4, to: '2.بالا' }, '4.کم': { d: 7, to: '3.متوسط' }, '5.خیلی کم': { d: 14, to: '4.کم' } };
    const now = nowWall(); let last = null, changed = 0;
    for (const r of rows) {
      if (r.TaskID === last) continue; last = r.TaskID;
      if (Number(r.FixedDueTime) === 1) continue;
      const rule = map[r.Priorities]; if (!rule) continue;
      let edt = r.FlwEnd ? new Date(r.FlwEnd) : new Date(r.Submit_Date);
      const days = Math.floor((now - edt) / 86400000);
      if (days > rule.d) {
        await query(`UPDATE Tsk_tbl SET Priorities=? WHERE TaskID=?`, [rule.to, r.TaskID]);
        await query(`UPDATE TimeDate_tbl SET Priorities=? WHERE TaskID=?`, [rule.to, r.TaskID]);
        await query(`INSERT INTO Follow_tbl (TaskID, DueDateTime, EndDateTime, Description, Duration, Priorities, LastPriority) VALUES (?,?,?,?,?,?,?)`, [r.TaskID, formatSqlDateTime(now), formatSqlDateTime(new Date(now.getTime() + 60000)), 'افزایش الویت', '00:01:00', rule.to, r.Priorities]);
        changed++;
      }
    }
    if (changed) await rescheduleAll();
    return NextResponse.json({ success: true, changed });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}