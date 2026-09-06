import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ✅ نرمال‌سازی فارسی سمت سرور (فاز ۱)
const normalizeFa = (s) => String(s == null ? '' : s)
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();

// ✅ REPLACE زنجیره‌ای T-SQL برای نرمال‌سازی داخل LIKE (فاز ۱)
const normCol = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')`;

export async function POST(request) {
  try {
    const b = (await request.json()) || {};
    const conds = [];
    const params = [];
    const like = (col, val) => { conds.push(`(${normCol(col)} LIKE ?)`); params.push(`%${normalizeFa(val)}%`); };

    // ✅ فاز ۲: جستجوی سریع یکپارچه (OR روی چند ستون کلیدی)
    if (String(b.quick || '').trim()) {
      const q = normalizeFa(b.quick);
      const qNum = /^\d+$/.test(q) ? Number(q) : 0;
      conds.push(`(${normCol('tsk.TaskTtl')} LIKE ? OR ${normCol('tsk.Descriptions')} LIKE ? OR ${normCol('asset.AssetName')} LIKE ? OR ${normCol('asset.PropertyCode')} LIKE ? OR ${normCol('asset.Building')} LIKE ? OR ${normCol('asset.MapTag')} LIKE ? OR ${normCol('pApp.PersonName')} LIKE ? OR ${normCol('pFun.PersonName')} LIKE ? OR asset.AssetNumber = ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, qNum);
    }

    if (b.status === 'current') conds.push('(tsk.Complited < 1)');
    else if (b.status === 'completed') conds.push('(tsk.Complited = 1)');

    if (String(b.taskID || '').trim()) { conds.push('(tsk.TaskID = ?)'); params.push(Number(b.taskID)); }
    if (String(b.requestNumber || '').trim()) {
      conds.push('(tsk.RequestNumber = ? OR tsk.RegisterNumber = ?)');
      params.push(Number(b.requestNumber), Number(b.requestNumber));
    }
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

    // ✅ فیلترهای اختیاری فاز ۱
    if (b.onlyFixed === true) conds.push('(TD.FixedDueTime = 1)');
    if (b.onlyTemp === true) conds.push(`(tsk.Temporary = 1 OR tsk.Priorities IS NULL OR LTRIM(RTRIM(ISNULL(tsk.Priorities, N''))) = N'')`);

    // ✅ فاز ۲: facet filter (کلیک روی facet)
    if (String(b.facetBuilding || '').trim()) like('asset.Building', b.facetBuilding);
    if (String(b.facetDeviceType || '').trim()) like('asset.AssetName', b.facetDeviceType);
    if (String(b.facetPriority || '').trim()) { conds.push('(TD.Priorities = ?)'); params.push(String(b.facetPriority)); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor, asset.Entrance, asset.Location,
      tsk.TaskTtl, tsk.Descriptions, tsk.Complited, atk.AssetID,
      TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime,
      pApp.PersonName AS ApplicantName, pFun.PersonName AS FunctorName
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      LEFT JOIN ApplicantFunctor_tbl af ON af.TaskID = tsk.TaskID
      LEFT JOIN Persons_tbl pApp ON pApp.PersonID = af.ApplicantID
      LEFT JOIN Persons_tbl pFun ON pFun.PersonID = af.FunctorID
      ${where}
      ORDER BY TD.DueDateTime, tsk.TaskID`, params);

    const resp = { success: true, data: rows };

    // ✅ فاز ۲: شمارنده‌ها و facetها (در صورت withCounts)
    if (b.withCounts) {
      // حذف فیلتر status از WHERE برای شمارش در هر سه وضعیت
      const baseWhere = where
        .replace(/\(tsk\.Complited\s*[<>=]+\s*\d+\)\s*AND\s*/g, '')
        .replace(/\s*AND\s*\(tsk\.Complited\s*[<>=]+\s*\d+\)/g, '');
      const baseClause = baseWhere.trim() ? baseWhere : '';
      const baseFrom = `FROM Tsk_tbl tsk
        LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
        LEFT JOIN Asset_2_tbl asset ON atk.AssetID = asset.AssetID
        LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
        LEFT JOIN ApplicantFunctor_tbl af ON af.TaskID = tsk.TaskID
        LEFT JOIN Persons_tbl pApp ON pApp.PersonID = af.ApplicantID
        LEFT JOIN Persons_tbl pFun ON pFun.PersonID = af.FunctorID`;
      try {
        const counts = await query(`SELECT
          SUM(CASE WHEN tsk.Complited < 1 THEN 1 ELSE 0 END) AS currentCount,
          SUM(CASE WHEN tsk.Complited = 1 THEN 1 ELSE 0 END) AS completedCount,
          COUNT(*) AS allCount
          ${baseFrom} ${baseClause}`, params);
        resp.counts = counts[0] || { currentCount: 0, completedCount: 0, allCount: 0 };
      } catch (err) { resp.counts = { currentCount: 0, completedCount: 0, allCount: 0 }; }

      try {
        const facetRows = await query(`SELECT asset.Building, asset.AssetName AS DeviceType, TD.Priorities ${baseFrom} ${baseClause}`, params);
        const bmap = {}, dmap = {}, pmap = {};
        for (const r of facetRows) {
          if (r.Building) bmap[r.Building] = (bmap[r.Building] || 0) + 1;
          if (r.DeviceType) dmap[r.DeviceType] = (dmap[r.DeviceType] || 0) + 1;
          if (r.Priorities) pmap[r.Priorities] = (pmap[r.Priorities] || 0) + 1;
        }
        const toArr = (m) => Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        resp.facets = { buildings: toArr(bmap), deviceTypes: toArr(dmap), priorities: toArr(pmap) };
      } catch (err) { resp.facets = { buildings: [], deviceTypes: [], priorities: [] }; }
    }

    return NextResponse.json(resp);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}