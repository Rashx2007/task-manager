import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const pad = (n) => String(n).padStart(2, '0');
function fmtDT(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
// قالب مدت مثل C#: Days.Hours:Minutes:Seconds
function durationStr(due, end) {
  const totalSec = Math.max(0, Math.floor((end - due) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}.${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const rows = await query(
      `SELECT FollowID, TaskID, Description, DueDateTime, EndDateTime, Duration, Priorities, LastPriority
       FROM Follow_tbl WHERE TaskID = ? ORDER BY DueDateTime DESC`, [taskId]);
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { taskId, description, dueDateTime, endDateTime, updateDescription } = await request.json();
    const tid = Number(taskId);
    const due = new Date(dueDateTime);
    const end = new Date(endDateTime);
    const dur = durationStr(due, end);

    // الویت از خود کار (مثل PriorityComboText در C#)
    const tsk = await query(`SELECT Priorities FROM Tsk_tbl WHERE TaskID = ?`, [tid]);
    const prio = tsk.length ? (tsk[0].Priorities || '') : '';

    await query(
      `INSERT INTO Follow_tbl (TaskID, DueDateTime, EndDateTime, Description, Duration, Priorities, LastPriority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tid, fmtDT(due), fmtDT(end), description, dur, prio, prio]);

    // معادل Update_Finish_TimeDate
    await query(`UPDATE TimeDate_tbl SET Finish_DateTime = ? WHERE TaskID = ?`, [fmtDT(end), tid]);

    // معادل CopyToDescript_btn_Click
    if (updateDescription) {
      await query(`UPDATE Tsk_tbl SET Descriptions = ? WHERE TaskID = ?`, [description, tid]);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { followId, description, dueDateTime, endDateTime } = await request.json();
    const due = new Date(dueDateTime);
    const end = new Date(endDateTime);
    const dur = durationStr(due, end);
    await query(
      `UPDATE Follow_tbl SET Description = ?, DueDateTime = ?, EndDateTime = ?, Duration = ? WHERE FollowID = ?`,
      [description, fmtDT(due), fmtDT(end), dur, Number(followId)]);
    const row = await query(`SELECT TaskID FROM Follow_tbl WHERE FollowID = ?`, [Number(followId)]);
    if (row.length) {
      await query(`UPDATE TimeDate_tbl SET Finish_DateTime = ? WHERE TaskID = ?`, [fmtDT(end), row[0].TaskID]);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  try {
    await query(`DELETE FROM Follow_tbl WHERE FollowID = ?`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}