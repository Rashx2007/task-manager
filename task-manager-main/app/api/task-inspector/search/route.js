import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalizeDigits, normalizeFa } from '@/lib/assetRules';

const COLUMNS = {
  TaskID: 'tsk.TaskID', AssetName: 'asset.AssetName', AssetNumber: 'asset.AssetNumber',
  Building: 'asset.Building', Block: 'asset.Block', Floor: 'asset.Floor',
  Entrance: 'asset.Entrance', Location: 'asset.Location', TaskTtl: 'tsk.TaskTtl',
  Priorities: 'COALESCE(TD.Priorities, tsk.Priorities)',
  status: "CASE WHEN tsk.Complited = 1 THEN N'اتمام' ELSE N'جاری' END",
};
const NUMERIC = new Set(['TaskID', 'AssetNumber', 'Floor']);
const FROM = `FROM Tsk_tbl tsk
  LEFT JOIN Asset_Task_tbl atk ON atk.TaskID = tsk.TaskID
  LEFT JOIN Asset_2_tbl asset ON asset.AssetID = COALESCE(atk.AssetID, tsk.AssetID)
  LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID`;
const reply = (body, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const invalid = (message) => { const error = new Error(message); error.inputError = true; throw error; };
const own = (key) => Object.prototype.hasOwnProperty.call(COLUMNS, key);
const textColumn = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(${col} AS nvarchar(max)), NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک'), NCHAR(13), N''), NCHAR(10), N''), NCHAR(9), N''), NCHAR(160), N''), N' ', N'')`;

function conditions(filters, except) {
  const params = [], clauses = [];
  for (const [key, values] of Object.entries(filters)) {
    if (key === except || values === null) continue;
    if (!values.length) { clauses.push('(1 = 0)'); continue; }
    const alternatives = values.map((value) => {
      const col = COLUMNS[key];
      if (NUMERIC.has(key)) {
        const raw = normalizeDigits(value).trim();
        if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) invalid('مقدار فیلتر عددی معتبر نیست.');
        params.push(Number(raw)); return `${col} = ?`;
      }
      if (key === 'status' || key === 'Priorities') {
        params.push(normalizeFa(value)); return `LTRIM(RTRIM(CAST(${col} AS nvarchar(max)))) = ?`;
      }
      const text = normalizeFa(value).replace(/\s+/g, '').replace(/[\\%_\[\]]/g, '\\$&');
      params.push(`%${text}%`);
      return `${textColumn(col)} LIKE ? ESCAPE '\\'`;
    });
    clauses.push(`(${alternatives.join(' OR ')})`);
  }
  if (params.length > 2000) invalid('تعداد گزینه‌های انتخابی زیاد است؛ فیلتر را محدودتر کنید یا انتخاب همه را به‌کار ببرید.');
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// POST فقط برای انتقال فیلترهاست؛ این مسیر هیچ عملیات نوشتنی در دیتابیس ندارد.
export async function POST(request) {
  try {
    let body;
    try { body = await request.json(); } catch { invalid('بدنهٔ جستجو معتبر نیست.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('درخواست جستجو معتبر نیست.');
    const mode = body.mode;
    if (!['rows', 'options'].includes(mode)) invalid('نوع جستجو معتبر نیست.');
    const filters = body.filters == null ? {} : body.filters;
    if (typeof filters !== 'object' || Array.isArray(filters)) invalid('فیلترها باید یک شیء معتبر باشند.');
    for (const [key, values] of Object.entries(filters)) {
      if (!own(key) || (values !== null && (!Array.isArray(values) || values.some((v) => typeof v !== 'string' || v.length > 4000)))) invalid('ستون یا مقدار فیلتر معتبر نیست.');
      if (values?.length > 2000) invalid('تعداد گزینه‌های این ستون زیاد است؛ انتخاب را محدودتر کنید.');
    }
    if (mode === 'options') {
      if (typeof body.field !== 'string' || !own(body.field)) invalid('ستون فیلتر معتبر نیست.');
      const col = COLUMNS[body.field];
      const { where, params } = conditions(filters, body.field);
      const rows = await query(`SELECT DISTINCT CAST(${col} AS nvarchar(max)) AS v ${FROM}
        ${where || 'WHERE 1 = 1'} AND ${col} IS NOT NULL
        AND LTRIM(RTRIM(CAST(${col} AS nvarchar(max)))) <> N''`, params);
      const values = rows.map((row) => String(row.v));
      values.sort((a, b) => NUMERIC.has(body.field) ? Number(a) - Number(b) : a.localeCompare(b, 'fa', { numeric: true }));
      return reply({ success: true, values });
    }
    const page = body.page ?? 1, pageSize = body.pageSize ?? 20;
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000000 || ![10, 20, 50].includes(pageSize)) invalid('صفحهٔ جستجو معتبر نیست.');
    const { where, params } = conditions(filters);
    const counts = await query(`SELECT COUNT(DISTINCT tsk.TaskID) AS total ${FROM} ${where}`, params);
    const total = Number(counts[0]?.total || 0);
    const resolvedPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = total ? await query(`WITH matches AS (
      SELECT tsk.TaskID, tsk.TaskTtl, tsk.Descriptions, tsk.Complited,
        COALESCE(TD.Priorities, tsk.Priorities) AS Priorities,
        asset.AssetName, asset.AssetNumber, asset.Building, asset.Block,
        asset.Floor, asset.Entrance, asset.Location, TD.DueDateTime, TD.EndDateTime,
        ROW_NUMBER() OVER (PARTITION BY tsk.TaskID ORDER BY TD.DueDateTime DESC, asset.AssetID DESC) AS inspectionRank
      ${FROM} ${where}
    ) SELECT TaskID, TaskTtl, Descriptions, Complited, Priorities,
      AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, DueDateTime, EndDateTime
      FROM matches WHERE inspectionRank = 1
      ORDER BY TaskID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`, [...params, (resolvedPage - 1) * pageSize, pageSize]) : [];
    return reply({ success: true, rows, total, page: resolvedPage, pageSize });
  } catch (error) {
    return reply({ success: false, error: error.inputError ? error.message : 'دریافت نتایج جستجو ناموفق بود.' }, error.inputError ? 400 : 500);
  }
}
