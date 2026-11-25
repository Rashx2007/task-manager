import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  try {
    let rows = await query(`SELECT AF.ApplicantID, AF.FunctorID, pa.PersonName AS ApplicantName, pf.PersonName AS FunctorName
      FROM ApplicantFunctor_tbl AF
      LEFT JOIN Persons_tbl pa ON AF.ApplicantID = pa.PersonID
      LEFT JOIN Persons_tbl pf ON AF.FunctorID = pf.PersonID
      WHERE AF.TaskID = ?`, [taskId]);
    if (!rows.length) {
      // ✅ fallback: ستون‌های ApplicantID/FunctorID خود Tsk_tbl
      rows = await query(`SELECT tsk.ApplicantID, tsk.FunctorID, pa.PersonName AS ApplicantName, pf.PersonName AS FunctorName
        FROM Tsk_tbl tsk
        LEFT JOIN Persons_tbl pa ON tsk.ApplicantID = pa.PersonID
        LEFT JOIN Persons_tbl pf ON tsk.FunctorID = pf.PersonID
        WHERE tsk.TaskID = ?`, [taskId]);
    }
    const data = rows[0] || null;
    return NextResponse.json({
      success: true,
      exists: !!(data && (data.ApplicantName || data.FunctorName || data.ApplicantID || data.FunctorID)),
      data,
    });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const { taskId, applicantName, functorName } = await request.json();
    const pid = async (name) => {
      if (!name || !String(name).trim()) return null;
      const r = await query(`SELECT PersonID FROM Persons_tbl WHERE PersonName=?`, [String(name).trim()]);
      if (r.length) return r[0].PersonID;
      const ins = await query(`INSERT INTO Persons_tbl (PersonName) OUTPUT INSERTED.PersonID VALUES (?)`, [String(name).trim()]);
      return ins[0].PersonID;
    };
    const a = await pid(applicantName);
    const f = await pid(functorName);
    const ex = await query(`SELECT ApplicantFunctorID FROM ApplicantFunctor_tbl WHERE TaskID=?`, [Number(taskId)]);
    if (ex.length) await query(`UPDATE ApplicantFunctor_tbl SET ApplicantID=?, FunctorID=? WHERE TaskID=?`, [a, f, Number(taskId)]);
    else await query(`INSERT INTO ApplicantFunctor_tbl (TaskID, ApplicantID, FunctorID) VALUES (?,?,?)`, [Number(taskId), a, f]);
    // ✅ همگام‌سازی با ستون‌های Tsk_tbl (مثل دسکتاپ)
    await query(`UPDATE Tsk_tbl SET ApplicantID=?, FunctorID=? WHERE TaskID=?`, [a, f, Number(taskId)]);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}