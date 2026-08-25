import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const b = (await request.json()) || {};
    const conds = [];
    const params = [];
    const like = (col, val) => { conds.push(`(${col} LIKE ?)`); params.push(`%${val}%`); };

    if (b.status === 'current') conds.push('(tsk.Complited < 1)');
    else if (b.status === 'completed') conds.push('(tsk.Complited = 1)');

    if (String(b.taskID || '').trim()) { conds.push('(tsk.TaskID = ?)'); params.push(Number(b.taskID)); }
    if (String(b.requestNumber || '').trim()) { conds.push('(tsk.RequestNumber = ? OR tsk.RegisterNumber = ?)'); params.push(Number(b.requestNumber), Number(b.requestNumber)); }
    if (String(b.propertyCode || '').trim()) like('asset.PropertyCode', b.propertyCode);
    if (String(b.subject || '').trim()) like('tsk.TaskTtl', b.subject);
    if (String(b.description || '').trim()) like('tsk.Descriptions', b.description);
    if (String(b.mechSystem || '').trim()) like('asset.MechSystem', b.mechSystem);
    if (String(b.assetName || '').trim()) like('asset.AssetName', b.assetName);
    if (String(b.assetNumber || '').trim()) { conds.push('(asset.AssetNumber = ?)'); params.push(Number(b.assetNumber)); }
    if (String(b.building || '').trim()) like('asset.Building', b.building);
    if (String(b.block || '').trim()) { conds.push('(asset.Block = ?)'); params.push(String(b.block)); }
    if (String(b.floor || '').trim()) { conds.push('(asset.Floor = ?)'); params.push(Number(b.floor)); }
    if (String(b.entrance || '').trim()) like('asset.Entrance', b.entrance);
    if (String(b.location || '').trim()) like('asset.Location', b.location);
    if (String(b.specifications || '').trim()) like('asset.Specifications', b.specifications);
    if (b.start) { conds.push('(TD.DueDateTime >= ?)'); params.push(String(b.start)); }
    if (b.end) { conds.push('(TD.DueDateTime <= ?)'); params.push(String(b.end)); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
      tsk.TaskTtl, tsk.Descriptions, tsk.Complited, atk.AssetID,
      TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      ${where}
      ORDER BY TD.DueDateTime, tsk.TaskID`, params);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}