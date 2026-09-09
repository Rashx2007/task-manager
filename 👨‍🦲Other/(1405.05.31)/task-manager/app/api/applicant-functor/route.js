import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    const rows = await query(`SELECT AF.ApplicantID, AF.FunctorID, pa.PersonName AS ApplicantName, pf.PersonName AS FunctorName
      FROM ApplicantFunctor_tbl AF LEFT JOIN Persons_tbl pa ON AF.ApplicantID=pa.PersonID LEFT JOIN Persons_tbl pf ON AF.FunctorID=pf.PersonID WHERE AF.TaskID=?`, [taskId]);
    return NextResponse.json({ success: true, exists: rows.length > 0, data: rows[0] || null });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
export async function POST(request) {
  try {
    const { taskId, applicantName, functorName } = await request.json();
    const pid = async (name) => {
      if (!name) return null;
      const r = await query(`SELECT PersonID FROM Persons_tbl WHERE PersonName=?`, [name]);
      if (r.length) return r[0].PersonID;
      const ins = await query(`INSERT INTO Persons_tbl (PersonName) OUTPUT INSERTED.PersonID VALUES (?)`, [name]);
      return ins[0].PersonID;
    };
    const a = await pid(applicantName); const f = await pid(functorName);
    const ex = await query(`SELECT ApplicantFunctorID FROM ApplicantFunctor_tbl WHERE TaskID=?`, [Number(taskId)]);
    if (ex.length) await query(`UPDATE ApplicantFunctor_tbl SET ApplicantID=?, FunctorID=? WHERE TaskID=?`, [a, f, Number(taskId)]);
    else await query(`INSERT INTO ApplicantFunctor_tbl (TaskID, ApplicantID, FunctorID) VALUES (?,?,?)`, [Number(taskId), a, f]);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}