// persons/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
const has = (s) => s && String(s).trim() !== '';
const esc = (s) => String(s).replace(/'/g, "''");
export async function GET(request) {
  const term = new URL(request.url).searchParams.get('term') || '';
  let where = '';
  if (has(term)) { const t = esc(term); where = `WHERE PersonName LIKE N'%${t}%' OR OfficeName LIKE N'%${t}%' OR WorkTellNumber1 LIKE N'%${t}%' OR MobileTellNumber1 LIKE N'%${t}%' OR Address LIKE N'%${t}%'`; }
  const rows = await query(`SELECT PersonID, PersonName, OfficeName, WorkTellNumber1, WorkTellNumber2, WorkTellNumber3, MobileTellNumber1, MobileTellNumber2, MobileTellNumber3, Address FROM Persons_tbl ${where} ORDER BY PersonName`);
  return NextResponse.json({ success: true, data: rows });
}
export async function POST(request) {
  const b = await request.json();
  const r = await query(`INSERT INTO Persons_tbl (PersonName, OfficeName, WorkTellNumber1, WorkTellNumber2, WorkTellNumber3, MobileTellNumber1, MobileTellNumber2, MobileTellNumber3, Address) OUTPUT INSERTED.PersonID VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.PersonName, b.OfficeName || null, b.WorkTellNumber1 || null, b.WorkTellNumber2 || null, b.WorkTellNumber3 || null, b.MobileTellNumber1 || null, b.MobileTellNumber2 || null, b.MobileTellNumber3 || null, b.Address || null]);
  return NextResponse.json({ success: true, PersonID: r[0].PersonID });
}