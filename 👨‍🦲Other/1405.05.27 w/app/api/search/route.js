import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const esc = (s) => String(s).replace(/'/g, "''");
const has = (s) => s !== undefined && s !== null && String(s).trim() !== '';

// ✅ تبدیل هر ورودی تاریخ (YYYY-MM-DD یا ISO با T/Z) به فرمت امنِ فقط-تاریخ
const toDateOnly = (v) => {
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export async function POST(request) {
  try {
    const b = await request.json();
    // هر دو نام کلید را پشتیبانی کن تا فیلتر وضعیت هرگز جا نیفتد
    const status = b.status || b.statusFilter || 'current';
    const conditions = [];

    if (has(b.taskID)) conditions.push(`CAST(tsk.TaskID AS NVARCHAR(20)) LIKE N'%${esc(b.taskID)}%'`);
    if (has(b.requestNumber)) {
      const n = parseInt(b.requestNumber, 10);
      if (!isNaN(n)) conditions.push(`(PR.RequestNumber = ${n} OR PR.RegisterNumber = ${n})`);
      else conditions.push(`(CAST(PR.RequestNumber AS NVARCHAR(20)) LIKE N'%${esc(b.requestNumber)}%' OR CAST(PR.RegisterNumber AS NVARCHAR(20)) LIKE N'%${esc(b.requestNumber)}%')`);
    }
    if (has(b.propertyCode)) conditions.push(`ISNULL(CAST(asset.PropertyCode AS NVARCHAR(50)),'') LIKE N'%${esc(b.propertyCode)}%'`);
    if (has(b.subject)) conditions.push(`(tsk.TaskTtl LIKE N'%${esc(b.subject)}%' OR tsk.Descriptions LIKE N'%${esc(b.subject)}%')`);
    if (has(b.description)) conditions.push(`tsk.Descriptions LIKE N'%${esc(b.description)}%'`);
    if (has(b.mechSystem)) conditions.push(`asset.MechSystem LIKE N'%${esc(b.mechSystem)}%'`);
    if (has(b.assetName)) conditions.push(`asset.AssetName LIKE N'%${esc(b.assetName)}%'`);
    if (has(b.assetNumber)) conditions.push(`ISNULL(CAST(asset.AssetNumber AS NVARCHAR(20)),'') LIKE N'%${esc(b.assetNumber)}%'`);
    if (has(b.building)) conditions.push(`asset.Building LIKE N'%${esc(b.building)}%'`);
    if (has(b.block)) conditions.push(`ISNULL(CAST(asset.Block AS NVARCHAR(10)),'') LIKE N'%${esc(b.block)}%'`);
    if (has(b.floor)) conditions.push(`ISNULL(CAST(asset.Floor AS NVARCHAR(10)),'') LIKE N'%${esc(b.floor)}%'`);
    if (has(b.entrance)) conditions.push(`asset.Entrance LIKE N'%${esc(b.entrance)}%'`);
    if (has(b.location)) conditions.push(`asset.Location LIKE N'%${esc(b.location)}%'`);
    if (has(b.specifications)) conditions.push(`asset.Specifications LIKE N'%${esc(b.specifications)}%'`);

    // ✅ بازه تاریخ — فقط بخش تاریخ استخراج و با زمان امن الحاق می‌شود
    const startD = has(b.start) ? toDateOnly(b.start) : null;
    const endD = has(b.end) ? toDateOnly(b.end) : null;
    if (startD) conditions.push(`TD.DueDateTime >= '${startD} 00:00:00'`);
    if (endD) conditions.push(`TD.EndDateTime <= '${endD} 23:59:59'`);

    // فیلتر وضعیت — همیشه اعمال می‌شود
    if (status === 'current') conditions.push(`tsk.Complited = 0`);
    else if (status === 'completed') conditions.push(`tsk.Complited = 1`);

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const results = await query(`
      SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location, asset.Specifications,
        tsk.TaskTtl, tsk.Descriptions, tsk.Complited,
        TD.Priorities, TD.Submit_Date, TD.DueDateTime, TD.EndDateTime
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID = assettsk.TaskID
      LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      LEFT JOIN Purchase_Request_tbl PR ON PR.TaskID = tsk.TaskID
      ${where}
      ORDER BY TD.DueDateTime`);

    return NextResponse.json({ success: true, data: results });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}