import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
const has = (s) => s !== undefined && s !== null && String(s).trim() !== '';
const esc = (s) => String(s).replace(/'/g, "''");
export async function POST(request) {
  try {
    const b = await request.json();
    const c = [];
    const byId = has(b.taskID);
    if (byId) c.push(`tsk.TaskID = ${Number(b.taskID)}`);
    if (has(b.requestNumber)) c.push(`(pur.RequestNumber = ${Number(b.requestNumber)} OR pur.RegisterNumber = ${Number(b.requestNumber)})`);
    if (has(b.propertyCode)) c.push(`asset.PropertyCode = ${Number(b.propertyCode)}`);
    if (has(b.subject)) c.push(`tsk.TaskTtl LIKE N'%${esc(b.subject)}%'`);
    if (has(b.description)) c.push(`tsk.Descriptions LIKE N'%${esc(b.description)}%'`);
    if (has(b.assetName)) c.push(`asset.AssetName LIKE N'%${esc(b.assetName)}%'`);
    if (has(b.building)) c.push(`asset.Building LIKE N'%${esc(b.building)}%'`);
    if (has(b.block)) c.push(`asset.Block LIKE N'%${esc(b.block)}%'`);
    if (has(b.floor)) c.push(`CAST(asset.Floor AS NVARCHAR(10)) LIKE N'%${esc(b.floor)}%'`);
    if (has(b.entrance)) c.push(`asset.Entrance LIKE N'%${esc(b.entrance)}%'`);
    if (has(b.location)) c.push(`asset.Location LIKE N'%${esc(b.location)}%'`);
    if (has(b.assetNumber)) c.push(`asset.AssetNumber = ${Number(b.assetNumber)}`);
    if (has(b.mechSystem)) c.push(`asset.MechSystem LIKE N'%${esc(b.mechSystem)}%'`);
    if (has(b.specifications)) c.push(`asset.Specifications LIKE N'%${esc(b.specifications)}%'`);
    if (!byId) {
      if (b.status === 'current') c.push(`tsk.Complited = 0`);
      else if (b.status === 'completed') c.push(`tsk.Complited = 1`);
      if (has(b.start)) c.push(`TD.DueDateTime >= '${esc(b.start)}'`);
      if (has(b.end)) c.push(`TD.DueDateTime <= '${esc(b.end)}'`);
    }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
      tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Priorities, TD.Submit_Date, TD.DueDateTime, TD.EndDateTime,
      pur.RequestNumber, pur.RegisterNumber, pur.Buyer, pur.Status
      FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID=atk.TaskID LEFT JOIN Asset_2_tbl asset ON atk.AssetID=asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID LEFT JOIN Purchase_Request_tbl pur ON pur.TaskID=tsk.TaskID ${where} ORDER BY tsk.TaskID DESC`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}