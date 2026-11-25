import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') || 'devices';
  const filter = searchParams.get('filter') || '';
  const like = `%${filter}%`;
  try {
    let rows = [];
    if (kind === 'devices') {
      rows = await query(`SELECT DISTINCT asset.AssetID, asset.AssetName AS DeviceType, asset.AssetNumber AS DeviceNumber,
        asset.Block, asset.Entrance, asset.Building, asset.Floor, asset.Location,
        tsk.TaskTtl AS Subject, tsk.Descriptions AS Description
        FROM Asset_2_tbl asset
        LEFT JOIN Asset_Task_tbl at ON asset.AssetID = at.AssetID
        LEFT JOIN Tsk_tbl tsk ON at.TaskID = tsk.TaskID`);
    } else if (kind === 'subjects') {
      rows = await query(`SELECT DISTINCT tsk.TaskTtl AS val FROM Tsk_tbl tsk WHERE tsk.TaskTtl LIKE ? ORDER BY tsk.TaskTtl`, [like]);
    } else if (kind === 'descriptions') {
      rows = await query(`SELECT DISTINCT tsk.Descriptions AS val FROM Tsk_tbl tsk WHERE tsk.Descriptions LIKE ? ORDER BY tsk.Descriptions`, [like]);
    }
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}