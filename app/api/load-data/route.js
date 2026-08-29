import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const type = new URL(request.url).searchParams.get('type') || 'daily';
  try {
    let where;

    if (type === 'fixed') {
      where = `(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت')`;
    } else if (type === 'all') {
      where = `(tsk.Complited < 1)`;
    } else {
      // ✅ لایهٔ ۱: کارهای بدون الویت («نامشخص») یا موقتی → فقط آنها نمایش داده شوند تا تعیین تکلیف شوند
      const uns = await query(`SELECT COUNT(*) AS c FROM Tsk_tbl
        WHERE (Complited < 1) AND ((Temporary = 1) OR (Priorities = N'نامشخص') OR (Priorities IS NULL))`);
      if (Number(uns[0].c) > 0) {
        where = `(tsk.Complited < 1) AND ((tsk.Temporary = 1) OR (tsk.Priorities = N'نامشخص') OR (tsk.Priorities IS NULL))`;
      } else {
        // ✅ لایهٔ ۲: کارهای ثابتِ سررسید‌گذشته → فقط آنها به ترتیب موعد
        const od = await query(`SELECT COUNT(*) AS c FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
          WHERE (tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`);
        if (Number(od[0].c) > 0) {
          where = `(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`;
        } else {
          // ✅ لایهٔ ۳: همهٔ کارهای غیرثابتِ اتمام‌نیافته تا تاریخ آن روز + ثابت‌های همان روز، به ترتیب موعد
          where = `(tsk.Complited < 1) AND (TD.TaskID IS NULL OR TD.DueDateTime IS NULL OR CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE))`;
        }
      }
    }

    const rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
      tsk.TaskTtl, tsk.Descriptions, tsk.Complited, atk.AssetID,
      pa.PersonName AS ApplicantName,
      TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime,
      CASE WHEN TD.Priorities = N'زمان انجام ثابت' THEN 0 ELSE 1 END AS FixOrd
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
      LEFT JOIN ApplicantFunctor_tbl AF ON AF.TaskID = tsk.TaskID
      LEFT JOIN Persons_tbl pa ON pa.PersonID = COALESCE(tsk.ApplicantID, AF.ApplicantID)
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      WHERE ${where}
      ORDER BY FixOrd, TD.DueDateTime`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}