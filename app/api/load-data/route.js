// app/api/load-data/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalizeDigits } from '@/lib/assetRules';

// ✅ همان نرمال‌سازی که کوئری دسکتاپ/جامع استفاده می‌کند
const normalizeFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();

const normCol = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(${col} AS nvarchar(max)), NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')`;

// ✅ برای مقایسهٔ LIKE: حذف همهٔ انواع فاصله (فاصله/CR/LF/Tab) از ستون تا
//    خط جدید یا فاصلهٔ مضاعفِ ذخیره‌شده در متن، ردیف را از نتیجه نیندازد
const normColWs = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(${normCol(col)}, NCHAR(13), N''), NCHAR(10), N''), NCHAR(9), N''), N' ', N'')`;

// ✅ سمت پارامتر LIKE: حذف فاصله‌ها + escape کاراکترهای ویژهٔ LIKE ( \ % [ ] _ )
const normValWs = (s) =>
  normalizeFa(s)
    .replace(/\s+/g, '')
    .replace(/[\\%\[\]_]/g, (c) => '\\' + c);

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
  Block:        { kind: 'like',  col: 'asset.Block' },
  Floor:        { kind: 'eqNum', col: 'asset.Floor' },
  Entrance:     { kind: 'like',  col: 'asset.Entrance' },
  Location:     { kind: 'like',  col: 'asset.Location' },
  TaskTtl:      { kind: 'like',  col: 'tsk.TaskTtl' },
  Descriptions: { kind: 'like',  col: 'tsk.Descriptions' },
  Priorities:   { kind: 'eq',    col: 'TD.Priorities' },
  status:       { kind: 'status' },
};

// ✅ هستهٔ مشترک بارگذاری؛ پارامترها از GET (query) یا POST (body) می‌آیند
async function runLoad({ type, offset, limit, filters }) {
  // ✅ گارد: filters همیشه یک آبجکت معتبر باشد (null/[]/رشته → {})
  const f = filters && typeof filters === 'object' && !Array.isArray(filters) ? filters : {};

  try {
    const conds = [];
    const params = [];

    const hasColumnFilters = Object.entries(f).some(([key, v]) => Object.hasOwn(COLUMN_FILTER_MAP, key) && Array.isArray(v));

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
      // فیلتر ستونی از کل کارهاست؛ بازهٔ تاریخ پنهان نباید کارهای بدون زمان را حذف کند.
      for (const [key, values] of Object.entries(f)) {
        if (!Array.isArray(values)) continue;
        const def = Object.hasOwn(COLUMN_FILTER_MAP, key) ? COLUMN_FILTER_MAP[key] : null;
        if (!def) continue;
        if (values.length === 0) { conds.push('(1 = 0)'); continue; }

        if (def.kind === 'status') {
          const hasCur = values.includes('جاری');
          const hasDone = values.includes('اتمام');
          if (hasCur && !hasDone) conds.push('(tsk.Complited < 1)');
          else if (hasDone && !hasCur) conds.push('(tsk.Complited = 1)');
          else if (!hasCur && !hasDone) conds.push('(1 = 0)');
          // هر دو وضعیت = همهٔ کارها
          continue;
        }

        const ors = [];
        for (const v of values) {
          if (def.kind === 'like') {
            ors.push(`(${normColWs(def.col)} LIKE ? ESCAPE '\\')`);
            params.push(`%${normValWs(v)}%`);
          } else if (def.kind === 'eq') {
            ors.push(`(${def.col} = ?)`);
            params.push(String(v));
          } else {
            const raw = normalizeDigits(v).trim();
            const number = raw === '' ? NaN : Number(raw);
            if (!Number.isFinite(number)) { ors.push('(1 = 0)'); continue; }
            ors.push(`(${def.col} = ?)`);
            params.push(number);
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

    // ✅ نزدیک‌ترین لحظه‌ای که لایهٔ روزانه می‌تواند عوض شود (سررسید یک کار زمان‌ثابت جاری)
    let nextSwitch = null;
    if (!hasColumnFilters && type === 'daily') {
      try {
        const nx = await query(
          `SELECT MIN(TD.DueDateTime) AS nxt
           FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
           WHERE (tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime >= GETDATE())`,
        );
        nextSwitch = nx[0]?.nxt || null;
      } catch {}
    }
    return NextResponse.json({ success: true, data: rows, total, nextSwitch });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ✅ GET برای سازگاری عقب‌مانده (فقط درخواست‌های سبک بدون فیلتر بزرگ)
export async function GET(request) {
  const url = new URL(request.url);
  let filters = {};
  try { filters = JSON.parse(url.searchParams.get('filters') || '{}'); } catch { filters = {}; }
  return runLoad({
    type: url.searchParams.get('type') || 'daily',
    offset: Math.max(0, Number(url.searchParams.get('offset') || 0)),
    limit: Math.max(1, Number(url.searchParams.get('limit') || 10)),
    filters,
  });
}

// ✅✅ POST: فیلترها در بدنهٔ درخواست → URL هرگز بزرگ نمی‌شود → دیگر 431 نمی‌گیریم
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  let filters = b.filters;
  if (typeof filters === 'string') {
    try { filters = JSON.parse(filters); } catch { filters = {}; }
  }
  return runLoad({
    type: b.type || 'daily',
    offset: Math.max(0, Number(b.offset || 0)),
    limit: Math.max(1, Number(b.limit || 10)),
    filters: filters && typeof filters === 'object' ? filters : {},
  });
}