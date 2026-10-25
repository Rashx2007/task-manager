import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normFa, normalizeDigits } from '@/lib/assetRules';

const normCol = (col) =>
  `LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(${col} AS nvarchar(max)), NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')))`;

const ASSET_COLS = {
  AssetName: 'AssetName', AssetNumber: 'AssetNumber', Building: 'Building', Block: 'Block',
  Floor: 'Floor', Entrance: 'Entrance', Location: 'Location', MechSystem: 'MechSystem',
};
const TASK_COLS = { TaskID: 'tsk.TaskID', TaskTtl: 'tsk.TaskTtl', Descriptions: 'tsk.Descriptions', Priorities: 'TD.Priorities' };
const TASK_ASSET_CONDS = {
  AssetName: 'asset.AssetName', AssetNumber: 'asset.AssetNumber', Building: 'asset.Building', Block: 'asset.Block',
  Floor: 'asset.Floor', Entrance: 'asset.Entrance', Location: 'asset.Location', MechSystem: 'asset.MechSystem',
};

export async function POST(request) {
  try {
    const b = (await request.json()) || {};
    const field = String(b.field || '');
    const source = b.source === 'asset' ? 'asset' : 'task';
    const constraints = b.constraints && typeof b.constraints === 'object' && !Array.isArray(b.constraints) ? b.constraints : {};
    const taskScope = b.scope === 'tasks';

    const conds = [];
    const params = [];
    // ✅ مقدار قیدها نرمال‌شده ارسال می‌شود تا با normCol ستون تطبیق کند
    const pushText = (col, val) => { conds.push(`(${normCol(col)} = ?)`); params.push(normFa(val)); };
    const pushNum = (col, val) => {
      const raw = normalizeDigits(val).trim();
      const number = raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(number)) { conds.push('(1 = 0)'); return; }
      conds.push(`(${col} = ?)`); params.push(number);
    };

    const pushLike = (col, val) => {
      const expr = `REPLACE(REPLACE(REPLACE(REPLACE(${normCol(col)}, NCHAR(13), N''), NCHAR(10), N''), NCHAR(9), N''), N' ', N'')`;
      const value = normFa(val).replace(/\s+/g, '').replace(/[\\%\[\]_]/g, (c) => '\\' + c);
      conds.push(`(${expr} LIKE ? ESCAPE '\\')`);
      params.push(`%${value}%`);
    };

    let sql = '';
    if (source === 'asset' && !taskScope) {
      const col = ASSET_COLS[field];
      if (!col) return NextResponse.json({ success: false, error: 'field نامعتبر' }, { status: 400 });
      for (const [k, v] of Object.entries(constraints)) {
        if (v == null || String(v).trim() === '') continue;
        const c = ASSET_COLS[k];
        if (!c) continue;
        if (k === 'AssetNumber' || k === 'Floor') pushNum(c, v); else pushText(c, v);
      }
      const where =
        `WHERE ${col} IS NOT NULL AND LTRIM(RTRIM(CAST(${col} AS nvarchar(60)))) <> N''` +
        (conds.length ? ` AND ${conds.join(' AND ')}` : '');
      sql = `SELECT DISTINCT ${col} AS v FROM Asset_2_tbl ${where} ORDER BY ${col}`;
    } else {
      const col = source === 'asset' ? TASK_ASSET_CONDS[field] : TASK_COLS[field];
      if (!col) return NextResponse.json({ success: false, error: 'field نامعتبر' }, { status: 400 });
      for (const [k, v] of Object.entries(constraints)) {
        if (v == null) continue;
        const values = Array.isArray(v) ? v : [v];
        if (k === 'status') {
          const current = values.includes('جاری'), done = values.includes('اتمام');
          if (current && !done) conds.push('(tsk.Complited < 1)');
          else if (done && !current) conds.push('(tsk.Complited = 1)');
          else if (!current && !done) conds.push('(1 = 0)');
          continue;
        }
        const column = TASK_COLS[k] || TASK_ASSET_CONDS[k];
        if (!column) continue;
        if (values.length === 0) { conds.push('(1 = 0)'); continue; }
        const alternatives = [];
        for (const value of values) {
          if (!Array.isArray(v) && String(value).trim() === '') continue;
          const before = conds.length;
          if (['TaskID', 'AssetNumber', 'Floor'].includes(k)) pushNum(column, value);
          else if (taskScope && k !== 'Priorities') pushLike(column, value);
          else pushText(column, value);
          if (conds.length > before) alternatives.push(conds.pop());
        }
        if (alternatives.length) conds.push(`(${alternatives.join(' OR ')})`);
      }
      const join = `LEFT JOIN Asset_Task_tbl atk ON atk.TaskID = tsk.TaskID LEFT JOIN Asset_2_tbl asset ON asset.AssetID = atk.AssetID`;
      const where =
        `WHERE ${col} IS NOT NULL AND LTRIM(RTRIM(CAST(${col} AS nvarchar(max)))) <> N''` +
        (conds.length ? ` AND ${conds.join(' AND ')}` : '');
      sql = `SELECT DISTINCT ${col} AS v FROM Tsk_tbl tsk LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID ${join} ${where} ORDER BY ${col}`;
    }

    const rows = await query(sql, params);
    return NextResponse.json({ success: true, values: rows.map((r) => String(r.v)) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}