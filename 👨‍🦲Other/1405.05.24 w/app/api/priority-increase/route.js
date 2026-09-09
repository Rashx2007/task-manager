import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rescheduleAll } from '@/lib/scheduler-logic';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// معادل اصلاحعبارتToolStripMenuItem_Click + PriorityIncrease در C#
export async function POST() {
  try {
    const rows = await query(`SELECT tsk.TaskID, flw.EndDateTime AS FlwEnd, tsk.Submit_Date, tsk.Submit_Time,
                                     tsk.Priorities, tsk.FixedDueTime
                              FROM Tsk_tbl tsk LEFT JOIN Follow_tbl flw ON tsk.TaskID = flw.TaskID
                              WHERE tsk.Complited = 0
                              ORDER BY tsk.TaskID, flw.EndDateTime DESC`);
    const escalate = {
      '1.خیلی بالا': { days: 1,  to: '0.آنی' },
      '2.بالا':      { days: 2,  to: '1.خیلی بالا' },
      '3.متوسط':     { days: 4,  to: '2.بالا' },
      '4.کم':        { days: 7,  to: '3.متوسط' },
      '5.خیلی کم':   { days: 14, to: '4.کم' },
    };
    const now = new Date();
    let lastTaskId = null;
    let changed = 0;

    for (const r of rows) {
      if (r.TaskID === lastTaskId) continue; // فقط اولین (جدیدترین) ردیف هر کار
      lastTaskId = r.TaskID;
      if (Number(r.FixedDueTime) === 1) continue;
      const pr = r.Priorities;
      if (pr === '0.آنی' || !escalate[pr]) continue;

      // زمان مبنای تأخیر: آخرین پیگیری یا زمان ثبت
      let edt;
      if (r.FlwEnd) edt = new Date(r.FlwEnd);
      else {
        edt = new Date(r.Submit_Date);
        const t = new Date(r.Submit_Time);
        edt.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0);
      }
      const days = Math.floor((now - edt) / 86400000);
      const rule = escalate[pr];
      if (days > rule.days) {
        await query(`UPDATE Tsk_tbl SET Priorities = ? WHERE TaskID = ?`, [rule.to, r.TaskID]);
        await query(`UPDATE TimeDate_tbl SET Priorities = ? WHERE TaskID = ?`, [rule.to, r.TaskID]);
        await query(`INSERT INTO Follow_tbl (TaskID, DueDateTime, EndDateTime, Description, Duration, Priorities, LastPriority)
                      VALUES (?, ?, ?, N'افزایش الویت', '0.00:01:00', ?, ?)`,
          [r.TaskID, fmt(now), fmt(new Date(now.getTime() + 60000)), rule.to, pr]);
        changed++;
      }
    }
    if (changed > 0) await rescheduleAll(); // بازچینش مثل PriorityIncrease
    return NextResponse.json({ success: true, changed });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}