import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { formatSqlDateTime } from '@/lib/schedule-logic';
const dur = (s, e) => { const ms = Math.max(0, new Date(e) - new Date(s)); const t = Math.round(ms / 1000); const p = (n) => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`; };
export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const rows = await query(`SELECT * FROM Follow_tbl WHERE TaskID=? ORDER BY DueDateTime`, [taskId]);
    return NextResponse.json({ success: true, rows });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
export async function POST(request) {
  try {
    const { taskId, description, dueDateTime, endDateTime, updateDescription } = await request.json();
    await query(`INSERT INTO Follow_tbl (TaskID, Description, DueDateTime, EndDateTime, Duration) VALUES (?,?,?,?,?)`,
      [Number(taskId), description, formatSqlDateTime(new Date(dueDateTime)), formatSqlDateTime(new Date(endDateTime)), dur(dueDateTime, endDateTime)]);
    await query(`UPDATE Tsk_tbl SET Finish_DateTime=? WHERE TaskID=?`, [formatSqlDateTime(new Date(endDateTime)), Number(taskId)]);
    if (updateDescription) await query(`UPDATE Tsk_tbl SET Descriptions = ISNULL(Descriptions,'') + CHAR(13) + ? WHERE TaskID=?`, [description, Number(taskId)]);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
export async function PUT(request) {
  try {
    const { followId, description, dueDateTime, endDateTime } = await request.json();
    await query(`UPDATE Follow_tbl SET Description=?, DueDateTime=?, EndDateTime=?, Duration=? WHERE FollowID=?`,
      [description, formatSqlDateTime(new Date(dueDateTime)), formatSqlDateTime(new Date(endDateTime)), dur(dueDateTime, endDateTime), Number(followId)]);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
export async function DELETE(request) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  try { await query(`DELETE FROM Follow_tbl WHERE FollowID=?`, [id]); return NextResponse.json({ success: true }); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}