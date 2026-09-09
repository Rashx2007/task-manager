import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { taskId } = await request.json();

    await query(`UPDATE Tsk_tbl SET Complited = 1 WHERE TaskID = ?`, [taskId]);
    await query(`UPDATE TimeDate_tbl SET Finish_DateTime = GETDATE() WHERE TaskID = ?`, [taskId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}