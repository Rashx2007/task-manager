 
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { wallToDate, dbToWall } from '@/lib/schedule-logic';
import {
  findFixedOverlaps,
  computeNonFixedSchedule,
  upsertTimeDate,
  syncTskTable,
  sortNonFixedTasks,
  durationToStr,
} from '@/lib/scheduler-logic';

export async function POST(request) {
  try {
    const { taskId, priority, hours = 0, minutes = 0, startLocal, endLocal } = await request.json();
    const tid = Number(taskId);
    const isFixed = priority === 'زمان انجام ثابت';
    let due, end, durMs;

    if (isFixed) {
      due = wallToDate(startLocal);
      end = wallToDate(endLocal);
      if (isNaN(due.getTime()) || isNaN(end.getTime()) || end <= due)
        return NextResponse.json({ success: false, error: 'زمان برنامه‌ای پایان باید بعد از زمان برنامه‌ای آغاز باشد.' }, { status: 400 });
      durMs = end - due;
      const conf = await findFixedOverlaps(tid, due, end);
      if (conf.length)
        return NextResponse.json({ success: false, overlap: true, conflicts: conf.map((c) => c.TaskID) });
    } else {
      durMs = (Number(hours) * 3600 + Number(minutes) * 60) * 1000;
      if (!(durMs > 0))
        return NextResponse.json({ success: false, error: 'برآورد زمانی صحیح وارد کنید.' }, { status: 400 });
      const sch = await computeNonFixedSchedule(tid, priority, durMs);
      due = sch.due;
      end = sch.end;
    }

    await upsertTimeDate(tid, priority, isFixed ? 1 : 0, durationToStr(durMs), due, end);
    await syncTskTable(tid, priority, isFixed ? 1 : 0, durationToStr(durMs), due, end);
    await sortNonFixedTasks(tid, due, end);
    try { await query(`UPDATE Tsk_tbl SET Temporary = 0 WHERE TaskID=?`, [tid]); } catch {}

    return NextResponse.json({ success: true, due: dbToWall(due), end: dbToWall(end) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}