import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const rows = await query(
      `SELECT tsk.*, COALESCE(atk.AssetID, tsk.AssetID) AS ResolvedAssetID,
      TD.DueDateTime AS TDDue, TD.EndDateTime AS TDEnd, TD.Priorities AS TDP, TD.FixedDueTime AS TDF
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      WHERE tsk.TaskID = ?`,
      [Number(id)],
    );
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const b = await request.json();
    const tid = Number(id);

    // ۱) معادل EditTask دسکتاپ: به‌روزرسانی فیلدهای متنی
    await query(
      `UPDATE Tsk_tbl SET TaskTtl=?, Descriptions=?, Priorities=?, tskType=?, IsConsiderableAction=?, Complited=?, fixedDueTime=? WHERE TaskID=?`,
      [
        b.TaskTtl,
        b.Descriptions || null,
        b.Priorities || "3.متوسط",
        b.tskType || null,
        b.IsConsiderableAction || null,
        Number(b.Complited) || 0,
        Number(b.FixedDueTime) || 0,
        tid,
      ],
    );

    if (b.AssetID) {
      const ex = await query(
        `SELECT AssetTaskID FROM Asset_Task_tbl WHERE TaskID=?`,
        [tid],
      );
      if (ex.length)
        await query(`UPDATE Asset_Task_tbl SET AssetID=? WHERE TaskID=?`, [
          b.AssetID,
          tid,
        ]);
      else
        await query(
          `INSERT INTO Asset_Task_tbl (TaskID, AssetID) VALUES (?,?)`,
          [tid, b.AssetID],
        );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await query(`DELETE FROM TimeDate_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Asset_Task_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM ApplicantFunctor_tbl WHERE TaskID=?`, [
      Number(id),
    ]);
    await query(`DELETE FROM Follow_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Folder_tbl WHERE TaskID=?`, [Number(id)]);
    await query(`DELETE FROM Tsk_tbl WHERE TaskID=?`, [Number(id)]);
    // ✅ معادل دسکتاپ: هنگام اتمام کار، زمان پایان از بیشینهٔ پایان پیگیری‌ها ثبت می‌شود
    if (Number(b.Complited) === 1) {
      try {
        const mx = await query(
          `SELECT MAX(EndDateTime) AS Finish FROM Follow_tbl WHERE TaskID=?`,
          [tid],
        );
        if (mx.length && mx[0].Finish) {
          await query(
            `UPDATE TimeDate_tbl SET Finish_DateTime=? WHERE TaskID=?`,
            [mx[0].Finish, tid],
          );
        }
      } catch {}
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}
