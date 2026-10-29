import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { parseTaskId } from '@/lib/task-inspection';

const reply = (body, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

// عمداً فقط GET دارد؛ این مسیر هیچ عملیات ذخیره، حذف یا تغییر وضعیت انجام نمی‌دهد.
export async function GET(request) {
  const url = new URL(request.url);
  const taskId = parseTaskId(url.searchParams.get('taskId'));
  if (!taskId) return reply({ success: false, error: 'کد کار معتبر نیست.' }, 400);
  try {
    const rows = await query(`SELECT tsk.TaskID, tsk.TaskTtl, tsk.Descriptions, tsk.Complited,
      COALESCE(TD.Priorities, tsk.Priorities) AS Priorities,
      TD.Submit_Date, TD.DueDateTime, TD.EndDateTime,
      COALESCE(atk.AssetID, tsk.AssetID) AS AssetID,
      asset.AssetName, asset.AssetNumber, asset.Building, asset.Block, asset.Floor,
      asset.Entrance, asset.Location, asset.MechSystem,
      pApp.PersonName AS ApplicantName, pFun.PersonName AS FunctorName
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON atk.TaskID = tsk.TaskID
      LEFT JOIN Asset_2_tbl asset ON asset.AssetID = COALESCE(atk.AssetID, tsk.AssetID)
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      LEFT JOIN ApplicantFunctor_tbl af ON af.TaskID = tsk.TaskID
      LEFT JOIN Persons_tbl pApp ON pApp.PersonID = COALESCE(af.ApplicantID, tsk.ApplicantID)
      LEFT JOIN Persons_tbl pFun ON pFun.PersonID = COALESCE(af.FunctorID, tsk.FunctorID)
      WHERE tsk.TaskID = ? ORDER BY TD.DueDateTime DESC`, [taskId]);
    if (!rows.length) return reply({ success: false, error: 'کار موردنظر پیدا نشد.' }, 404);
    // RequestID is an internal key, not the displayed request number.
    // Preserve every registered number belonging to this task; do not guess one.
    const requests = await query(`SELECT RequestNumber, RegisterNumber FROM Purchase_Request_tbl
      WHERE TaskID = ? ORDER BY RequestID DESC`, [taskId]);
    const requestNumbers = [...new Set(requests.map((row) => row.RequestNumber)
      .filter((value) => value != null && String(value).trim() !== '').map(String))];
    const registerNumbers = [...new Set(requests.map((row) => row.RegisterNumber)
      .filter((value) => value != null && String(value).trim() !== '').map(String))];
    const task = { ...rows[0], RequestNumber: requestNumbers.join('، ') || null,
      RegisterNumber: registerNumbers.join('، ') || null };
    const followups = url.searchParams.get('details') === '1'
      ? await query(`SELECT FollowID, TaskID, Description, DueDateTime, EndDateTime, Duration
          FROM Follow_tbl WHERE TaskID = ? ORDER BY DueDateTime DESC, FollowID DESC`, [taskId])
      : [];
    return reply({ success: true, data: { task, followups } });
  } catch {
    return reply({ success: false, error: 'دریافت اطلاعات کار ناموفق بود؛ هیچ تغییری ذخیره نشد.' }, 500);
  }
}
