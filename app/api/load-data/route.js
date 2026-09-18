import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ✅ همان نرمال‌سازی که کوئری دسکتاپ/جامع استفاده می‌کند
const normalizeFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();

const normCol = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')`;

// ✅ همان FROM که کوئری دسکتاپ/جامع استفاده می‌کند
const BASE_FROM = `FROM Tsk_tbl tsk
  LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
  LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
  LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
  LEFT JOIN ApplicantFunctor_tbl af ON af.TaskID = tsk.TaskID
  LEFT JOIN Persons_tbl pApp ON pApp.PersonID = af.ApplicantID
  LEFT JOIN Persons_tbl pFun ON pFun.PersonID = af.FunctorID`;

// ✅ نگاشت کلید فیلتر ستونی → همان شرطی که کوئری دسکتاپ/جامع می‌سازد
const COLUMN_FILTER_MAP = {
  TaskID:       { kind: 'eqNum', col: 'tsk.TaskID' },
  AssetNumber:  { kind: 'eqNum', col: 'asset.AssetNumber' },
  AssetName:    { kind: 'like',  col: 'asset.AssetName' },
  Building:     { kind: 'like',  col: 'asset.Building' },
  Location:     { kind: 'like',  col: 'asset.Location' },
  TaskTtl:      { kind: 'like',  col: 'tsk.TaskTtl' },
  Descriptions: { kind: 'like',  col: 'tsk.Descriptions' },
  Priorities:   { kind: 'eq',    col: 'TD.Priorities' },
  status:       { kind: 'status' },
};

const p2 = (n) => String(n).padStart(2, '0');

export async function GET(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'daily';
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const limit = Math.max(1, Number(url.searchParams.get('limit') || 10));
  let filters = {};
  try { filters = JSON.parse(url.searchParams.get('filters') || '{}'); } catch { filters = {}; }

  try {
    const conds = [];
    const params = [];

    const hasColumnFilters = Object.values(filters).some((v) => Array.isArray(v) && v.length > 0);

    if (!hasColumnFilters) {
      // ✅ بدون فیلتر ستونی: همان لایه‌بندی روزانهٔ قبلی
      if (type === 'fixed') {
        conds.push(`(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت')`);
      } else if (type === 'all') {
        conds.push(`(tsk.Complited < 1)`);
      } else {
        const uns = await query(`SELECT COUNT(*) AS c FROM Tsk_tbl WHERE (Complited < 1) AND ((Temporary = 1) OR (Priorities = N'نامشخص') OR (Priorities IS NULL))`);
        if (Number(uns[0].c) > 0) {
          conds.push(`(tsk.Complited < 1) AND ((tsk.Temporary = 1) OR (tsk.Priorities = N'نامشخص') OR (tsk.Priorities IS NULL))`);
        } else {
          const od = await query(`SELECT COUNT(*) AS c FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID WHERE (tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`);
          if (Number(od[0].c) > 0) {
            conds.push(`(tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < GETDATE())`);
          } else {
            conds.push(`(tsk.Complited < 1) AND (TD.TaskID IS NULL OR TD.DueDateTime IS NULL OR CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE))`);
          }
        }
      }
    } else {
      // ✅✅ با فیلتر ستونی: دقیقاً همان کوئری دسکتاپ/جامع
      // بازهٔ تاریخ پیش‌فرض (همان فرم جامع)
      conds.push('(TD.DueDateTime >= ?)'); params.push('2018-03-21 00:00:00');
      const d2 = new Date(); d2.setFullYear(d2.getFullYear() + 10);
      conds.push('(TD.DueDateTime <= ?)'); params.push(`${d2.getFullYear()}-${p2(d2.getMonth() + 1)}-${p2(d2.getDate())} 23:59:59`);

      for (const [key, values] of Object.entries(filters)) {
        if (!Array.isArray(values) || values.length === 0) continue;
        const def = COLUMN_FILTER_MAP[key];
        if (!def) continue;

        if (def.kind === 'status') {
          const hasCur = values.includes('جاری');
          const hasDone = values.includes('اتمام');
          if (hasCur && !hasDone) conds.push('(tsk.Complited < 1)');
          else if (hasDone && !hasCur) conds.push('(tsk.Complited = 1)');
          // هر دو یا هیچ‌کدام = همهٔ کارها (بدون شرط)
          continue;
        }

        const ors = [];
        for (const v of values) {
          if (def.kind === 'like') {
            ors.push(`(${normCol(def.col)} LIKE ?)`);
            params.push(`%${normalizeFa(v)}%`);
          } else if (def.kind === 'eq') {
            ors.push(`(${def.col} = ?)`);
            params.push(String(v));
          } else {
            ors.push(`(${def.col} = ?)`);
            params.push(Number(v));
          }
        }
        conds.push(`(${ors.join(' OR ')})`);
      }
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // ✅ شمارش کل، دقیقاً مثل جامع
    const countRows = await query(`SELECT COUNT(*) AS c FROM (SELECT DISTINCT tsk.TaskID ${BASE_FROM} ${where}) AS q`, params);
    const total = Number(countRows[0]?.c || 0);

    // ✅ ردیف‌های صفحه، دقیقاً مثل جامع + صفحه‌بندی
    const rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
      tsk.TaskTtl, tsk.Descriptions, tsk.Complited, atk.AssetID,
      TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime,
      pApp.PersonName AS ApplicantName, pFun.PersonName AS FunctorName
      ${BASE_FROM}
      ${where}
      ORDER BY TD.DueDateTime, tsk.TaskID
      OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`, [...params, offset, limit]);

    return NextResponse.json({ success: true, data: rows, total });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}