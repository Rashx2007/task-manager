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
    if (!name || !building) return NextResponse.json({ found: false, matches: [] });

    const rules = placeRules(b.Building, b.Block, b.Floor, b.Entrance);
    const loc = normFa(b.Location);
    const hasNum = b.AssetNumber != null && String(b.AssetNumber).trim() !== '';
    const exclude = b.excludeAssetId ? Number(b.excludeAssetId) : null;

    // ✅ بدون طبقه، دستگاه دقیق قابل تعیین نیست
    if (rules.floor == null) return NextResponse.json({ found: false, needFloor: true, matches: [] });

    const conds = [
      `(${normCol('AssetName')} = ?)`,
      `(${normCol('Building')} = ?)`,
      `(Floor = ?)`,
    ];
    const params = [name, building, rules.floor];
    if (hasNum) { conds.push(`(AssetNumber = ?)`); params.push(Number(b.AssetNumber)); }
    else conds.push(`(AssetNumber IS NULL)`);
    if (loc) { conds.push(`(${normCol('Location')} = ?)`); params.push(loc); }
    else conds.push(`(${normCol('Location')} IN ('', '-') OR Location IS NULL)`);
    if (rules.central) {
      if (rules.block) { conds.push(`(${normCol('Block')} = ?)`); params.push(rules.block); }
      else conds.push(`(${normCol('Block')} IN ('', '-', '0') OR Block IS NULL)`);
      if (rules.entrance && rules.entrance !== '-') { conds.push(`(${normCol('Entrance')} = ?)`); params.push(rules.entrance); }
      else conds.push(`(${normCol('Entrance')} IN ('', '-', '0') OR Entrance IS NULL)`);
    } else {
      conds.push(`(${normCol('Block')} IN ('', '-', '0') OR Block IS NULL)`);
      conds.push(`(${normCol('Entrance')} IN ('', '-', '0') OR Entrance IS NULL)`);
    }
    if (exclude) { conds.push(`(AssetID <> ?)`); params.push(exclude); }

    const sql = `SELECT AssetID, AssetName, AssetNumber, Building, Block, Floor, Entrance, Location, MechSystem
                 FROM Asset_2_tbl WHERE ${conds.join(' AND ')}`;
    const rows = await query(sql, params);
    if (rows.length === 0) return NextResponse.json({ found: false, matches: [] });
    if (rows.length === 1) return NextResponse.json({ found: true, AssetID: rows[0].AssetID, matches: rows });
    return NextResponse.json({ found: true, ambiguous: true, matches: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}