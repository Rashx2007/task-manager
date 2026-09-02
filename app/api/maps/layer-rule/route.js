import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { layerName, deviceType, isNewType, isBase } = await request.json();
    if (isBase) {
      await query(`INSERT INTO MapLayerRule_tbl (DeviceType, LayerLike, IsBase) VALUES (?,?,1)`, [deviceType || layerName, layerName]);
    } else if (isNewType) {
      await query(`INSERT INTO MapLayerRule_tbl (DeviceType, LayerLike, IsBase) VALUES (?,?,0)`, [deviceType, layerName]);
    } else {
      // نوع موجود → لایهٔ متناظرِ همان نوع به نام لایهٔ جدید تغییر می‌کند
      await query(`UPDATE MapLayerRule_tbl SET LayerLike=? WHERE DeviceType=?`, [layerName, deviceType]);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
