import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  computeNonFixedSchedule,
  upsertTimeDate,
  syncTskTable,
  sortNonFixedTasks,
  parseDuration,
  durationToStr,
} from '@/lib/scheduler-logic';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const rows = await query(`SELECT tsk.*, COALESCE(atk.AssetID, tsk.AssetID) AS ResolvedAssetID,
      TD.DueDateTime AS TDDue, TD.EndDateTime AS TDEnd, TD.Priorities AS TDP, TD.FixedDueTime AS TDF
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      WHERE tsk.TaskID = ?`, [Number(id)]);
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const b = await request.json();
    const tid = Number(id);

    // ۱) معادل EditTask دسکتاپ: به‌روزرسانی فیلدهای متنی
    await query(`UPDATE Tsk_tbl SET TaskTtl=?, Descriptions=?, Priorities=?, tskType=?, IsConsiderableAction=?, Complited=?, fixedDueTime=? WHERE TaskID=?`,
      [b.TaskTtl, b.Descriptions || null, b.Priorities || '3.متوسط', b.tskType || null, b.IsConsiderableAction || null, Number(b.Complited) || 0, Number(b.FixedDueTime) || 0, tid]);

    if (b.AssetID) {
      const ex = await query(`SELECT AssetTaskID FROM Asset_Task_tbl WHERE TaskID=?`, [tid]);
      if (ex.length) await query(`UPDATE Asset_Task_tbl SET AssetID=? WHERE TaskID=?`, [b.AssetID, tid]);
      else await query(`INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?,?)`, [tid, b.AssetID]);
    }

    // ۲) ✅ معادل Frm_TimeDateِ بعد از EditTask در دسکتاپ: تعیین مجدد محل کار در لیست
    const complited = Number(b.Complited) || 0;
    if (complited < 1) {
      const td = await query(`SELECT Priorities, FixedDueTime, Durationtime FROM TimeDate_tbl WHERE TaskID=?`, [tid]);
      const priority = (td.length && td[0].Priorities) || b.Priorities || '3.متوسط';
      const isFixed = td.length ? Number(td[0].FixedDueTime) === 1 : false;

      // فقط کارهای غیرثابتِ دارای الویت واقعی؛ (ثابت‌ها جای‌شان با زمان ثابت خودشان است؛ نامشخص‌ها تا تعیین الویت در لایهٔ ۱ می‌مانند)
      if (td.length && !isFixed && priority !== 'نامشخص') {
        const durMs = parseDuration(td[0].Durationtime) || 30 * 60000;

        // معادل Initializing_DueDateTime + Determining_other_Values: نقطهٔ درج بر اساس الویت
        const sch = await computeNonFixedSchedule(tid, priority, durMs);

        // معادل Saving_this_nonFix_Task
        await upsertTimeDate(tid, priority, 0, durationToStr(durMs), sch.due, sch.end);
        await syncTskTable(tid, priority, 0, durationToStr(durMs), sch.due, sch.end);

        // معادل Sort_nonFixed_Time_Tasks: هل‌دادن بقیهٔ کارها تا نوبت‌ها درست شود
        await sortNonFixedTasks(tid, sch.due, sch.end);

        // معادل Taking_this_Task_out_from_Temporary_mode
        try { await query(`UPDATE Tsk_tbl SET Temporary = 0 WHERE TaskID=?`, [tid]); } catch {}
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await query(`DELETE FROM TimeDate_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Asset_Task_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM ApplicantFunctor_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Follow_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Folder_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Tsk_tbl WHERE TaskID=?`, [Number(id)]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}