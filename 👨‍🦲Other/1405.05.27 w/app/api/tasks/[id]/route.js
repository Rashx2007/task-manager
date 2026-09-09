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

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const task = await query(`
      SELECT DISTINCT tsk.TaskID, tsk.TaskTtl, tsk.Descriptions, tsk.Complited,
        tsk.tskType, tsk.fixedDueTime AS FixedDueTime, tsk.IsConsiderableAction,
        tsk.AssetID,
        asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor,
        asset.Entrance, asset.Location, asset.MechSystem, asset.Specifications, asset.PropertyCode,
        TD.Priorities, TD.DueDateTime, TD.EndDateTime,
        pr.PersonName AS ApplicantName,
        pur.RequestNumber, pur.RegisterNumber, pur.RequestDate
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID = assettsk.TaskID
      LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      LEFT JOIN ApplicantFunctor_tbl AF ON AF.TaskID = tsk.TaskID
      LEFT JOIN Persons_tbl pr ON AF.ApplicantID IS NOT NULL AND ISNUMERIC(AF.ApplicantID) = 1
                               AND pr.PersonID = CAST(AF.ApplicantID AS INT)
      LEFT JOIN Purchase_Request_tbl pur ON pur.TaskID = tsk.TaskID
      WHERE tsk.TaskID = ?
    `, [Number(id)]);

    if (!task.length) {
      return NextResponse.json({ success: false, error: 'کار یافت نشد' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: task[0] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: معادل EditTask در C# — ✅ حالا AssetID در خود Tsk_tbl هم تغییر می‌کند
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    const {
      TaskTtl = '', Descriptions = '', Priorities = '3.متوسط', tskType = '',
      IsConsiderableAction = '', Complited = 0, AssetID = null, ApplicantName = '',
      DueDateTime = null, EndDateTime = null, FixedDueTime = 0,
      RequestNumber = null, RegisterNumber = null, RequestDate = null,
    } = await request.json();

    const due = DueDateTime ? new Date(DueDateTime) : new Date();
    const end = EndDateTime ? new Date(EndDateTime) : new Date(due.getTime() + 30 * 60000);
    const dur = durationStr(due, end);
    const fixed = Number(FixedDueTime) === 1 ? 1 : 0;
    const complited = Number(Complited) === 1 ? 1 : 0;

    // ✅✅ رفع نقص گزارش‌شده: AssetID = ? در UPDATE جدول Tsk_tbl
    await query(
      `UPDATE Tsk_tbl SET TaskTtl = ?, Descriptions = ?, Priorities = ?, tskType = ?,
        fixedDueTime = ?, Complited = ?, AssetID = ?, IsConsiderableAction = ?,
        Due_Date = ?, Due_Time = ?, End_Date = ?, End_Time = ?, DurationTime = ?, DueDateTime = ?, EndDateTime = ?
       WHERE TaskID = ?`,
      [TaskTtl, Descriptions, Priorities, tskType, fixed, complited, AssetID, IsConsiderableAction,
       fmtDT(due), fmtT(due), fmtDT(end), fmtT(end), dur, fmtDT(due), fmtDT(end), taskId]
    );

    await query(
      `UPDATE TimeDate_tbl SET Priorities = ?, FixedDueTime = ?, Durationtime = ?,
        DueDateTime = ?, EndDateTime = ?, Due_Date = ?, Due_Time = ?, End_Date = ?, End_Time = ?
       WHERE TaskID = ?`,
      [Priorities, fixed, dur, fmtDT(due), fmtDT(end), fmtDT(due), fmtT(due), fmtDT(end), fmtT(end), taskId]
    );

    // همگام‌سازی Asset_Task_tbl (حذف و درج مجدد)
    await query(`DELETE FROM Asset_Task_tbl WHERE TaskID = ?`, [taskId]);
    if (AssetID) {
      await query(`INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?, ?)`, [taskId, AssetID]);
    }

    // درخواست‌کننده
    let applicantId = null;
    if (String(ApplicantName).trim()) {
      const p = await query(`SELECT PersonID FROM Persons_tbl WHERE PersonName = ?`, [String(ApplicantName).trim()]);
      if (p.length) applicantId = String(p[0].PersonID);
    }
    const af = await query(`SELECT ApplicantFunctorID FROM ApplicantFunctor_tbl WHERE TaskID = ?`, [taskId]);
    if (af.length) {
      await query(`UPDATE ApplicantFunctor_tbl SET ApplicantID = ? WHERE TaskID = ?`, [applicantId, taskId]);
    } else {
      await query(`INSERT INTO ApplicantFunctor_tbl (TaskID, ApplicantID) VALUES (?, ?)`, [taskId, applicantId]);
    }

    // بخش خرید
    if (RequestNumber) {
      const pr = await query(`SELECT RequestID FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
      if (pr.length) {
        await query(
          `UPDATE Purchase_Request_tbl SET RequestNumber = ?, RegisterNumber = ?, RequestDate = ? WHERE TaskID = ?`,
          [RequestNumber, RegisterNumber, RequestDate ? fmtDT(new Date(RequestDate)) : fmtDT(new Date()), taskId]
        );
      } else {
        await query(
          `INSERT INTO Purchase_Request_tbl (TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status)
           VALUES (?, ?, ?, ?, '', N'اولیه')`,
          [taskId, RequestNumber, RegisterNumber, RequestDate ? fmtDT(new Date(RequestDate)) : fmtDT(new Date())]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    const tables = ['Follow_tbl', 'ApplicantFunctor_tbl', 'Asset_Task_tbl', 'Folder_tbl', 'Purchase_Request_tbl', 'TimeDate_tbl', 'Tsk_tbl'];
    for (const t of tables) {
      await query(`DELETE FROM ${t} WHERE TaskID = ?`, [taskId]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}