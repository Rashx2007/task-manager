import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { nowWall, formatSqlDateTime, timeStr } from '@/lib/schedule-logic';

export async function GET(request) {
  try {
    const rows = await query(`SELECT * FROM Tsk_tbl ORDER BY DueDateTime`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) { 
    return NextResponse.json({ success: false, error: e.message }, { status: 500 }); 
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const now = nowWall();
    
    const r = await query(
      `INSERT INTO Tsk_tbl (TaskTtl, Descriptions, Priorities, tskType, IsConsiderableAction, Complited, fixedDueTime, Durationtime, Due_Date, Due_Time, End_Date, End_Time) 
       OUTPUT INSERTED.TaskID 
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.TaskTtl, 
        b.Descriptions || null, 
        b.Priorities || '3.متوسط', 
        b.tskType || null, 
        b.IsConsiderableAction || null, 
        Number(b.Complited) || 0, 
        Number(b.FixedDueTime) || 0,
        '0:30:0',
        formatSqlDateTime(now),
        timeStr(now),
        formatSqlDateTime(now),
        timeStr(now)
      ]
    );
    
    return NextResponse.json({ success: true, TaskID: r[0].TaskID });
  } catch (e) { 
    return NextResponse.json({ success: false, error: e.message }, { status: 500 }); 
  }
}