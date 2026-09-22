// app/api/supplier/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const toIntOrNull = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const toDateOrNull = (v) => {
  const t = String(v ?? "").trim();
  return t || null;
};

export async function GET(request) {
  try {
    const taskId = Number(new URL(request.url).searchParams.get("taskId"));
    const rows = await query(`SELECT * FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const taskId = Number(b.taskId);
    const req = toIntOrNull(b.RequestNumber);
    const r1 = toIntOrNull(b.RegisterNumber1);
    const r2 = toIntOrNull(b.RegisterNumber2);
    const r3 = toIntOrNull(b.RegisterNumber3);
    const reqDate = toDateOrNull(b.RequestDate);
    const credit = toDateOrNull(b.CreditDate);
    const buyer = b.BuyerName ? String(b.BuyerName) : null;
    const status = b.Status ? String(b.Status) : null;

    const ex = await query(`SELECT PurchaseRequestID FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    if (ex.length) {
      await query(
        `UPDATE Purchase_Request_tbl
         SET RequestNumber = ?, RegisterNumber1 = ?, RegisterNumber2 = ?, RegisterNumber3 = ?,
             RequestDate = ?, BuyerName = ?, Status = ?, CreditDate = ?
         WHERE TaskID = ?`,
        [req, r1, r2, r3, reqDate, buyer, status, credit, taskId],
      );
    } else {
      await query(
        `INSERT INTO Purchase_Request_tbl
         (TaskID, RequestNumber, RegisterNumber1, RegisterNumber2, RegisterNumber3, RequestDate, BuyerName, Status, CreditDate)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [taskId, req, r1, r2, r3, reqDate, buyer, status, credit],
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}