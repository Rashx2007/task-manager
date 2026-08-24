import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { dbToWall, wallToDate, formatSqlDateTime, nowWall, timeStr } from '@/lib/schedule-logic';
import { upsertTimeDate, syncTskTable, sortNonFixedTasks, durationToStr, findFixedOverlaps, computeNonFixedSchedule } from '@/lib/scheduler-logic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const taskId = Number(searchParams.get('taskId'));
  try {
    const rows = await query(`SELECT TD.*, tsk.Complited FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON tsk.TaskID=TD.TaskID WHERE TD.TaskID=?`, [taskId]);
    const fixedRows = await query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, TD.EndDateTime FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON tsk.TaskID=TD.TaskID WHERE tsk.Complited=0 AND TD.Priorities=N'زمان انجام ثابت' ORDER BY TD.DueDateTime`);
    const row = rows[0] || null;
    const data = row ? { ...row, DueDateTime: dbToWall(row.DueDateTime), EndDateTime: dbToWall(row.EndDateTime), Submit_Date: dbToWall(row.Submit_Date) } : null;
    const fixed = fixedRows.map((t) => ({ ...t, DueDateTime: dbToWall(t.DueDateTime), EndDateTime: dbToWall(t.EndDateTime) }));
    const out = { success: true, data, fixed };
    if (searchParams.get('preview') === '1') {
      const priority = searchParams.get('priority') || '3.متوسط';
      if (priority !== 'زمان انجام ثابت') {
        const hours = Number(searchParams.get('hours') || 0);
        const minutes = Number(searchParams.get('minutes') || 0);
        const { due, end } = await computeNonFixedSchedule(taskId, priority, (hours * 3600 + minutes * 60) * 1000);
        out.preview = { due: dbToWall(due), end: dbToWall(end) };
      }
    }
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const { taskId, priority, hours = 0, minutes = 0, startLocal, endLocal } = await request.json();
    const tid = Number(taskId);
    const isFixed = priority === 'زمان انجام ثابت';
    let due, end, durMs;
    if (isFixed) {
      due = wallToDate(startLocal); end = wallToDate(endLocal);
      if (isNaN(due.getTime()) || isNaN(end.getTime()) || end <= due)
        return NextResponse.json({ success: false, error: 'زمان پایان باید بعد از آغاز باشد.' }, { status: 400 });
      durMs = end - due;
      const conf = await findFixedOverlaps(tid, due, end);
      if (conf.length) return NextResponse.json({ success: false, overlap: true, conflicts: conf.map((c) => c.TaskID) });
    } else {
      durMs = (Number(hours) * 3600 + Number(minutes) * 60) * 1000;
      const sch = await computeNonFixedSchedule(tid, priority, durMs);
      due = sch.due; end = sch.end;
    }
    await upsertTimeDate(tid, priority, isFixed ? 1 : 0, durationToStr(durMs), due, end);
    await syncTskTable(tid, priority, isFixed ? 1 : 0, durationToStr(durMs), due, end);
    await sortNonFixedTasks(tid, due, end);
    return NextResponse.json({ success: true, due: dbToWall(due), end: dbToWall(end) });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}