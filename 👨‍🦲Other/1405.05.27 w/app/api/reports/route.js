import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const pad = (n) => String(n).padStart(2, '0');
function toRange(iso, endOfDay) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return endOfDay
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 23:59:59`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'tasks_list';
    const s = toRange(searchParams.get('start'), false);
    const e = toRange(searchParams.get('end'), true);
    let rows = [];

    if (type === 'tasks_list') {
      rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location, asset.Block, asset.Floor,
        tsk.TaskTtl, tsk.Descriptions, TD.Priorities,
        FORMAT(TD.DueDateTime,'HH:mm  yyyy/MM/dd','fa') AS DueFa, FORMAT(TD.Submit_Date,'HH:mm  yyyy/MM/dd','fa') AS SubmitFa
        FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID
        LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        WHERE (tsk.Complited<1 AND CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE))
        ORDER BY TD.Priorities, TD.DueDateTime`);
    } else if (type === 'fixed_tasks') {
      rows = await query(`SELECT TD.TaskID, TD.Priorities, TD.Durationtime,
        FORMAT(TD.DueDateTime,'yyyy/MM/dd  HH:mm','fa') AS StartFa, FORMAT(TD.EndDateTime,'yyyy/MM/dd  HH:mm','fa') AS EndFa, tsk.Complited
        FROM TimeDate_tbl TD LEFT JOIN Tsk_tbl tsk ON TD.TaskID=tsk.TaskID
        WHERE (tsk.Complited=0) AND (TD.Priorities=N'زمان انجام ثابت') ORDER BY TD.DueDateTime`);
    } else if (type === 'requests_undone') {
      rows = await query(`SELECT pur.TaskID, pur.RequestNumber, pur.RegisterNumber, asset.Location, tsk.TaskTtl, tsk.Descriptions,
        FORMAT(pur.RequestDate,'yyyy/MM/dd','fa') AS RequestFa, pur.Buyer, pur.Status, FORMAT(pur.FundingDate,'yyyy/MM/dd','fa') AS FundingFa,
        tsk.Complited, TD.Priorities
        FROM Purchase_Request_tbl pur LEFT JOIN Tsk_tbl tsk ON pur.TaskID=tsk.TaskID
        LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID
        LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        WHERE pur.RequestNumber != 0 AND pur.Status != N'نهایی' AND pur.Status != N'لغو'
        ORDER BY TD.Priorities, pur.RegisterNumber`);
    } else if (type === 'requests_done') {
      rows = await query(`SELECT pur.TaskID, pur.RequestNumber, pur.RegisterNumber, tsk.TaskTtl, tsk.Descriptions,
        FORMAT(pur.RequestDate,'yyyy/MM/dd','fa') AS RequestFa, pur.Buyer, pur.Status, FORMAT(pur.FundingDate,'yyyy/MM/dd','fa') AS FundingFa, tsk.Complited
        FROM Purchase_Request_tbl pur LEFT JOIN Tsk_tbl tsk ON pur.TaskID=tsk.TaskID
        WHERE (pur.Status = N'نهایی') ORDER BY pur.RegisterNumber`);
    } else if (type === 'without_request') {
      rows = await query(`SELECT tsk.TaskID, tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Priorities
        FROM Tsk_tbl tsk LEFT JOIN Purchase_Request_tbl pur ON tsk.TaskID=pur.TaskID LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        WHERE (pur.TaskID IS NULL AND tsk.Complited=0) OR (pur.RequestNumber=0 AND tsk.Complited=0)
        ORDER BY TD.Priorities, tsk.TaskID`);
    } else if (type === 'undone_tasks' || type === 'done_tasks') {
      const cond = type === 'done_tasks' ? 1 : 0;
      rows = await query(`SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        tsk.TaskTtl, tsk.Descriptions, TD.Priorities,
        FORMAT(TD.DueDateTime,'yyyy/MM/dd','fa') AS DueFa, FORMAT(TD.EndDateTime,'yyyy/MM/dd','fa') AS EndFa
        FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID
        LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        WHERE tsk.Complited = ${cond} ORDER BY TD.DueDateTime`);
    } else if (type === 'tasks_functor') {
      rows = await query(`SELECT DISTINCT tsk.TaskID, Pr.PersonName AS Functor, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        asset.Block, asset.Floor, TD.Priorities, tsk.TaskTtl, tsk.Descriptions,
        FORMAT(TD.DueDateTime,'HH:mm  yyyy/MM/dd','fa') AS DueFa, FORMAT(TD.Submit_Date,'HH:mm  yyyy/MM/dd','fa') AS SubmitFa
        FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID
        LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        LEFT JOIN ApplicantFunctor_tbl AF ON AF.TaskID=tsk.TaskID LEFT JOIN Persons_tbl Pr ON AF.FunctorID = CAST(Pr.PersonID AS NVARCHAR(20))
        WHERE tsk.Complited<1 ORDER BY TD.Priorities, Pr.PersonName, TD.DueDateTime`);
    } else if (type === 'daily') {
      rows = await query(`SELECT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location, tsk.TaskTtl, FL.Description,
        FORMAT(FL.DueDateTime,'yyyy/MM/dd','fa') AS DoneFa
        FROM Follow_tbl FL LEFT JOIN Tsk_tbl tsk ON FL.TaskID=tsk.TaskID
        LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID
        WHERE (FL.DueDateTime >= ?) AND (FL.DueDateTime < ?) ORDER BY tsk.TaskID DESC, FL.DueDateTime`, [s, e]);
    } else if (type === 'considerable') {
      rows = await query(`SELECT DISTINCT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        tsk.TaskTtl, FORMAT(TD.Submit_Date,'yyyy/MM/dd','fa') AS SubmitFa, FORMAT(TD.Finish_DateTime,'yyyy/MM/dd','fa') AS FinishFa, tsk.Complited
        FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID
        LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        WHERE tsk.Complited=1 AND (tsk.IsConsiderableAction LIKE N'%اقدام%' OR tsk.IsConsiderableAction LIKE N'%پروژه%')
        AND (TD.Finish_DateTime >= ?) AND (TD.Finish_DateTime <= ?) ORDER BY TD.Submit_Date`, [s, e]);
    } else if (type === 'all_by_date' || type === 'finished_by_date') {
      const cond = type === 'finished_by_date' ? 'AND tsk.Complited=1' : '';
      rows = await query(`SELECT DISTINCT tsk.TaskID, tsk.IsConsiderableAction, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        tsk.TaskTtl, tsk.Descriptions, FORMAT(TD.Submit_Date,'yyyy/MM/dd','fa') AS SubmitFa, FORMAT(TD.Finish_DateTime,'HH:mm  yyyy/MM/dd','fa') AS FinishFa, tsk.Complited
        FROM Tsk_tbl tsk LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID=assettsk.TaskID
        LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID=asset.AssetID LEFT JOIN TimeDate_tbl TD ON TD.TaskID=tsk.TaskID
        WHERE (TD.Finish_DateTime >= ?) AND (TD.Finish_DateTime <= ?) ${cond} ORDER BY TD.Submit_Date`, [s, e]);
    }

    return NextResponse.json({ success: true, rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}