import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const normalizeFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const normCol = (col) =>
  `LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')))`;

const TASK_TEXT_COLS = { TaskTtl: 'tsk.TaskTtl', Descriptions: 'tsk.Descriptions', Priorities: 'TD.Priorities' };
const ASSET_TEXT_COLS = { AssetName: 'asset.AssetName', Building: 'asset.Building', Location: 'asset.Location' };

export async function GET(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'daily';
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const limit = Math.max(1, Number(url.searchParams.get('limit') || 10));
  let filters = {};
  try { filters = JSON.parse(url.searchParams.get('filters') || '{}'); } catch { filters = {}; }

  try {
    let where;
    if (type === 'fixed') {
      where = `(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت')`;
    } else if (type === 'all') {
      where = `(tsk.Complited < 1)`;
    } else {
      const uns = await query(`SELECT COUNT(*) AS c FROM Tsk_tbl WHERE (Complited < 1) AND ((Temporary = 1) OR (Priorities = N'نامشخص') OR (Priorities IS NULL))`);
      if (Number(uns[0].c) > 0) {
        where = `(tsk.Complited < 1) AND ((tsk.Temporary = 1) OR (tsk.Priorities = N'نامشخص') OR (tsk.Priorities IS NULL))`;
      } else {
        const od = await query(`SELECT COUNT(*) AS c FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID WHERE (tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`);
        if (Number(od[0].c) > 0) {
          where = `(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`;
        } else {
          where = `(tsk.Complited < 1) AND (TD.TaskID IS NULL OR TD.DueDateTime IS NULL OR CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE))`;
        }
      }
    }

    const conds = [];
    const params = [];
    for (const [key, values] of Object.entries(filters)) {
      if (!Array.isArray(values)) continue;
      if (values.length === 0) { conds.push('(1=0)'); continue; }
      if (key === 'status') {
        const hasCur = values.includes('جاری');
        const hasDone = values.includes('اتمام');
        if (hasCur && hasDone) continue;
        if (hasCur) conds.push('(tsk.Complited < 1)');
        else if (hasDone) conds.push('(tsk.Complited = 1)');
        else conds.push('(1=0)');
        continue;
      }
      if (key === 'TaskID' || key === 'AssetNumber') {
        const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
        if (nums.length === 0) continue;
        const col = key === 'TaskID' ? 'tsk.TaskID' : 'asset.AssetNumber';
        conds.push(`(${nums.map(() => `(${col} = ?)`).join(' OR ')})`);
        nums.forEach((n) => params.push(n));
        continue;
      }
      const col = TASK_TEXT_COLS[key] || ASSET_TEXT_COLS[key];
      if (!col) continue;
      const texts = values.map((v) => normalizeFa(v)).filter((s) => s !== '');
      if (texts.length === 0) continue;
      conds.push(`(${texts.map(() => `(${normCol(col)} = ?)`).join(' OR ')})`);
      texts.forEach((s) => params.push(s));
    }
    const filterWhere = conds.length ? ` AND ${conds.join(' AND ')}` : '';
    const fullWhere = `${where}${filterWhere}`;

    const baseFrom = `FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
      LEFT JOIN ApplicantFunctor_tbl AF ON AF.TaskID = tsk.TaskID
      LEFT JOIN Persons_tbl pa ON pa.PersonID = COALESCE(tsk.ApplicantID, AF.ApplicantID)
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID`;

    const countRows = await query(`SELECT COUNT(DISTINCT tsk.TaskID) AS c ${baseFrom} WHERE ${fullWhere}`, params);
    const total = Number(countRows[0]?.c || 0);

    const rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
      tsk.TaskTtl, tsk.Descriptions, tsk.Complited, atk.AssetID,
      pa.PersonName AS ApplicantName,
      TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime,
      CASE WHEN TD.Priorities = N'زمان انجام ثابت' THEN 0 ELSE 1 END AS FixOrd
      ${baseFrom}
      WHERE ${fullWhere}
      ORDER BY FixOrd, TD.DueDateTime, tsk.TaskID
      OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`, [...params, offset, limit]);

    return NextResponse.json({ success: true, data: rows, total });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}