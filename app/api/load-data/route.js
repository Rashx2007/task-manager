import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'daily';
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = Number(url.searchParams.get('limit') || 10);
  const filtersParam = url.searchParams.get('filters');
  
  let filters = {};
  try { filters = filtersParam ? JSON.parse(filtersParam) : {}; } catch {}

  const normCol = (col) =>
    `LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')))`;

  try {
    let where;
    const filterConds = [];
    const filterParams = [];

    if (type === 'fixed') {
      where = `(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت')`;
    } else if (type === 'all') {
      where = `(tsk.Complited < 1)`;
    } else {
      const uns = await query(`SELECT COUNT(*) AS c FROM Tsk_tbl
        WHERE (Complited < 1) AND ((Temporary = 1) OR (Priorities = N'نامشخص') OR (Priorities IS NULL))`);
      if (Number(uns[0].c) > 0) {
        where = `(tsk.Complited < 1) AND ((tsk.Temporary = 1) OR (tsk.Priorities = N'نامشخص') OR (tsk.Priorities IS NULL))`;
      } else {
        const od = await query(`SELECT COUNT(*) AS c FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
          WHERE (tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`);
        if (Number(od[0].c) > 0) {
          where = `(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`;
        } else {
          where = `(tsk.Complited < 1) AND (TD.TaskID IS NULL OR TD.DueDateTime IS NULL OR CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE))`;
        }
      }
    }

    // ✅ اعمال فیلترهای کلاینت
    for (const [key, values] of Object.entries(filters)) {
      if (!values || !Array.isArray(values) || values.length === 0) continue;
      if (key === 'status') {
        const conds = [];
        if (values.includes('جاری')) conds.push(`(tsk.Complited < 1)`);
        if (values.includes('اتمام')) conds.push(`(tsk.Complited = 1)`);
        if (conds.length) { filterConds.push(`(${conds.join(' OR ')})`); }
      } else if (['TaskID', 'TaskTtl', 'Descriptions', 'Priorities'].includes(key)) {
        const col = { TaskID: 'tsk.TaskID', TaskTtl: 'tsk.TaskTtl', Descriptions: 'tsk.Descriptions', Priorities: 'TD.Priorities' }[key];
        const placeholders = values.map(() => `(${normCol(col)} = ?)`).join(' OR ');
        filterConds.push(`(${placeholders})`);
        filterParams.push(...values.map((v) => String(v)));
      } else {
        const col = { AssetName: 'asset.AssetName', AssetNumber: 'asset.AssetNumber', Building: 'asset.Building', Location: 'asset.Location' }[key];
        if (!col) continue;
        if (key === 'AssetNumber') {
          const placeholders = values.map(() => `(asset.AssetNumber = ?)`).join(' OR ');
          filterConds.push(`(${placeholders})`);
          filterParams.push(...values.map((v) => Number(v) || null));
        } else {
          const placeholders = values.map(() => `(${normCol(col)} = ?)`).join(' OR ');
          filterConds.push(`(${placeholders})`);
          filterParams.push(...values.map((v) => String(v)));
        }
      }
    }

    const filterWhere = filterConds.length ? ` AND ${filterConds.join(' AND ')}` : '';
    const fullWhere = where + filterWhere;

    // ✅ شمارش کل نتایج فیلترشده
    const countRows = await query(
      `SELECT COUNT(DISTINCT tsk.TaskID) AS total
       FROM Tsk_tbl tsk
       LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
       LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
       LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
       WHERE ${fullWhere}`,
      filterParams
    );
    const total = Number(countRows[0]?.total || 0);

    // ✅ دریافت صفحه فعلی
    const rows = await query(
      `SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
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
       WHERE ${fullWhere}
       ORDER BY FixOrd, TD.DueDateTime
       OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
      [...filterParams, offset, limit]
    );

    return NextResponse.json({ success: true, data: rows, total });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}