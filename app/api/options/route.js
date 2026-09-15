import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normFa, placeRules } from '@/lib/assetRules';

const normCol = (col) =>
  `LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')))`;

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
      const col = { AssetName: 'AssetName', AssetNumber: 'AssetNumber', Building: 'Building', Block: 'Block', Floor: 'Floor', Entrance: 'Entrance', Location: 'Location', MechSystem: 'MechSystem' }[field];
      if (!col) return NextResponse.json({ success: false, error: 'field نامعتبر' }, { status: 400 });
      for (const [k, v] of Object.entries(constraints)) {
        if (v == null || String(v).trim() === '') continue;
        const c = { AssetName: 'AssetName', AssetNumber: 'AssetNumber', Building: 'Building', Block: 'Block', Floor: 'Floor', Entrance: 'Entrance', Location: 'Location', MechSystem: 'MechSystem' }[k];
        if (c) push(c, (k === 'AssetNumber' || k === 'Floor') ? Number(v) : String(v));
      }
      const where = `WHERE ${col} IS NOT NULL AND LTRIM(RTRIM(CAST(${col} AS nvarchar(60)))) <> N''` + (conds.length ? ` AND ${conds.join(' AND ')}` : '');
      sql = `SELECT DISTINCT ${col} AS v FROM Asset_2_tbl ${where} ORDER BY ${col}`;
    } else {
      const col = { TaskID: 'tsk.TaskID', TaskTtl: 'tsk.TaskTtl', Descriptions: 'tsk.Descriptions', Priorities: 'TD.Priorities' }[field];
      if (!col) return NextResponse.json({ success: false, error: 'field نامعتبر' }, { status: 400 });
      for (const [k, v] of Object.entries(constraints)) {
        if (v == null || String(v).trim() === '') continue;
        const tc = { TaskID: 'tsk.TaskID', TaskTtl: 'tsk.TaskTtl', Descriptions: 'tsk.Descriptions', Priorities: 'TD.Priorities' }[k];
        const ac = { AssetName: 'asset.AssetName', AssetNumber: 'asset.AssetNumber', Building: 'asset.Building', Block: 'asset.Block', Floor: 'asset.Floor', Entrance: 'asset.Entrance', Location: 'asset.Location', MechSystem: 'asset.MechSystem' }[k];
        if (tc) push(tc, String(v));
        else if (ac) push(ac, (k === 'AssetNumber' || k === 'Floor') ? Number(v) : String(v));
      }
      const join = `LEFT JOIN Asset_Task_tbl atk ON atk.TaskID = tsk.TaskID LEFT JOIN Asset_2_tbl asset ON asset.AssetID = atk.AssetID`;
      const where = `WHERE ${col} IS NOT NULL AND LTRIM(RTRIM(CAST(${col} AS nvarchar(max)))) <> N''` + (conds.length ? ` AND ${conds.join(' AND ')}` : '');
      sql = `SELECT DISTINCT ${col} AS v FROM Tsk_tbl tsk LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID ${join} ${where} ORDER BY ${col}`;
    }

    const rows = await query(sql, params);
    return NextResponse.json({ success: true, values: rows.map((r) => String(r.v)) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}