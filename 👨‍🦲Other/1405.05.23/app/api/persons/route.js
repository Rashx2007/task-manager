import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const rows = await query(
      `SELECT PersonID, PersonName, OfficeName,
              WorkTellNumber1, WorkTellNumber2, WorkTellNumber3,
              MobileTellNumber1, MobileTellNumber2, MobileTellNumber3
       FROM Persons_tbl ORDER BY PersonName`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}