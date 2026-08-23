// supplier/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { formatSqlDateTime } from '@/lib/schedule-logic';
export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  const rows = await query(`SELECT * FROM Purchase_Request_tbl WHERE TaskID=?`, [taskId]);
  return NextResponse.json({ success: true, exists: rows.length > 0, data: rows[0] || null });
}
export async function POST(request) {
  const b = await request.json();
  const d = (v) => (v ? formatSqlDateTime(new Date(v)) : null);
  const ex = await query(`SELECT RequestID FROM Purchase_Request_tbl WHERE TaskID=?`, [Number(b.taskId)]);
  if (ex.length) await query(`UPDATE Purchase_Request_tbl SET RequestNumber=?, RegisterNumber=?, RequestDate=?, Buyer=?, Status=?, FundingDate=? WHERE TaskID=?`, [num(b.requestNumber), num(b.registerNumber), d(b.requestDate), b.buyer || null, b.status || null, d(b.fundingDate), Number(b.taskId)]);
  else await query(`INSERT INTO Purchase_Request_tbl (TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status, FundingDate) VALUES (?,?,?,?,?,?,?)`, [Number(b.taskId), num(b.requestNumber), num(b.registerNumber), d(b.requestDate), b.buyer || null, b.status || null, d(b.fundingDate)]);
  return NextResponse.json({ success: true });
}
const num = (v) => (v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : 0);