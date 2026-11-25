// app/api/purchase-statuses/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query(
      `SELECT DISTINCT Status
       FROM Purchase_Request_tbl
       WHERE Status IS NOT NULL AND LTRIM(RTRIM(Status)) <> ''
       ORDER BY Status`,
    );
    return NextResponse.json({ success: true, data: rows.map((r) => r.Status) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}