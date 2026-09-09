import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
const toHM = (v) => { if (!v) return ''; if (v instanceof Date) { const p = (n) => String(n).padStart(2, '0'); return `${p(v.getHours())}:${p(v.getMinutes())}`; } return String(v).substring(0, 5); };
export async function GET() {
  const rows = await query(`SELECT * FROM Set_tbl WHERE SetID=1001`);
  if (!rows.length) return NextResponse.json({ success: false }, { status: 404 });
  const r = rows[0];
  return NextResponse.json({ success: true, data: { startWork: toHM(r.StartWorkTime), restStart: toHM(r.restTimeStart), restEnd: toHM(r.restTimeEnd), endWork: toHM(r.EndWorkTime), ignore: r.IgnoreTimeSettings === true || r.IgnoreTimeSettings === 1 } });
}
export async function POST(request) {
  const { startWork, restStart, restEnd, endWork, ignore } = await request.json();
  const hms = (v) => (v && v.length === 5 ? v + ':00' : v);
  await query(`UPDATE Set_tbl SET StartWorkTime=?, restTimeStart=?, restTimeEnd=?, EndWorkTime=?, IgnoreTimeSettings=? WHERE SetID=1001`, [hms(startWork), hms(restStart), hms(restEnd), hms(endWork), ignore ? 1 : 0]);
  return NextResponse.json({ success: true });
}