import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const pad = (n) => String(n).padStart(2, '0');
function fmtD(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function num(v) { return v !== null && v !== undefined && String(v).trim() !== '' ? Number(v) : 0; }

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const taskId = Number(searchParams.get('taskId'));
  try {
    const rows = await query(
      `SELECT RequestID, TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status, FundingDate
       FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    return NextResponse.json({ success: true, exists: rows.length > 0, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const taskId = Number(b.taskId);
    const exists = await query(`SELECT RequestID FROM Purchase_Request_tbl WHERE TaskID = ?`, [taskId]);
    if (exists.length) {
      await query(
        `UPDATE Purchase_Request_tbl SET RequestNumber=?, RegisterNumber=?, RequestDate=?, Buyer=?, Status=?, FundingDate=?
         WHERE TaskID=?`,
        [num(b.requestNumber), num(b.registerNumber), fmtD(b.requestDate), b.buyer || null, b.status || null, fmtD(b.fundingDate), taskId]);
    } else {
      await query(
        `INSERT INTO Purchase_Request_tbl (TaskID, RequestNumber, RegisterNumber, RequestDate, Buyer, Status, FundingDate)
         VALUES (?,?,?,?,?,?,?)`,
        [taskId, num(b.requestNumber), num(b.registerNumber), fmtD(b.requestDate), b.buyer || null, b.status || null, fmtD(b.fundingDate)]);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}