import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

function fmtDT(v) {
  const d = new Date(v);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtT(v) {
  const d = new Date(v);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function durationStr(due, end) {
  const secs = Math.max(0, Math.round((new Date(end) - new Date(due)) / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'current';
    let where = 'WHERE 1=1';
    if (status === 'current') where += ' AND tsk.Complited < 1';
    else if (status === 'completed') where += ' AND tsk.Complited = 1';

    const tasks = await query(`
      SELECT DISTINCT
        tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        tsk.TaskTtl, tsk.Descriptions, tsk.Complited,
        TD.Priorities, TD.Submit_Date, TD.DueDateTime, TD.EndDateTime
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID = assettsk.TaskID
      LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      ${where}
      ORDER BY TD.DueDateTime
    `);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: ثبت کار جدید — معادل AddToTask + Insert_to_Asset_Task_tbl در C#
export async function POST(request) {
  try {
    const {
      TaskTtl = '', Descriptions = '', Priorities = '3.متوسط', tskType = '',
      IsConsiderableAction = '', Complited = 0, AssetID = null, ApplicantName = '',
      DueDateTime = null, EndDateTime = null, FixedDueTime = 0,
      RequestNumber = null, RegisterNumber = null, RequestDate = null,
    } = await request.json();

    if (!String(TaskTtl).trim()) {
      return NextResponse.json({ success: false, error: 'موضوع الزامی است' }, { status: 400 });
    }

    const now = new Date();
    const due = DueDateTime ? new Date(DueDateTime) : now;
    const end = EndDateTime ? new Date(EndDateTime) : new Date(due.getTime() + 30 * 60000);
    const dur = durationStr(due, end);
    const fixed = Number(FixedDueTime) === 1 ? 1 : 0;
    const complited = Number(Complited) === 1 ? 1 : 0;

    // ✅ AssetID و IsConsiderableAction مستقیم در Tsk_tbl
    const inserted = await query(
      `INSERT INTO Tsk_tbl
        (TaskTtl, Submit_Date, Submit_Time, fixedDueTime, Due_Date, Due_Time, Descriptions, Priorities,
         End_Date, End_Time, DurationTime, FileName, FilePath, tskType, Complited, DueDateTime, EndDateTime,
         Temporary, AssetID, IsConsiderableAction)
       OUTPUT INSERTED.TaskID
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, 0, ?, ?)`,
      [TaskTtl, fmtDT(now), fmtT(now), fixed, fmtDT(due), fmtT(due), Descriptions, Priorities,
       fmtDT(end), fmtT(end), dur, tskType, complited, fmtDT(due), fmtDT(end), AssetID, IsConsiderableAction]
    );
    const newTaskId = inserted[0].TaskID;

    await query(
      `INSERT INTO TimeDate_tbl
         (TaskID, Submit_Date, Submit_Time, Priorities, FixedDueTime, Durationtime,
          DueDateTime, EndDateTime, Due_Date, Due_Time, End_Date, End_Time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newTaskId, fmtDT(now), fmtT(now), Priorities, fixed, dur,
       fmtDT(due), fmtDT(end), fmtDT(due), fmtT(due), fmtDT(end), fmtT(end)]
    );

    if (AssetID) {
      await query(`INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?, ?)`, [newTaskId, AssetID]);
    }

    let applicantId = null;
    if (String(ApplicantName).trim()) {
      const p = await query(`SELECT PersonID FROM Persons_tbl WHERE PersonName = ?`, [String(ApplicantName).trim()]);
      if (p.length) applicantId = String(p[0].PersonID);
    }
    await query(`INSERT INTO ApplicantFunctor_tbl (TaskID, ApplicantID) VALUES (?, ?)`, [newTaskId, applicantId]);

    if (tskType === 'خرید' && RequestNumber) {
      await query(
        `INSERT INTO Purchase_Request_tbl (TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status)
         VALUES (?, ?, ?, ?, '', N'اولیه')`,
        [newTaskId, RequestNumber, RegisterNumber, RequestDate ? fmtDT(new Date(RequestDate)) : fmtDT(now)]
      );
    }

    return NextResponse.json({ success: true, taskId: newTaskId });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}