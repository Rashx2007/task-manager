// app/api/load-data/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  loadWorkHoursFromSettings,
  calculateInitialDueDateTime,
  getRoundedUpTime,
  checkIfTemporaryTaskExists,
  formatSqlDateTime,
} from '@/lib/schedule-logic';

export async function GET() {
  try {
    console.log('🔄 LoadData API called');

    // ۱. بررسی وجود کارهای موقت
    const tempTasks = await checkIfTemporaryTaskExists();
    if (tempTasks.length > 0) {
      console.log('📌 Temporary tasks found:', tempTasks.length);
      return NextResponse.json({
        success: true,
        data: tempTasks,
        type: 'temporary',
        expFixSts: 0,
      });
    }

    // ۲. بارگذاری تنظیمات ساعات کاری
    const workHours = await loadWorkHoursFromSettings();
    let calculatedDueDateTime;

    if (!workHours.ignoreTimeSettings) {
      calculatedDueDateTime = calculateInitialDueDateTime(new Date(), workHours);
    } else {
      calculatedDueDateTime = getRoundedUpTime(new Date());
    }

    console.log('⏰ Calculated DueDateTime:', calculatedDueDateTime);

    // ۳. پیدا کردن کارهای با زمان انجام ثابت و تاریخ گذشته
    const fixedTasks = await query(`
      SELECT DISTINCT TD.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID = assettsk.TaskID
      LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      WHERE (tsk.Complited < 1) AND (TD.Priorities = N'زمان انجام ثابت') AND (TD.DueDateTime < ?)
      ORDER BY TD.DueDateTime
    `, [formatSqlDateTime(calculatedDueDateTime)]);

    if (fixedTasks.length > 0) {
      console.log('⚠️ Fixed time tasks found:', fixedTasks.length);
      return NextResponse.json({
        success: true,
        data: fixedTasks,
        type: 'fixed',
        expFixSts: 1,
      });
    }

    // ۴. ---
  

    // ۵. بارگذاری کارهای روزمره
    const dailyTasks = await query(`
      SELECT DISTINCT tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, asset.Location,
        tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Submit_Date, TD.Priorities, TD.DueDateTime, TD.EndDateTime
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl assettsk ON tsk.TaskID = assettsk.TaskID
      LEFT JOIN Asset_2_tbl asset ON assettsk.AssetID = asset.AssetID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      WHERE (tsk.Complited < 1) AND (CAST(TD.DueDateTime AS DATE) <= CAST(GETDATE() AS DATE))
      ORDER BY TD.DueDateTime
    `);

    console.log('✅ Daily tasks loaded:', dailyTasks.length);

    return NextResponse.json({
      success: true,
      data: dailyTasks,
      type: 'daily',
      expFixSts: 0,
    });
  } catch (error) {
    console.error('❌ LoadData error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}