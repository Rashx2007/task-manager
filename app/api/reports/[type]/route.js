// app/api/reports/[type]/route.js
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import * as R from '@/lib/reports';
import { makeTextFileName, makeExcelFileName } from '@/lib/shamsi';
import * as S from '@/lib/excel-styles';

export async function GET(request, { params }) {
  // ✅ در Next 15+ آبجکت params یک Promise است و باید await شود
  const { type } = await params;
  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const taskId = url.searchParams.get('taskId');
  const withTaskId = url.searchParams.get('withTaskId') === '1';

  try {
    // ============= گزارش‌های Text =============
    if (type === 'task-list-text') {
      const content = await R.getTaskListText();
      return NextResponse.json({ success: true, fileName: makeTextFileName('Task report'), content, mime: 'text/plain' });
    }
    if (type === 'request-text') {
      const content = await R.getRequestText();
      return NextResponse.json({ success: true, fileName: makeTextFileName('Request report'), content, mime: 'text/plain' });
    }
    if (type === 'daily-text') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const content = await R.getDailyReportText(start, end);
      return NextResponse.json({ success: true, fileName: makeTextFileName('Daily Tasks report'), content, mime: 'text/plain' });
    }
    if (type === 'considerable-text') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const content = await R.getConsiderableReportText(start, end, withTaskId);
      return NextResponse.json({ success: true, fileName: makeTextFileName('Considerable Tasks report'), content, mime: 'text/plain' });
    }
    if (type === 'all-tasks-text') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const content = await R.getAllTasksReportText(start, end);
      return NextResponse.json({ success: true, fileName: makeTextFileName('All Tasks report'), content, mime: 'text/plain' });
    }
    if (type === 'finished-tasks-text') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const content = await R.getFinishedTasksReportText(start, end);
      return NextResponse.json({ success: true, fileName: makeTextFileName('Finished Tasks report'), content, mime: 'text/plain' });
    }
    if (type === 'fixed-tasks-text') {
      const content = await R.getFixedTasksListText();
      return NextResponse.json({ success: true, fileName: makeTextFileName('Fixed Tasks List'), content, mime: 'text/plain' });
    }
    if (type === 'follow-description-text') {
      if (!taskId) return NextResponse.json({ success: false, error: 'کد کار لازم است.' }, { status: 400 });
      const content = await R.getFollowDescriptionText(Number(taskId));
      return NextResponse.json({ success: true, fileName: 'Follow Description report.txt', content, mime: 'text/plain' });
    }

    // ============= گزارش‌های Excel =============
    if (type === 'task-list-excel') {
      const data = await R.getTasksListData();
      const wb = new ExcelJS.Workbook();
      S.buildStyledSheet(wb, 'لیست کارها',
        ['کد', 'دستگاه/مجموعه', 'شماره', 'ساختمان', 'محل', 'بلوک', 'طبقه', 'موضوع', 'توضیحات', 'الویت', 'زمان', 'وضعیت'],
        data.map(r => [r.TaskID, r.AssetName, r.AssetNumber, r.Building, r.Location, r.Block, r.Floor, r.TaskTtl, r.Descriptions, r.Priorities, toShamsiDateTimeString(r.DueDateTime), r.Complited]),
        {
          tabColor: 'FFFF0000', headerFill: S.FILL_PINK_HEADER, oddFill: S.FILL_LIGHT_PINK,
          widths: [10, 27, 8, 16, 25, 6, 6, 50, 100, 16, 16, 16],
          hiddenCols: [1, 9],
          freeze: { x: 1, y: 1 },
        });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('Tasks List'),
        },
      });
    }

    if (type === 'requests-excel') {
      const [undoneReq, doneReq, withoutReq, undoneTask, doneTask] = await Promise.all([
        R.getUndoneRequestsData(), R.getDoneRequestsData(), R.getTasksWithoutRequestData(),
        R.getUndoneTasksData(), R.getDoneTasksData(),
      ]);
      const wb = new ExcelJS.Workbook();

      // شیت ۱: خریدهای انجام‌نشده
      S.buildStyledSheet(wb, 'خریدهای انجام‌نشده',
        ['کد درخواست', 'کد کار', 'شماره درخواست', 'شماره ثبت', 'محل', 'موضوع', 'شرح', 'تاریخ درخواست', 'کارپرداز', 'وضعیت', 'تاریخ تأمین اعتبار', 'وضعیت اتمام', 'الویت'],
        undoneReq.map(r => [r.RequestID, r.TaskID, r.RequestNumber, r.RegisterNumber, r.Location, r.TaskTtl, r.Descriptions, toShamsiString(r.RequestDate), r.Buyer, r.Status, toShamsiString(r.FundingDate), r.Complited, r.Priorities]),
        { tabColor: 'FFFF0000', headerFill: S.FILL_PINK_HEADER, oddFill: S.FILL_LIGHT_PINK, widths: [10, 10, 12, 12, 20, 50, 50, 11.5, 12, 12, 12, 10, 10], hiddenCols: [1, 2], freeze: { x: 1, y: 1 } });

      // شیت ۲: خریدهای انجام‌شده
      S.buildStyledSheet(wb, 'خریدهای انجام‌شده',
        ['کد درخواست', 'کد کار', 'شماره درخواست', 'شماره ثبت', 'موضوع', 'شرح', 'تاریخ درخواست', 'کارپرداز', 'وضعیت', 'تاریخ تأمین اعتبار', 'وضعیت اتمام'],
        doneReq.map(r => [r.RequestID, r.TaskID, r.RequestNumber, r.RegisterNumber, r.TaskTtl, r.Descriptions, toShamsiString(r.RequestDate), r.Buyer, r.Status, toShamsiString(r.FundingDate), r.Complited]),
        { tabColor: 'FF00FF00', headerFill: S.FILL_GREEN_DONE, oddFill: S.FILL_HONEYDEW, widths: [10, 10, 12, 12, 50, 50, 11.5, 12, 12, 12, 10], hiddenCols: [1, 2], freeze: { x: 1, y: 1 } });

      // شیت ۳: کارهای بدون درخواست
      S.buildStyledSheet(wb, 'کارهای بدون درخواست',
        ['کد کار', 'موضوع', 'شرح', 'وضعیت اتمام', 'الویت'],
        withoutReq.map(r => [r.TaskID, r.TaskTtl, r.Descriptions, r.Complited, r.Priorities]),
        { tabColor: 'FFFFFF00', headerFill: S.FILL_YELLOW, oddFill: S.FILL_LIGHT_YELLOW, widths: [10, 50, 50, 14, 14], freeze: { x: 1, y: 1 } });

      // شیت ۴: کارهای در حال انجام
      S.buildStyledSheet(wb, 'کارهای در حال انجام',
        ['کد کار', 'نام تجهیز', 'شماره تجهیز', 'ساختمان', 'محل', 'عنوان', 'شرح', 'الویت', 'تاریخ شروع', 'تاریخ اتمام'],
        undoneTask.map(r => [r.TaskID, r.AssetName, r.AssetNumber, r.Building, r.Location, r.TaskTtl, r.Descriptions, r.Priorities, toShamsiDateTimeString(r.DueDateTime), toShamsiDateTimeString(r.EndDateTime)]),
        { tabColor: 'FF8B0000', headerFill: S.FILL_DARK_SALMON, oddFill: S.FILL_LIGHT_SALMON, widths: [10, 25, 11, 11.5, 16, 50, 50, 11, 11, 11], hiddenCols: [1, 2], freeze: { x: 1, y: 1 } });

      // شیت ۵: کارهای اتمام‌یافته
      S.buildStyledSheet(wb, 'کارهای اتمام‌یافته',
        ['کد کار', 'نام تجهیز', 'شماره تجهیز', 'ساختمان', 'محل', 'عنوان', 'شرح', 'الویت', 'تاریخ شروع', 'تاریخ اتمام'],
        doneTask.map(r => [r.TaskID, r.AssetName, r.AssetNumber, r.Building, r.Location, r.TaskTtl, r.Descriptions, r.Priorities, toShamsiDateTimeString(r.DueDateTime), toShamsiDateTimeString(r.EndDateTime)]),
        { tabColor: 'FF006400', headerFill: S.FILL_DARK_SEA_GREEN, oddFill: S.FILL_LIGHT_GREEN, widths: [10, 25, 11, 11.5, 16, 50, 50, 11, 11, 11], hiddenCols: [1, 2], freeze: { x: 1, y: 1 } });

      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('Request report'),
        },
      });
    }

    if (type === 'functor-excel') {
      const data = await R.getTasksAndFunctorData();
      const wb = new ExcelJS.Workbook();
      S.buildStyledSheet(wb, 'کارها-انجام‌دهنده‌ها',
        ['کد', 'انجام‌دهنده', 'دستگاه/مجموعه', 'شماره', 'ساختمان', 'محل', 'بلوک', 'طبقه', 'الویت', 'موضوع', 'توضیحات', 'نوبت', 'تاریخ ثبت'],
        data.map(r => [r.TaskID, r.PersonName, r.AssetName, r.AssetNumber, r.Building, r.Location, r.Block, r.Floor, r.Priorities, r.TaskTtl, r.Descriptions, toShamsiDateTimeString(r.DueDateTime), toShamsiDateTimeString(r.Submit_Date)]),
        { tabColor: 'FF008000', headerFill: S.FILL_GREEN_HEADER, oddFill: S.FILL_LIGHT_GREEN, widths: [10, 14.43, 16.71, 6.14, 11.57, 11.29, 5.29, 5.29, 7.86, 40, 40, 15.57, 15.57], hiddenCols: [1, 9], freeze: { x: 1, y: 1 } });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('Tasks & Functore'),
        },
      });
    }

    // ✅ گزارش لیست کارهای ثابت (Excel) — معادل Create_All_Fixed_Time_List_Excel_File + ستون موضوع
    if (type === 'fixed-tasks-excel') {
      const data = await R.getAllFixedTasks();
      const wb = new ExcelJS.Workbook();
      S.buildStyledSheet(wb, 'لیست کارهای زمان ثابت',
        ['کد', 'موضوع', 'الویت', 'طول بازه', 'زمان شروع', 'زمان پایان', 'وضعیت'],
        data.map(r => [r.TaskID, r.TaskTtl, r.Priorities, r.Durationtime, toShamsiDateTimeString(r.DueDateTime), toShamsiDateTimeString(r.EndDateTime), r.Complited]),
        {
          tabColor: 'FFFFFF00',
          headerFill: S.FILL_PINK_HEADER,
          oddFill: S.FILL_LIGHT_PINK,
          widths: [10, 40, 12, 10, 16, 16, 10],
          freeze: { x: 1, y: 1 },
        });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('Tasks List'),
        },
      });
    }

    // ✅ گزارش کارهای انجام‌شده بر اساس تاریخ و دستگاه (Excel) — معادل Create_Asset_Date_Tasks_List_Excel_File
    if (type === 'asset-date-excel') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const assetName = url.searchParams.get('assetName') || '';
      const data = await R.getAssetDateTasks(start, end, assetName);
      const wb = new ExcelJS.Workbook();
      S.buildStyledSheet(wb, 'لیست کارها',
        ['کد', 'دستگاه/مجموعه', 'شماره', 'ساختمان', 'محل', 'بلوک', 'طبقه', 'موضوع', 'توضیحات', 'زمان انجام', 'وضعیت'],
        data.map(r => [r.TaskID, r.AssetName, r.AssetNumber, r.Building, r.Location, r.Block, r.Floor, r.TaskTtl, r.Descriptions, toShamsiDateTimeString(r.Finish_DateTime), r.Complited]),
        {
          tabColor: 'FFFF0000',
          headerFill: S.FILL_PINK_HEADER,
          oddFill: S.FILL_LIGHT_PINK,
          widths: [10, 27, 8, 16, 25, 6, 6, 50, 100, 16, 16],
          hiddenCols: [1, 9],
          freeze: { x: 1, y: 1 },
        });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('Tasks List'),
        },
      });
    }

    if (type === 'all-tasks-excel') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const data = await R.getAllTasksExcelByDate(start, end);
      const wb = new ExcelJS.Workbook();
      S.buildStyledSheet(wb, 'گزارش کل کارها',
        ['کد', 'اقدام/پروژه', 'دستگاه/مجموعه', 'شماره', 'ساختمان', 'محل', 'عنوان', 'شرح', 'تاریخ ثبت', 'تاریخ انجام', 'وضعیت اتمام کار'],
        data.map(r => [r.TaskID, r.IsConsiderableAction, r.AssetName, r.AssetNumber, r.Building, r.Location, r.TaskTtl, r.Descriptions, toShamsiDateTimeString(r.Submit_Date), toShamsiDateTimeString(r.Finish_DateTime), r.Complited]),
        { tabColor: 'FFED7A2B', headerFill: S.FILL_ORANGE_HEADER, oddFill: S.FILL_ORANGE_LIGHT, widths: [10, 7.6, 16.7, 7.25, 16.7, 16.7, 30, 50, 11.8, 17, 9], hiddenCols: [1, 9], freeze: { x: 1, y: 1 } });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('All Tasks report'),
        },
      });
    }

    if (type === 'finished-tasks-excel') {
      if (!start || !end) return NextResponse.json({ success: false, error: 'بازه زمانی لازم است.' }, { status: 400 });
      const data = await R.getFinishedTasksExcelByDate(start, end);
      const wb = new ExcelJS.Workbook();
      S.buildStyledSheet(wb, 'گزارش کارهای اتمام‌یافته',
        ['کد', 'اقدام/پروژه', 'دستگاه/مجموعه', 'شماره', 'ساختمان', 'محل', 'عنوان', 'شرح', 'تاریخ ثبت', 'تاریخ اتمام', 'وضعیت اتمام کار'],
        data.map(r => [r.TaskID, r.IsConsiderableAction, r.AssetName, r.AssetNumber, r.Building, r.Location, r.TaskTtl, r.Descriptions, toShamsiDateTimeString(r.Submit_Date), toShamsiDateTimeString(r.Finish_DateTime), r.Complited]),
        { tabColor: 'FF69FF69', headerFill: S.FILL_GREEN_DONE, oddFill: S.FILL_GREEN_LIGHT, widths: [10, 7.6, 16.7, 7.25, 16.7, 16.7, 30, 50, 11.8, 17, 9], hiddenCols: [1, 9], freeze: { x: 1, y: 1 } });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-File-Name': makeExcelFileName('Finished Tasks report'),
        },
      });
    }

    return NextResponse.json({ success: false, error: 'نوع گزارش نامعتبر است.' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}