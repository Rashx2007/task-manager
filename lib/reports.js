// lib/reports.js
// توابع کوئری و تولید گزارش‌ها مطابق Form1.cs و Form1_Logic.cs

import { query } from '@/lib/db';
import { fmtFaDT, fmtFaDateOnly } from './shamsi';

// ========== گزارش‌های Text ==========

// گزارش لیست کارها (Task report)
export async function getTaskListText() {
  const rows = await query(`
    SELECT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
           tsk.TaskTtl, tsk.Descriptions
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited < 1
    ORDER BY TD.DueDateTime
  `);
  const lines = [];
  rows.forEach((r, i) => {
    lines.push(`ردیف : ${i + 1}`);
    lines.push(`کد : ${r.TaskID}`);
    lines.push(`دستگاه/مجموعه : ${r.AssetName || ''}`);
    lines.push(`شماره : ${r.AssetNumber || ''}`);
    lines.push(`ساختمان : ${r.Building || ''}`);
    lines.push(`محل : ${r.Location || ''}`);
    lines.push(`موضوع : ${r.TaskTtl || ''}`);
    lines.push(`توضیحات : ${r.Descriptions || ''}`);
    lines.push('---------------------------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش درخواست‌ها (Request report)
export async function getRequestText() {
  const rows = await query(`
    SELECT pur.TaskID, pur.RequestNumber, pur.RegisterNumber,
           tsk.TaskTtl, tsk.Descriptions, pur.RequestDate
    FROM Purchase_Request_tbl pur
    LEFT JOIN Tsk_tbl tsk ON pur.TaskID = tsk.TaskID
    WHERE tsk.Complited = 0
    ORDER BY pur.RegisterNumber
  `);
  const lines = [];
  rows.forEach(r => {
    lines.push(`کد : ${r.TaskID}\t`);
    lines.push(`شماره درخواست : ${r.RequestNumber || ''}\t`);
    lines.push(`شماره ثبت : ${r.RegisterNumber || ''}\t`);
    lines.push(`موضوع : ${r.TaskTtl || ''}\t`);
    lines.push(`شرح : ${r.Descriptions || ''}\t`);
    lines.push(`تاریخ درخواست : ${fmtFaDateOnly(r.RequestDate)}`);
    lines.push('');
    lines.push('---------------------------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش کار روزانه (Daily Tasks report)
export async function getDailyReportText(start, end) {
  const rows = await query(`
    SELECT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
           tsk.TaskTtl, FL.Description, FL.DueDateTime
    FROM Follow_tbl FL
    LEFT JOIN Tsk_tbl tsk ON FL.TaskID = tsk.TaskID
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    WHERE FL.DueDateTime >= ? AND FL.DueDateTime < ?
    ORDER BY tsk.TaskID DESC, FL.DueDateTime
  `, [start, end]);
  const lines = [];
  rows.forEach(r => {
    lines.push(`کد : ${r.TaskID}\t|||||`);
    lines.push(`دستگاه : ${r.AssetName || ''}\t|||||`);
    lines.push(`شماره دستگاه : ${r.AssetNumber || ''}\t|||||`);
    lines.push(`ساختمان : ${r.Building || ''}\t|||||`);
    lines.push(`محل : ${r.Location || ''}\t|||||`);
    lines.push(`عنوان : ${r.TaskTtl || ''}\t|||||`);
    lines.push(`توضیحات : ${r.Description || ''}\t|||||`);
    lines.push(`تاریخ انجام : ${fmtFaDateOnly(r.DueDateTime)}\t|||||`);
    lines.push('');
    lines.push('---------------------------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش اقدامات و پروژه‌ها (Considerable Tasks)
export async function getConsiderableReportText(start, end, withTaskId = false) {
  const rows = await query(`
    SELECT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber,
           asset.Building, asset.Location, tsk.TaskTtl, TD.Submit_Date, TD.Finish_DateTime,
           tsk.Complited
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 1
      AND (tsk.IsConsiderableAction LIKE N'%اقدام%' OR tsk.IsConsiderableAction LIKE N'%پروژه%')
      AND TD.Finish_DateTime >= ? AND TD.Finish_DateTime <= ?
    ORDER BY TD.Submit_Date
  `, [start, end]);
  const lines = [];
  rows.forEach(r => {
    if (withTaskId) {
      lines.push(`کد : ${r.TaskID}\t🖋️`);
      lines.push(`اقدام/پروژه : ${r.IsConsiderableAction || ''}\t✔️`);
      lines.push(`عنوان : ${r.TaskTtl || ''}\t🚩`);
      lines.push(`دستگاه : ${r.AssetName || ''}\t🚩`);
      lines.push(`شماره دستگاه : ${r.AssetNumber || ''}\t✍️`);
      lines.push(`ساختمان : ${r.Building || ''}\t🔧`);
      lines.push(`محل : ${r.Location || ''}\t🖋️`);
      lines.push(`زمان ثبت : ${fmtFaDT(r.Submit_Date)}\t`);
      lines.push(`تاریخ اتمام : ${fmtFaDateOnly(r.Finish_DateTime)}\t`);
      lines.push(`وضعیت اتمام کار : ${r.Complited}\t✔️`);
    } else {
      lines.push(`${fmtFaDateOnly(r.Finish_DateTime)}\t`);
      lines.push(`${r.TaskTtl || ''}\t،`);
      lines.push(`${r.AssetName || ''}\t`);
      lines.push(`شماره : ${r.AssetNumber || ''}\t`);
      lines.push(`ساختمان : ${r.Building || ''}\t`);
      lines.push(`در : ${r.Location || ''}\t`);
    }
    lines.push('');
    lines.push('-------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش کلی کارها بر اساس تاریخ (All Tasks)
export async function getAllTasksReportText(start, end) {
  const rows = await query(`
    SELECT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber,
           asset.Building, asset.Location, tsk.TaskTtl, tsk.Descriptions,
           TD.Submit_Date, TD.Finish_DateTime, tsk.Complited
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE TD.Finish_DateTime >= ? AND TD.Finish_DateTime <= ?
    ORDER BY TD.Submit_Date
  `, [start, end]);
  const lines = [];
  rows.forEach(r => {
    lines.push(`کد : ${r.TaskID}\t🖋️`);
    lines.push(`اقدام/پروژه : ${r.IsConsiderableAction || ''}\t✔️`);
    lines.push(`دستگاه : ${r.AssetName || ''}\t🚩`);
    lines.push(`شماره دستگاه : ${r.AssetNumber || ''}\t✍️`);
    lines.push(`ساختمان : ${r.Building || ''}\t🔧`);
    lines.push(`محل : ${r.Location || ''}\t🖋️`);
    lines.push(`عنوان : ${r.TaskTtl || ''}\t🚩`);
    lines.push(`شرح : ${r.Descriptions || ''}\t🖋️`);
    lines.push(`تاریخ ثبت : ${fmtFaDT(r.Submit_Date)}\t✍️`);
    lines.push(`تاریخ انجام : ${fmtFaDT(r.Finish_DateTime)}\t🔧`);
    lines.push(`وضعیت اتمام کار : ${r.Complited}\t✔️`);
    lines.push('');
    lines.push('--------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش کارهای انجام شده بر اساس تاریخ (Finished Tasks)
export async function getFinishedTasksReportText(start, end) {
  const rows = await query(`
    SELECT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber,
           asset.Building, asset.Location, tsk.TaskTtl, tsk.Descriptions,
           TD.Submit_Date, TD.Finish_DateTime, tsk.Complited
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 1
      AND TD.Finish_DateTime >= ? AND TD.Finish_DateTime <= ?
    ORDER BY TD.Submit_Date
  `, [start, end]);
  const lines = [];
  rows.forEach(r => {
    lines.push(`کد : ${r.TaskID}\t🖋️`);
    lines.push(`اقدام/پروژه : ${r.IsConsiderableAction || ''}\t✔️`);
    lines.push(`دستگاه : ${r.AssetName || ''}\t🚩`);
    lines.push(`شماره دستگاه : ${r.AssetNumber || ''}\t✍️`);
    lines.push(`ساختمان : ${r.Building || ''}\t🔧`);
    lines.push(`محل : ${r.Location || ''}\t🖋️`);
    lines.push(`عنوان : ${r.TaskTtl || ''}\t🚩`);
    lines.push(`شرح : ${r.Descriptions || ''}\t🖋️`);
    lines.push(`تاریخ ثبت : ${fmtFaDT(r.Submit_Date)}\t✍️`);
    lines.push(`تاریخ اتمام : ${fmtFaDT(r.Finish_DateTime)}\t🔧`);
    lines.push(`وضعیت اتمام کار : ${r.Complited}\t✔️`);
    lines.push('');
    lines.push('------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش لیست کارهای ثابت (Fixed Tasks List)
export async function getFixedTasksListText() {
  const rows = await query(`
    SELECT TD.TaskID, tsk.TaskTtl, TD.Priorities, TD.Durationtime,
           TD.DueDateTime, TD.EndDateTime, tsk.Complited
    FROM TimeDate_tbl TD
    LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 0 AND TD.Priorities = N'زمان انجام ثابت'
    ORDER BY TD.DueDateTime
  `);
  const lines = [];
  lines.push('------------------------------------تداخل با کار دارای زمان ثابت------------------------------------');
  lines.push('---------------------------------------------------------------------------------------------------------------------------------------');
  lines.push('');
  rows.forEach(r => {
    lines.push(`کد : ${r.TaskID}\t`);
    lines.push(`موضوع : ${r.TaskTtl || ''}\t`);
    lines.push(`الویت : ${r.Priorities || ''}\t`);
    lines.push(`طول بازه : ${r.Durationtime || ''}\t`);
    lines.push(`زمان شروع : ${fmtFaDT(r.DueDateTime)}\t`);
    lines.push(`زمان اتمام : ${fmtFaDT(r.EndDateTime)}\t`);
    lines.push(`وضعیت : ${r.Complited}`);
    lines.push('');
    lines.push('---------------------------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// گزارش Follow Description برای یک TaskID
export async function getFollowDescriptionText(taskId) {
  const rows = await query(`
    SELECT Description, DueDateTime FROM Follow_tbl
    WHERE TaskID = ?
    ORDER BY DueDateTime
  `, [taskId]);
  const lines = [];
  rows.forEach(r => {
    lines.push(`شرح : ${r.Description || ''}\t|||||`);
    lines.push(`تاریخ : ${fmtFaDT(r.DueDateTime)}\t|||||`);
    lines.push('');
    lines.push('---------------------------------------------------------------------------------------------------------------------------------------');
    lines.push('');
  });
  return lines.join('\n');
}

// ========== کوئری‌های Excel (چند شیتی) ==========

export async function getUndoneRequestsData() {
  return await query(`
    SELECT DISTINCT pur.RequestID, pur.TaskID, pur.RequestNumber, pur.RegisterNumber,
           ISNULL(asset.Location, '') AS Location,
           ISNULL(tsk.TaskTtl, '(بدون کار مرتبط - TaskID نامعتبر)') AS TaskTtl,
           ISNULL(tsk.Descriptions, '') AS Descriptions,
           pur.RequestDate, pur.Buyer, pur.Status, pur.FundingDate,
           tsk.Complited, TD.Priorities
    FROM Purchase_Request_tbl pur
    LEFT JOIN Tsk_tbl tsk ON pur.TaskID = tsk.TaskID
    OUTER APPLY (
      SELECT TOP 1 a.Location
      FROM Asset_Task_tbl at2
      INNER JOIN Asset_2_tbl a ON at2.AssetID = a.AssetID
      WHERE at2.TaskID = pur.TaskID
    ) asset
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = pur.TaskID
    WHERE pur.RequestNumber != 0 AND pur.Status != N'نهایی' AND pur.Status != N'لغو'
    ORDER BY TD.Priorities, pur.RegisterNumber
  `);
}

export async function getDoneRequestsData() {
  return await query(`
    SELECT pur.RequestID, pur.TaskID, pur.RequestNumber, pur.RegisterNumber,
           tsk.TaskTtl, tsk.Descriptions, pur.RequestDate, pur.Buyer,
           pur.Status, pur.FundingDate, tsk.Complited
    FROM Purchase_Request_tbl pur
    LEFT JOIN Tsk_tbl tsk ON pur.TaskID = tsk.TaskID
    WHERE pur.Status = N'نهایی'
    ORDER BY pur.RegisterNumber
  `);
}

export async function getTasksWithoutRequestData() {
  return await query(`
    SELECT tsk.TaskID, tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Priorities
    FROM Tsk_tbl tsk
    LEFT JOIN Purchase_Request_tbl pur ON tsk.TaskID = pur.TaskID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE (pur.TaskID IS NULL AND tsk.Complited = 0)
       OR (pur.RequestNumber = 0 AND tsk.Complited = 0)
    ORDER BY TD.Priorities, tsk.TaskID
  `);
}

export async function getUndoneTasksData() {
  return await query(`
    SELECT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building,
           asset.Location, tsk.TaskTtl, tsk.Descriptions, TD.Priorities,
           TD.DueDateTime, TD.EndDateTime
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 0
    ORDER BY TD.Priorities, TD.DueDateTime
  `);
}

export async function getDoneTasksData() {
  return await query(`
    SELECT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building,
           asset.Location, tsk.TaskTtl, tsk.Descriptions, TD.Priorities,
           TD.DueDateTime, TD.EndDateTime
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 1
    ORDER BY TD.DueDateTime
  `);
}

export async function getTasksListData() {
  return await query(`
    SELECT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building,
           asset.Location, asset.Block, asset.Floor,
           tsk.TaskTtl, tsk.Descriptions, TD.Priorities,
           TD.DueDateTime, tsk.Complited
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited < 1 AND CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE)
    ORDER BY TD.DueDateTime
  `);
}

export async function getTasksAndFunctorData() {
  return await query(`
    SELECT tsk.TaskID, Pr.PersonName, asset.AssetName, asset.AssetNumber,
           asset.Building, asset.Location, asset.Block, asset.Floor, TD.Priorities,
           tsk.TaskTtl, tsk.Descriptions, TD.DueDateTime, TD.Submit_Date
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    LEFT JOIN ApplicantFunctor_tbl AF ON AF.TaskID = tsk.TaskID
    LEFT JOIN Persons_tbl Pr ON AF.FunctorID = Pr.PersonID
    WHERE tsk.Complited < 1
    ORDER BY TD.Priorities, Pr.PersonName, TD.DueDateTime
  `);
}

export async function getAllTasksExcelByDate(start, end) {
  return await query(`
    SELECT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber,
           asset.Building, asset.Location, tsk.TaskTtl, tsk.Descriptions,
           TD.Submit_Date, TD.Finish_DateTime, tsk.Complited
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE TD.Finish_DateTime >= ? AND TD.Finish_DateTime <= ?
    ORDER BY TD.Submit_Date
  `, [start, end]);
}

export async function getFinishedTasksExcelByDate(start, end) {
  return await query(`
    SELECT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber,
           asset.Building, asset.Location, tsk.TaskTtl, tsk.Descriptions,
           TD.Submit_Date, TD.Finish_DateTime, tsk.Complited
    FROM Tsk_tbl tsk
    LEFT JOIN Asset_Task_tbl at2 ON tsk.TaskID = at2.TaskID
    LEFT JOIN Asset_2_tbl asset ON at2.AssetID = asset.AssetID
    LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 1
      AND TD.Finish_DateTime >= ? AND TD.Finish_DateTime <= ?
    ORDER BY TD.Submit_Date
  `, [start, end]);
}

// ✅ گزارش کارهای انجام‌شده بر اساس تاریخ و دستگاه (معادل Search_By_Date دسکتاپ)
export async function getAssetDateTasks(start, end, assetName) {
  const params = [start, end];
  let assetCond = "";
  if (assetName) {
    assetCond = " AND asset.AssetName LIKE ?";
    params.push(`%${assetName}%`);
  }
  return await query(
    `SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber,
       asset.Building, asset.Location, asset.Block, asset.Floor,
       tsk.TaskTtl, tsk.Descriptions, TD.Finish_DateTime, tsk.Complited
     FROM Tsk_tbl tsk
     LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID = assettsk.TaskID
     LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID = asset.AssetID
     LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
     WHERE (TD.Finish_DateTime >= CONVERT(DATETIME, ?, 102))
       AND (TD.Finish_DateTime <= CONVERT(DATETIME, ?, 102))
       ${assetCond}
     ORDER BY TD.Finish_DateTime`,
    params,
  );
}

export async function getAllFixedTasks() {
  return await query(`
    SELECT TD.TaskID, tsk.TaskTtl, TD.Priorities, TD.Durationtime,
           TD.DueDateTime, TD.EndDateTime, tsk.Complited
    FROM TimeDate_tbl TD
    LEFT JOIN Tsk_tbl tsk ON TD.TaskID = tsk.TaskID
    WHERE tsk.Complited = 0 AND TD.Priorities = N'زمان انجام ثابت'
    ORDER BY TD.DueDateTime
  `);
}