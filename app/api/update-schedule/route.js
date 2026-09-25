// app/api/update-schedule/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const fmtDT = (d) => `${fmtDate(d)} ${fmtTime(d)}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const atMin = (d, m) => { const x = new Date(d); x.setHours(Math.floor(m / 60), m % 60, 0, 0); return x; };
const minsOf = (d) => d.getHours() * 60 + d.getMinutes();

const toMin = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
};

// ✅ ساعات کاری از Set_tbl (مثل Frm_setting دسکتاپ)
async function loadWorkHours() {
  const rows = await query(
    `SELECT StartWorkTime, restTimeStart, restTimeEnd, EndWorkTime FROM Set_tbl`,
  );
  const r = rows[0] || {};
  return {
    workStart: toMin(r.StartWorkTime) ?? 8 * 60,
    restStart: toMin(r.restTimeStart) ?? 12 * 60,
    restEnd: toMin(r.restTimeEnd) ?? 13 * 60,
    workEnd: toMin(r.EndWorkTime) ?? 16 * 60,
  };
}

function roundUp10(d) {
  const add = 10 - (d.getMinutes() % 10);
  const x = new Date(d.getTime() + add * 60000);
  x.setSeconds(0, 0);
  return x;
}

// ✅ معادل TaskScheduleLogic.CalculateInitialDueDateTime
function calcInitial(now, h) {
  const day = now.getDay(); // 3=چهارشنبه، 4=پنجشنبه، 5=جمعه
  const m = minsOf(now);
  if (m >= h.workEnd && day === 3) return atMin(addDays(now, 3), h.workStart);
  if (day === 4) return atMin(addDays(now, 2), h.workStart);
  if (day === 5) return atMin(addDays(now, 1), h.workStart);
  if (m >= h.workEnd) return atMin(addDays(now, 1), h.workStart);
  if (m >= h.restStart && m < h.restEnd) return atMin(now, h.restEnd);
  if (m < h.workStart) return atMin(now, h.workStart);
  return roundUp10(now);
}

// ✅ معادل TaskScheduleLogic.CorrectDueTime
function correctDue(cur, h) {
  const m = minsOf(cur);
  if (m < h.workStart) return atMin(cur, h.workStart);
  if (m >= h.restStart && m < h.restEnd) return atMin(cur, h.restEnd);
  if (m >= h.workEnd) return atMin(addDays(cur, 1), h.workStart);
  return cur;
}

export async function POST() {
  try {
    const h = await loadWorkHours();
    const rows = await query(
      `SELECT tsk.TaskID AS ID, tsk.FixedDueTime AS fix, TD.Priorities AS pr,
              TD.DueDateTime AS Due, TD.EndDateTime AS Endd
       FROM Tsk_tbl tsk
       LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
       WHERE (tsk.Complited = 0)
       ORDER BY TD.DueDateTime`,
    );

    let currentDue = calcInitial(new Date(), h);
    let updated = 0;

    for (const r of rows) {
      const due = r.Due ? new Date(r.Due) : null;
      const end = r.Endd ? new Date(r.Endd) : null;
      if (!due || !end) continue;
      const duration = end.getTime() - due.getTime();

      currentDue = correctDue(currentDue, h);
      const currentEnd = new Date(currentDue.getTime() + duration);
      const isFixed = Number(r.fix) === 1 || String(r.pr || "") === "زمان انجام ثابت";

      if (!isFixed) {
        const params = [
          fmtDate(currentDue), fmtTime(currentDue),
          fmtDate(currentEnd), fmtTime(currentEnd),
          fmtDT(currentDue), fmtDT(currentEnd),
        ];
        await query(
          `UPDATE TimeDate_tbl SET Due_Date=?, Due_Time=?, End_Date=?, End_Time=?, DueDateTime=?, EndDateTime=? WHERE TaskID=?`,
          [...params, r.ID],
        );
        await query(
          `UPDATE Tsk_tbl SET Due_Date=?, Due_Time=?, End_Date=?, End_Time=?, DueDateTime=?, EndDateTime=? WHERE TaskID=?`,
          [...params, r.ID],
        );
        updated++;
        currentDue = currentEnd; // کار بعدی از پایان این کار شروع می‌شود
      } else {
        currentDue = end; // کار زمان‌ثابت جابه‌جا نمی‌شود؛ زنجیره از پایان آن ادامه می‌یابد
      }
    }

    return NextResponse.json({ success: true, updated });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}