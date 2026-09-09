import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  correctDueDateTime, initializeDueDateTime, upsertTimeDate, syncTskTable,
  sortNonFixedTasks, durationToStr,
} from '@/lib/scheduler-logic';
import { loadWorkHoursFromSettings } from '@/lib/schedule-logic';

export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const rows = await query(`SELECT TD.*, tsk.Complited FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON tsk.TaskID=TD.TaskID WHERE TD.TaskID=?`, [taskId]);
    const fixed = await query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime, TD.DueDateTime, TD.EndDateTime, tsk.Complited
      FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON tsk.TaskID=TD.TaskID
      WHERE tsk.Complited=0 AND TD.Priorities=N'زمان انجام ثابت' ORDER BY TD.DueDateTime`);
    return NextResponse.json({ success: true, data: rows[0] || null, fixed });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const { taskId, priority, hours = 0, minutes = 0, startLocal } = await request.json();
    const tid = Number(taskId);
    const durMs = (Number(hours) * 3600 + Number(minutes) * 60) * 1000;
    const wh = await loadWorkHoursFromSettings();
    const isFixed = priority === 'زمان انجام ثابت';

    let due;
    if (isFixed) {
      // ✅ زمان ثابت: دقیقاً همان تاریخ/ساعت انتخابی کاربر، بدون اصلاح و بدون تبدیل منطقه زمانی
      due = new Date(String(startLocal).replace(' ', 'T'));
      if (isNaN(due.getTime())) due = new Date();
    } else {
      due = correctDueDateTime(await initializeDueDateTime(tid, priority), wh);
    }
    const end = new Date(due.getTime() + durMs);
    const durStr = durationToStr(durMs);

    await upsertTimeDate(tid, new Date(), new Date(), priority, isFixed ? 1 : 0, durStr, due, end);
    await syncTskTable(tid, priority, isFixed ? 1 : 0, durStr, due, end);
    await sortNonFixedTasks(tid, end); // جابه‌جایی کارهای غیرثابتِ بعد از آن
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}