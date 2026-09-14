import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normFa, placeRules } from '@/lib/assetRules';

const normCol = (col) =>
  `LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, NCHAR(0x200C), N''), NCHAR(0x200F), N''), NCHAR(0x200E), N''), N'ي', N'ی'), N'ى', N'ی'), N'ك', N'ک')))`;

export async function POST(request) {
  try {
    const b = (await request.json()) || {};
    const name = normFa(b.AssetName);
    const building = normFa(b.Building);
    if (!name || !building) return NextResponse.json({ found: false });

    const rules = placeRules(b.Building, b.Block, b.Floor, b.Entrance);
    const loc = normFa(b.Location);
    const hasNum = b.AssetNumber != null && String(b.AssetNumber).trim() !== '';
    const exclude = b.excludeAssetId ? Number(b.excludeAssetId) : null;

    const conds = [
      `(${normCol('AssetName')} = ?)`,
      `(${normCol('Building')} = ?)`,
      `(${normCol('Location')} = ?)`,
    ];
    const params = [name, building, loc];

    if (hasNum) { conds.push(`(AssetNumber = ?)`); params.push(Number(b.AssetNumber)); }
    else conds.push(`(AssetNumber IS NULL)`);

    if (rules.central) {
      // مرکزی: مقایسهٔ دقیق بلوک/طبقه/ورودی (ورودی '-' با مقادیر خالی هم معادل است)
      if (rules.block) { conds.push(`(${normCol('Block')} = ?)`); params.push(rules.block); }
      else conds.push(`(${normCol('Block')} IN ('', '-', '0') OR Block IS NULL)`);
      if (rules.floor != null) { conds.push(`(Floor = ?)`); params.push(rules.floor); }
      else conds.push(`(Floor IS NULL OR Floor = 0)`);
      if (rules.entrance && rules.entrance !== '-') { conds.push(`(${normCol('Entrance')} = ?)`); params.push(rules.entrance); }
      else conds.push(`(${normCol('Entrance')} IN ('', '-', '0') OR Entrance IS NULL)`);
    } else {
      // غیرمرکزی: بلوک/طبقه/ورودی هر ترکیب «خالی/صفر/خط تیره» را بپذیر
      conds.push(`(${normCol('Block')} IN ('', '-', '0') OR Block IS NULL)`);
      conds.push(`(Floor IS NULL OR Floor = 0)`);
      conds.push(`(${normCol('Entrance')} IN ('', '-', '0') OR Entrance IS NULL)`);
    }

    if (exclude) { conds.push(`(AssetID <> ?)`); params.push(exclude); }

    const sql = `SELECT AssetID FROM Asset_2_tbl WHERE ${conds.join(' AND ')}`;
    const rows = await query(sql, params);
    if (rows.length) return NextResponse.json({ found: true, AssetID: rows[0].AssetID });
    return NextResponse.json({ found: false });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}