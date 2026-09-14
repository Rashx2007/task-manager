import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ستون‌های جدول دستگاه‌ها
const ASSET_COLS = {
  AssetName: 'AssetName',
  AssetNumber: 'AssetNumber',
  Building: 'Building',
  Location: 'Location',
  Block: 'Block',
  Floor: 'Floor',
  Entrance: 'Entrance',
  MechSystem: 'MechSystem',
};

// ستون‌های جدول کارها
const TASK_COLS = {
  TaskID: 'tsk.TaskID',
  TaskTtl: 'tsk.TaskTtl',
  Descriptions: 'tsk.Descriptions',
  Priorities: 'TD.Priorities',
};

export async function POST(request) {
  try {
    const b = (await request.json()) || {};
    const field = String(b.field || '');
    const source = b.source === 'asset' ? 'asset' : 'task';
    const constraints = b.constraints || {};

    const conds = [];
    const params = [];
    const push = (col, val) => { conds.push(`(${col} = ?)`); params.push(val); };

    let sql = '';
    if (source === 'asset') {
      const col = ASSET_COLS[field];
      if (!col) return NextResponse.json({ success: false, error: 'field نامعتبر' }, { status: 400 });
      for (const [k, v] of Object.entries(constraints)) {
        if (v == null || String(v).trim() === '') continue;
        if (ASSET_COLS[k]) push(ASSET_COLS[k], k === 'AssetNumber' ? Number(v) : String(v));
      }
      const where =
        `WHERE ${col} IS NOT NULL AND LTRIM(RTRIM(CAST(${col} AS nvarchar(60)))) <> N''` +
        (conds.length ? ` AND ${conds.join(' AND ')}` : '');
      sql = `SELECT DISTINCT ${col} AS v FROM Asset_2_tbl ${where} ORDER BY ${col}`;
    } else {
      const col = TASK_COLS[field];
      if (!col) return NextResponse.json({ success: false, error: 'field نامعتبر' }, { status: 400 });
      for (const [k, v] of Object.entries(constraints)) {
        if (v == null || String(v).trim() === '') continue;
        if (TASK_COLS[k]) push(TASK_COLS[k], String(v));
        else if (ASSET_COLS[k]) push(`asset.${ASSET_COLS[k]}`, k === 'AssetNumber' ? Number(v) : String(v));
      }
      const join = `LEFT JOIN Asset_Task_tbl atk ON atk.TaskID = tsk.TaskID LEFT JOIN Asset_2_tbl asset ON asset.AssetID = atk.AssetID`;
      const where =
        `WHERE ${col} IS NOT NULL AND LTRIM(RTRIM(CAST(${col} AS nvarchar(max)))) <> N''` +
        (conds.length ? ` AND ${conds.join(' AND ')}` : '');
      sql = `SELECT DISTINCT ${col} AS v FROM Tsk_tbl tsk LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID ${join} ${where} ORDER BY ${col}`;
    }

    const rows = await query(sql, params);
    const values = rows.map((r) => String(r.v));
    return NextResponse.json({ success: true, values });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}