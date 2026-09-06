import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ✅ چک تطابق کامل دستگاه در Asset_2_tbl؛ اگر نبود → بازگشت preset برای فرم دستگاه
export async function POST(request) {
  try {
    const b = await request.json();
    const { deviceType, deviceNumber, building, block, floor, entrance, location, mechSystem, mapTag } = b || {};

    // فقط وقتی «نوع + شماره + ساختمان + طبقه» همه موجود باشند، جستجوی دقیق انجام می‌شود
    const hasNum = deviceNumber != null && String(deviceNumber).trim() !== '' && !isNaN(Number(deviceNumber));
    if (deviceType && hasNum && building && floor != null && String(floor).trim() !== '') {
      const rows = await query(
        `SELECT AssetID FROM Asset_2_tbl
         WHERE AssetName = ? AND AssetNumber = ? AND Building = ? AND Block = ? AND Floor = ? AND IsActive = 1`,
        [String(deviceType), Number(deviceNumber), String(building), String(block || ''), Number(floor)]
      );
      if (rows.length) return NextResponse.json({ found: true, assetId: rows[0].AssetID });
    }

    return NextResponse.json({
      found: false,
      preset: {
        AssetName: deviceType || '',
        AssetNumber: hasNum ? Number(deviceNumber) : null,
        Building: building || '',
        Block: block || '',
        Floor: floor != null ? String(floor) : '',
        Entrance: entrance || '',
        Location: location || '',
        MechSystem: mechSystem || '',
        Specifications: '',
        MapTag: mapTag || '',
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}