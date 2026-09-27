import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { normalizeDigits, normalizeFa } from "@/lib/assetRules";

// ✅ چک تطابق کامل دستگاه در Asset_2_tbl؛ اگر نبود → بازگشت preset برای فرم دستگاه
// ✅ IsActive=NULL و IsActive=1 هر دو معتبرند (backward compat با داده‌های قدیمی)
export async function POST(request) {
  try {
    const b = await request.json();
        const { deviceType, deviceNumber, building, block, floor, entrance, location, mechSystem, specifications, mapTag } = b || {};

    // ✅ نرمال‌سازی اعداد فارسی/عربی قبل از مقایسه
    const normalizedNumber =
      deviceNumber != null && String(deviceNumber).trim() !== ""
        ? normalizeDigits(String(deviceNumber))
        : null;
    const hasNum =
      normalizedNumber != null &&
      normalizedNumber !== "" &&
      !isNaN(Number(normalizedNumber));

    // فقط وقتی «نوع + شماره + ساختمان + طبقه» همه موجود باشند، جستجوی دقیق انجام می‌شود
    if (deviceType && hasNum && building && floor != null && String(floor).trim() !== "") {
      const rows = await query(
        `SELECT AssetID FROM Asset_2_tbl
         WHERE AssetName = ? AND AssetNumber = ? AND Building = ? AND Block = ? AND Floor = ?
           AND ISNULL(IsActive, 1) = 1`,
        [
          String(deviceType),
          Number(normalizedNumber),
          String(building),
          String(block || ""),
          Number(floor),
        ],
      );
      if (rows.length)
        return NextResponse.json({ found: true, assetId: rows[0].AssetID });
    }

    return NextResponse.json({
      found: false,
      preset: {
        AssetName: deviceType || "",
        AssetNumber: hasNum ? Number(normalizedNumber) : null,
        Building: building || "",
        Block: block || "",
        Floor: floor != null ? String(floor) : "",
        Entrance: entrance || "",
        Location: location || "",
        MechSystem: mechSystem || "",
        Specifications: "",
        MapTag: mapTag || "",
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}