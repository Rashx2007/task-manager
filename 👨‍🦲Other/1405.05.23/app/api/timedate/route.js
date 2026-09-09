// app/api/timedate/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  checkTimeDateExists, loadTimeDate, upsertTimeDate, syncTsk, completeTask,
  takeOutOfTemporary, getMaxFinishFromFollow, initializeDueDateTime,
  correctDueDateTime, loadWorkHours, findFixedOverlaps, findAllFixedTasks,
  sortNonFixedTasks, durationToStr, parseDuration,
} from '@/lib/timedate-logic';

function fmtDT(v){ const d = new Date(v); if (isNaN(d)) return null;
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

export async function GET(request) {
  try {
    const taskId = Number(new URL(request.url).searchParams.get('taskId'));
    const exists = await checkTimeDateExists(taskId);
    const timeDate = exists ? (await loadTimeDate(taskId))[0] : null;
    const fixedTasks = await findAllFixedTasks();
    const tsk = await query(`SELECT Submit_Date, Submit_Time FROM Tsk_tbl WHERE TaskID = ?`, [taskId]);
    return NextResponse.json({ success: true, exists, timeDate, fixedTasks, submit: tsk[0] || null });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// معادل OkBtn_Click
export async function POST(request) {
  try {
    const body = await request.json();
    const taskId = Number(body.taskId);
    const priority = body.priority || '';
    const finished = body.finished === true || body.finished === 1;
    const isFixedPriority = priority === 'زمان انجام ثابت';
    const fixed = isFixedPriority ? 1 : 0;
    const hours = Number(body.hours) || 0;
    const minutes = Number(body.minutes) || 0;
    const durMs = (hours * 3600 + minutes * 60) * 1000;
    const durStr = durationToStr(durMs);
    // معادل Cheking_Validation_of_Duration_Time
    const durationValid = (hours >= 0 && minutes > 0) || (hours > 0 && minutes >= 0);

    const tsk = await query(`SELECT Submit_Date, Submit_Time FROM Tsk_tbl WHERE TaskID = ?`, [taskId]);
    if (!tsk.length) return NextResponse.json({ success: false, error: 'کار یافت نشد.' }, { status: 404 });
    const submitDate = new Date(tsk[0].Submit_Date);
    const submitTime = new Date(tsk[0].Submit_Time);

    if (!priority || priority === 'نامشخص') {
      return NextResponse.json({ success: false, error: 'لطفاً الویت را انتخاب کنید!' });
    }
    if (isFixedPriority && body.dueDateTime && body.endDateTime &&
        new Date(body.dueDateTime) >= new Date(body.endDateTime)) {
      return NextResponse.json({ success: false, error: 'زمان برنامه‌ای پایان باید بعد از زمان برنامه‌ای آغاز باشد.' });
    }

    // ---------- حالت کار اتمام‌یافته (معادل Saving_this_Completed_Task) ----------
    if (finished) {
      let due, end;
      const exists = await checkTimeDateExists(taskId);
      if (exists) {
        const td = (await loadTimeDate(taskId))[0];
        due = body.dueDateTime ? new Date(body.dueDateTime) : new Date(td.DueDateTime);
        end = body.endDateTime ? new Date(body.endDateTime) : new Date(td.EndDateTime);
      } else if (durationValid) {
        due = new Date(submitDate);
        due.setHours(submitTime.getHours(), submitTime.getMinutes(), 0, 0);
        end = new Date(due.getTime() + durMs);
      } else {
        return NextResponse.json({ success: false, error: 'برآورد زمانی صحیح وارد کنید.' });
      }
      const finish = await getMaxFinishFromFollow(taskId);
      await upsertTimeDate(taskId, submitDate, submitTime, priority, fixed, durStr, due, end, finish);
      await syncTsk(taskId, priority, fixed, durStr, due, end);
      await completeTask(taskId);
      await takeOutOfTemporary(taskId);
      return NextResponse.json({ success: true });
    }

    // ---------- حالت زمان انجام ثابت (معادل Saving_this_Fixed_Task) ----------
    if (isFixedPriority) {
      if (!body.dueDateTime || !body.endDateTime) {
        return NextResponse.json({ success: false, error: 'زمان برنامه‌ای آغاز و پایان را وارد کنید.' });
      }
      const due = new Date(body.dueDateTime);
      const end = new Date(body.endDateTime);
      const overlaps = await findFixedOverlaps(taskId, due, end);
      if (overlaps.length) {
        const allFixed = await findAllFixedTasks();
        return NextResponse.json({ success: false, conflict: true, overlapping: overlaps, allFixed });
      }
      const fdStr = durationToStr(end - due);
      await upsertTimeDate(taskId, submitDate, submitTime, 'زمان انجام ثابت', 1, fdStr, due, end);
      await syncTsk(taskId, 'زمان انجام ثابت', 1, fdStr, due, end);
      await sortNonFixedTasks(taskId, end);
      await takeOutOfTemporary(taskId);
      return NextResponse.json({ success: true });
    }

    // ---------- حالت الویت‌دار (معادل Initializing + Determining + Saving_nonFix) ----------
    if (!durationValid) {
      return NextResponse.json({ success: false, error: 'برآورد زمانی صحیح وارد کنید.' });
    }
    const wh = await loadWorkHours();
    const ddt = await initializeDueDateTime(taskId, priority);
    const due = correctDueDateTime(ddt, wh);
    const end = new Date(due.getTime() + durMs);
    await upsertTimeDate(taskId, submitDate, submitTime, priority, 0, durStr, due, end);
    await syncTsk(taskId, priority, 0, durStr, due, end);
    await sortNonFixedTasks(taskId, due);
    await takeOutOfTemporary(taskId);
    return NextResponse.json({ success: true, dueDateTime: due.toISOString(), endDateTime: end.toISOString() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}