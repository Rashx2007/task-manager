import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normFa } from '@/lib/assetRules';

const normCol = (col) =>
  `LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')))`;

// ✅ بررسی وجود دستگاه با «تطبیق جزئی»: فقط فیلدهای پُرشده در شرط شرکت می‌کنند
export async function POST(request) {
  try {
    const b = (await request.json()) || {};
    const conds = [];
    const params = [];

    const name = normFa(b.AssetName);
    if (name) { conds.push(`(${normCol('AssetName')} = ?)`); params.push(name); }

    const building = normFa(b.Building);
    if (building) { conds.push(`(${normCol('Building')} = ?)`); params.push(building); }

    const block = normFa(b.Block);
    if (block && block !== '-') { conds.push(`(${normCol('Block')} = ?)`); params.push(block); }

    const floor = (b.Floor === '' || b.Floor == null || String(b.Floor).trim() === '' || isNaN(Number(b.Floor))) ? null : Number(b.Floor);
    if (floor != null) { conds.push(`(Floor = ?)`); params.push(floor); }

    const entrance = normFa(b.Entrance);
    if (entrance && entrance !== '-') { conds.push(`(${normCol('Entrance')} = ?)`); params.push(entrance); }

    const location = normFa(b.Location);
    if (location) { conds.push(`(${normCol('Location')} = ?)`); params.push(location); }

    const num = (b.AssetNumber === '' || b.AssetNumber == null || String(b.AssetNumber).trim() === '' || isNaN(Number(b.AssetNumber))) ? null : Number(b.AssetNumber);
    if (num != null) { conds.push(`(AssetNumber = ?)`); params.push(num); }

    // دست‌کم نام دستگاه یا ساختمان لازم است
    if (!name && !building) return NextResponse.json({ found: false, matches: [] });

    // ✅ IsActive=NULL هم معتبر است (ردیف‌های شما NULL دارند)
    const where = `WHERE (IsActive IS NULL OR IsActive = 1)` + (conds.length ? ` AND ${conds.join(' AND ')}` : '');
    const rows = await query(
      `SELECT AssetID, AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, MechSystem
       FROM Asset_2_tbl ${where} ORDER BY AssetID`,
      params
    );

    if (rows.length === 0) return NextResponse.json({ found: false, matches: [] });
    return NextResponse.json({ found: true, AssetID: rows[0].AssetID, matches: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}