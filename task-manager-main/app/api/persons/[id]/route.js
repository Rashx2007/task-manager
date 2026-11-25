// persons/[id]/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function PUT(request, { params }) {
  const { id } = await params; const b = await request.json();
  await query(`UPDATE Persons_tbl SET PersonName=?, OfficeName=?, WorkTellNumber1=?, WorkTellNumber2=?, WorkTellNumber3=?, MobileTellNumber1=?, MobileTellNumber2=?, MobileTellNumber3=?, Address=? WHERE PersonID=?`,
    [b.PersonName, b.OfficeName || null, b.WorkTellNumber1 || null, b.WorkTellNumber2 || null, b.WorkTellNumber3 || null, b.MobileTellNumber1 || null, b.MobileTellNumber2 || null, b.MobileTellNumber3 || null, b.Address || null, Number(id)]);
  return NextResponse.json({ success: true });
}
export async function DELETE(request, { params }) {
  const { id } = await params;
  const deps = await query(`SELECT COUNT(*) AS c FROM ApplicantFunctor_tbl WHERE ApplicantID=CAST(? AS NVARCHAR(20)) OR FunctorID=CAST(? AS NVARCHAR(20))`, [Number(id), Number(id)]);
  if (deps[0].c > 0) return NextResponse.json({ success: false, error: 'این شخص در کارها استفاده شده است.' }, { status: 400 });
  await query(`DELETE FROM Persons_tbl WHERE PersonID=?`, [Number(id)]);
  return NextResponse.json({ success: true });
}