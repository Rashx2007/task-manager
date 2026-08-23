// update-default-folders/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function POST() {
  try {
    const cnt = await query(`SELECT COUNT(*) AS c FROM Asset_2_tbl a INNER JOIN AssetNames_tbl n ON n.AssetName=a.AssetName WHERE (a.FolderPath IS NULL OR a.FolderPath='') AND n.FolderPath IS NOT NULL AND n.FolderPath<>''`);
    await query(`UPDATE a SET a.FolderPath=n.FolderPath FROM Asset_2_tbl a INNER JOIN (SELECT AssetName, MAX(FolderPath) AS FolderPath FROM AssetNames_tbl WHERE FolderPath IS NOT NULL AND FolderPath<>'' GROUP BY AssetName) n ON n.AssetName=a.AssetName WHERE (a.FolderPath IS NULL OR a.FolderPath='')`);
    return NextResponse.json({ success: true, updated: cnt[0].c });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}