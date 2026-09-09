import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const esc = (s) => String(s).replace(/'/g, "''");
const has = (s) => s !== undefined && s !== null && String(s).trim() !== '';

// معادل AutoCompletePersonSearchDT / PersonSearchDT
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get('term') || '';
    let where = '';
    if (has(term)) {
      const t = esc(term);
      where = `WHERE (PersonName LIKE N'%${t}%' OR OfficeName LIKE N'%${t}%' OR WorkTellNumber1 LIKE N'%${t}%' OR WorkTellNumber2 LIKE N'%${t}%' OR WorkTellNumber3 LIKE N'%${t}%' OR MobileTellNumber1 LIKE N'%${t}%' OR MobileTellNumber2 LIKE N'%${t}%' OR MobileTellNumber3 LIKE N'%${t}%' OR Address LIKE N'%${t}%')`;
    }
    const rows = await query(
      `SELECT PersonID, PersonName, OfficeName, WorkTellNumber1, WorkTellNumber2, WorkTellNumber3,
              MobileTellNumber1, MobileTellNumber2, MobileTellNumber3, Address
       FROM Persons_tbl ${where} ORDER BY PersonName`);
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const b = await request.json();
    const r = await query(
      `INSERT INTO Persons_tbl (PersonName, OfficeName, WorkTellNumber1, WorkTellNumber2, WorkTellNumber3, MobileTellNumber1, MobileTellNumber2, MobileTellNumber3, Address)
       OUTPUT INSERTED.PersonID
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [b.PersonName || null, b.OfficeName || null, b.WorkTellNumber1 || null, b.WorkTellNumber2 || null, b.WorkTellNumber3 || null,
       b.MobileTellNumber1 || null, b.MobileTellNumber2 || null, b.MobileTellNumber3 || null, b.Address || null]);
    return NextResponse.json({ success: true, PersonID: r[0].PersonID });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}