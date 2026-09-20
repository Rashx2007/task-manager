import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ✅ معادل دسکتاپ: SELECT DISTINCT BuyerName FROM Buyer_tbl
export async function GET() {
  try {
    const rows = await query(
      `SELECT DISTINCT BuyerName FROM Buyer_tbl
       WHERE BuyerName IS NOT NULL AND LTRIM(RTRIM(BuyerName)) <> N''
       ORDER BY BuyerName`
    );
    return NextResponse.json({ success: true, buyers: rows.map((r) => String(r.BuyerName)) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ✅ معادل دسکتاپ: INSERT INTO Buyer_tbl (BuyerName) VALUES (...) با بررسی تکراری‌نبودن
export async function POST(request) {
  try {
    const b = await request.json();
    const name = String(b.name || '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'نام کارپرداز خالی است.' });
    const ex = await query(`SELECT BuyerID FROM Buyer_tbl WHERE LTRIM(RTRIM(BuyerName)) = ?`, [name]);
    if (ex.length) return NextResponse.json({ success: true, existed: true });
    await query(`INSERT INTO Buyer_tbl (BuyerName) VALUES (?)`, [name]);
    return NextResponse.json({ success: true, existed: false });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}