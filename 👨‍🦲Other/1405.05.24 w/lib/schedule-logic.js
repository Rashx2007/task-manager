// lib/schedule-logic.js
import { query } from './db';

// ---------- توابع کمکی ----------

// تبدیل Date به رشته 'YYYY-MM-DD HH:MM:SS' (سازگار با درایور قدیمی ODBC)
export function formatSqlDateTime(dt) {
  const d = new Date(dt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// تبدیل Date به 'HH:MM:SS' برای ستون‌های time(7)
function formatSqlTime(dt) {
  const d = new Date(dt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// تبدیل رشته 'HH:MM:SS' به Date (برای مقایسه ساعت)
function parseTime(str) {
  const p = String(str).split(':');
  const d = new Date();
  d.setHours(parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0, 0);
  return d;
}

const secondsOf = (d) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

// ---------- خواندن تنظیمات از Set_tbl (با CONVERT برای time(7)) ----------
export async function loadWorkHoursFromSettings() {
  const defaults = {
    startWork: parseTime('08:00:00'),
    restStart: parseTime('12:00:00'),
    restEnd: parseTime('13:00:00'),
    endWork: parseTime('16:00:00'),
    ignoreTimeSettings: false,
  };
  try {
    const rows = await query(`
      SELECT TOP 1
        CONVERT(NVARCHAR(20), StartWorkTime, 108) AS StartWorkTime,
        CONVERT(NVARCHAR(20), restTimeStart, 108) AS restTimeStart,
        CONVERT(NVARCHAR(20), restTimeEnd, 108)   AS restTimeEnd,
        CONVERT(NVARCHAR(20), EndWorkTime, 108)   AS EndWorkTime,
        IgnoreTimeSettings
      FROM Set_tbl
    `);
    if (rows.length === 0) return defaults;
    const s = rows[0];
    return {
      startWork: parseTime(s.StartWorkTime),
      restStart: parseTime(s.restTimeStart),
      restEnd: parseTime(s.restTimeEnd),
      endWork: parseTime(s.EndWorkTime),
      ignoreTimeSettings: s.IgnoreTimeSettings === true || s.IgnoreTimeSettings === 1,
    };
  } catch (error) {
    console.error('Error loading work hours:', error);
    return defaults;
  }
}

// ---------- رند به ۱۰ دقیقه بعد ----------
export function getRoundedUpTime(dateTime) {
  const dt = new Date(dateTime);
  let minutes = Math.floor(dt.getMinutes() / 10) + 1;
  minutes *= 10;
  let hours = dt.getHours();
  if (minutes === 60) { minutes = 0; hours += 1; }
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

// ---------- محاسبه زمان سررسید اولیه (مثل Gettting_DueDateTime_According_to_OFF_Days_Times) ----------
export function calculateInitialDueDateTime(now, workHours) {
  const DTN = new Date(now);
  const day = DTN.getDay(); // 3=چهارشنبه، 4=پنجشنبه، 5=جمعه
  const setTime = (d, t) => { const x = new Date(d); x.setHours(t.getHours(), t.getMinutes(), 0, 0); return x; };

  if (secondsOf(DTN) >= secondsOf(workHours.endWork) && day === 3) {
    DTN.setDate(DTN.getDate() + 3);
    return setTime(DTN, workHours.startWork);
  }
  if (day === 4) {
    DTN.setDate(DTN.getDate() + 2);
    return setTime(DTN, workHours.startWork);
  }
  if (day === 5) return getRoundedUpTime(DTN);
  if (secondsOf(DTN) >= secondsOf(workHours.endWork)) {
    DTN.setDate(DTN.getDate() + 1);
    return setTime(DTN, workHours.startWork);
  }
  if (secondsOf(DTN) >= secondsOf(workHours.restStart) && secondsOf(DTN) < secondsOf(workHours.restEnd)) {
    return setTime(DTN, workHours.restEnd);
  }
  if (secondsOf(DTN) < secondsOf(workHours.startWork)) {
    return setTime(DTN, workHours.startWork);
  }
  return getRoundedUpTime(DTN);
}

// ---------- بررسی کار موقت ----------
export async function checkIfTemporaryTaskExists() {
  try {
    return await query(`SELECT TaskID, TaskTtl, Descriptions, tskType FROM Tsk_temp_tbl`);
  } catch (error) {
    return [];
  }
}

// ---------- تصحیح ساعت (مثل DueTimeCorrectionF1) ----------
function correctDueTime(due, workHours) {
  const d = new Date(due);
  if (secondsOf(d) < secondsOf(workHours.startWork)) {
    d.setHours(workHours.startWork.getHours(), workHours.startWork.getMinutes(), 0, 0);
  } else if (secondsOf(d) >= secondsOf(workHours.restStart) && secondsOf(d) < secondsOf(workHours.restEnd)) {
    d.setHours(workHours.restEnd.getHours(), workHours.restEnd.getMinutes(), 0, 0);
  } else if (secondsOf(d) >= secondsOf(workHours.endWork)) {
    d.setDate(d.getDate() + 1);
    d.setHours(workHours.startWork.getHours(), workHours.startWork.getMinutes(), 0, 0);
  }
  return d;
}

// ---------- بروزرسانی کارهای تاریخ‌گذشته (مثل UpdateBtn_Clicked) ----------
export async function updateExpiredTasks() {
  try {
    const workHours = await loadWorkHoursFromSettings();
    const tasks = await query(`SELECT * FROM Tsk_tbl WHERE Complited < 1 ORDER BY DueDateTime`);
    if (tasks.length === 0) return;

    let dueDateTimeF1 = calculateInitialDueDateTime(new Date(), workHours);

    for (const row of tasks) {
      const due = new Date(row.DueDateTime);
      const end = new Date(row.EndDateTime);
      const durationMs = end - due;

      dueDateTimeF1 = correctDueTime(dueDateTimeF1, workHours);
      const endDateTimeF1 = new Date(dueDateTimeF1.getTime() + durationMs);

      if (Number(row.FixedDueTime) !== 1) {
        await query(
          `UPDATE Tsk_tbl
           SET Due_Date = ?, Due_Time = ?, End_Date = ?, End_Time = ?, DueDateTime = ?, EndDateTime = ?
           WHERE TaskID = ?`,
          [
            formatSqlDateTime(dueDateTimeF1), formatSqlTime(dueDateTimeF1),
            formatSqlDateTime(endDateTimeF1), formatSqlTime(endDateTimeF1),
            formatSqlDateTime(dueDateTimeF1), formatSqlDateTime(endDateTimeF1),
            row.TaskID,
          ]
        );
        dueDateTimeF1 = endDateTimeF1;
      } else {
        dueDateTimeF1 = end; // کار با زمان ثابت: مبنا، زمان اتمام خودش
      }
    }
  } catch (error) {
    console.error('Error updating expired tasks:', error);
  }
}