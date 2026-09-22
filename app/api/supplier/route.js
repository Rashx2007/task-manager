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
    const reg = b.RegisterNumber ? String(b.RegisterNumber) : null;
    const reqDate = toDateOrNull(b.RequestDate);
    const funding = toDateOrNull(b.FundingDate);
    const buyer = b.Buyer ? String(b.Buyer) : null;
    const status = b.Status ? String(b.Status) : null;

    const ex = await query(`SELECT RequestID FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    if (ex.length) {
      await query(
        `UPDATE Purchase_Request_tbl
         SET RequestNumber = ?, RegisterNumber = ?, RequestDate = ?, Buyer = ?, Status = ?, FundingDate = ?
         WHERE TaskID = ?`,
        [req, reg, reqDate, buyer, status, funding, taskId],
      );
    } else {
      await query(
        `INSERT INTO Purchase_Request_tbl
         (TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status, FundingDate)
         VALUES (?,?,?,?,?,?,?)`,
        [taskId, req, reg, reqDate, buyer, status, funding],
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}