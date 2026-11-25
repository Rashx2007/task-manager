import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const names = await query(`
    SELECT AssetNameID, AssetName, MechSystemID
    FROM AssetNames_tbl
    ORDER BY AssetName
  `);
  const systems = await query(`
    SELECT MechSystemsID, MechSystem
    FROM MechSystems_tbl
    ORDER BY MechSystem
  `);
  return NextResponse.json({ success: true, names, systems });
}

export async function POST(request) {
  const { kind, value, mechSystemId } = await request.json();
  const trimmedValue = String(value ?? '').trim();
  if (!trimmedValue) {
    return NextResponse.json(
      { success: false, error: 'مقدار خالی است' },
      { status: 400 },
    );
  }

  if (kind === 'name') {
    const systemId = Number(mechSystemId);
    if (!Number.isInteger(systemId) || systemId <= 0) {
      return NextResponse.json(
        { success: false, error: 'ابتدا سیستم مکانیکی را انتخاب کنید' },
        { status: 400 },
      );
    }
    await query(
      `INSERT INTO AssetNames_tbl (AssetName, MechSystemID) VALUES (?,?)`,
      [trimmedValue, systemId],
    );
  } else if (kind === 'system') {
    await query(`INSERT INTO MechSystems_tbl (MechSystem) VALUES (?)`, [
      trimmedValue,
    ]);
  } else {
    return NextResponse.json(
      { success: false, error: 'نوع اطلاعات پایه نامعتبر است' },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
