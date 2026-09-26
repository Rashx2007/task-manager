// app/api/supplier/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { formatSqlDateTime } from "@/lib/schedule-logic";

const num = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const str = (v) => String(v ?? "").trim();
const dt = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : formatSqlDateTime(d);
};

export async function GET(request) {
  try {
    const taskId = Number(new URL(request.url).searchParams.get("taskId"));
    const rows = await query(`SELECT * FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    return NextResponse.json({ success: true, exists: rows.length > 0, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const taskId = Number(b.taskId ?? b.TaskID);

    // ✅ پذیرش هر دو سبک کلید (PascalCase از جدول / camelCase)
    const requestNumber = num(b.RequestNumber ?? b.requestNumber);
    const registerNumber = str(b.RegisterNumber ?? b.registerNumber);
    const buyer = str(b.Buyer ?? b.buyer) || null;
    // ✅ ستون Status NOT NULL است → به‌جای NULL رشتهٔ خالی
    const status = str(b.Status ?? b.status);
    // ✅ ستون RequestDate NOT NULL است → در صورت خالی‌بودن، زمان جاری
    let requestDate = dt(b.RequestDate ?? b.requestDate);
    if (!requestDate) requestDate = formatSqlDateTime(new Date());
    const fundingDate = dt(b.FundingDate ?? b.fundingDate);

    const ex = await query(`SELECT RequestID FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    if (ex.length) {
      await query(
        `UPDATE Purchase_Request_tbl
         SET RequestNumber = ?, RegisterNumber = ?, RequestDate = ?, Buyer = ?, Status = ?, FundingDate = ?
         WHERE TaskID = ?`,
        [requestNumber, registerNumber, requestDate, buyer, status, fundingDate, taskId],
      );
    } else {
      await query(
        `INSERT INTO Purchase_Request_tbl
         (TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status, FundingDate)
         VALUES (?,?,?,?,?,?,?)`,
        [taskId, requestNumber, registerNumber, requestDate, buyer, status, fundingDate],
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}