// app/api/asset-names/route.js
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query(
      `SELECT DISTINCT AssetName
       FROM Asset_2_tbl
       WHERE AssetName IS NOT NULL AND LTRIM(RTRIM(AssetName)) <> N''
       ORDER BY AssetName`,
    );
    return NextResponse.json({ success: true, names: rows.map((r) => String(r.AssetName)) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}