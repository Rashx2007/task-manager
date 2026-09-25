// app/api/search/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const has = (s) => s !== undefined && s !== null && String(s).trim() !== "";
const toEn = (s) =>
  String(s)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .trim();

// ✅ تاریخ امن: اگر قابل تجزیه بود Date (بدون تبدیل متنی)، وگرنه TRY_CAST
const dateCond = (col, v, endOfDay) => {
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    if (endOfDay) d.setHours(23, 59, 59, 997);
    else d.setHours(0, 0, 0, 0);
    return { sql: `${col} ${endOfDay ? "<=" : ">="} ?`, val: d };
  }
  return { sql: `${col} ${endOfDay ? "<=" : ">="} TRY_CAST(? AS DATETIME)`, val: String(v) };
};

export async function POST(request) {
  try {
    const b = await request.json();
    const c = [];
    const params = [];

    const byId = has(b.taskID);
    if (byId) {
      c.push(`tsk.TaskID = TRY_CAST(? AS INT)`);
      params.push(toEn(b.taskID));
    }

    // ✅ شماره درخواست/ثبت: ستون عددی با TRY_CAST روی پارامتر؛ ستون رشته‌ای با مقایسهٔ متنی + جستجوی جزئی
    if (has(b.requestNumber)) {
      const v = toEn(b.requestNumber);
      c.push(
        `(pur.RequestNumber = TRY_CAST(? AS INT) OR pur.RegisterNumber = ? OR pur.RegisterNumber LIKE '%' + ? + '%')`,
      );
      params.push(v, v, v);
    }

    // ✅ کد اموال رشته‌ای است؛ هرگز Number نکنید
    if (has(b.propertyCode)) {
      c.push(`asset.PropertyCode = ?`);
      params.push(toEn(b.propertyCode));
    }

    if (has(b.subject)) { c.push(`tsk.TaskTtl LIKE N'%' + ? + '%'`); params.push(String(b.subject)); }
    if (has(b.description)) { c.push(`tsk.Descriptions LIKE N'%' + ? + '%'`); params.push(String(b.description)); }
    if (has(b.assetName)) { c.push(`asset.AssetName LIKE N'%' + ? + '%'`); params.push(String(b.assetName)); }
    if (has(b.building)) { c.push(`asset.Building LIKE N'%' + ? + '%'`); params.push(String(b.building)); }
    if (has(b.block)) { c.push(`asset.Block LIKE N'%' + ? + '%'`); params.push(String(b.block)); }
    if (has(b.floor)) { c.push(`CAST(asset.Floor AS NVARCHAR(10)) LIKE N'%' + ? + '%'`); params.push(toEn(b.floor)); }
    if (has(b.entrance)) { c.push(`asset.Entrance LIKE N'%' + ? + '%'`); params.push(String(b.entrance)); }
    if (has(b.location)) { c.push(`asset.Location LIKE N'%' + ? + '%'`); params.push(String(b.location)); }
    if (has(b.assetNumber)) { c.push(`asset.AssetNumber = TRY_CAST(? AS INT)`); params.push(toEn(b.assetNumber)); }
    if (has(b.mechSystem)) { c.push(`asset.MechSystem LIKE N'%' + ? + '%'`); params.push(String(b.mechSystem)); }
    if (has(b.specifications)) { c.push(`asset.Specifications LIKE N'%' + ? + '%'`); params.push(String(b.specifications)); }

    if (!byId) {
      if (b.status === "current") c.push(`tsk.Complited = 0`);
      else if (b.status === "completed") c.push(`tsk.Complited = 1`);
      if (has(b.start)) { const dc = dateCond("TD.DueDateTime", b.start, false); c.push(dc.sql); params.push(dc.val); }
      if (has(b.end)) { const dc = dateCond("TD.DueDateTime", b.end, true); c.push(dc.sql); params.push(dc.val); }
    }

    const where = c.length ? "WHERE " + c.join(" AND ") : "";
    const rows = await query(
      `SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building,
              asset.Block, asset.Floor, asset.Entrance, asset.Location,
              tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Priorities,
              TD.Submit_Date, TD.DueDateTime, TD.EndDateTime,
              pur.RequestNumber, pur.RegisterNumber, pur.Buyer, pur.Status
       FROM Tsk_tbl tsk
       LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
       LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
       LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
       LEFT JOIN Purchase_Request_tbl pur ON pur.TaskID = tsk.TaskID
       ${where}
       ORDER BY tsk.TaskID DESC`,
      params,
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}