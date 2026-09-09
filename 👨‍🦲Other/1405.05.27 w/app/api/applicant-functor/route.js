import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// معادل AchievingPersonId در C#
async function resolvePersonId(name) {
  if (!String(name || '').trim()) return null;
  const rows = await query(`SELECT PersonID FROM Persons_tbl WHERE PersonName = ?`, [String(name).trim()]);
  return rows.length ? String(rows[0].PersonID) : null;
}

// معادل CheckingApplicantFunctorIDExistence + LoadApplicantFunctorData + RetrivingPersonData
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = Number(searchParams.get('taskId'));

    const rows = await query(
      `SELECT AF.ApplicantID, AF.FunctorID,
              pa.PersonName AS ApplicantName, pa.WorkTellNumber1 AS ApplicantWork1, pa.MobileTellNumber1 AS ApplicantMobile1,
              pf.PersonName AS FunctorName, pf.WorkTellNumber1 AS FunctorWork1, pf.MobileTellNumber1 AS FunctorMobile1
       FROM ApplicantFunctor_tbl AF
       LEFT JOIN Persons_tbl pa ON AF.ApplicantID IS NOT NULL AND ISNUMERIC(AF.ApplicantID) = 1
                                AND pa.PersonID = CAST(AF.ApplicantID AS INT)
       LEFT JOIN Persons_tbl pf ON AF.FunctorID IS NOT NULL AND ISNUMERIC(AF.FunctorID) = 1
                                AND pf.PersonID = CAST(AF.FunctorID AS INT)
       WHERE AF.TaskID = ?`,
      [taskId]
    );

    if (rows.length) {
      return NextResponse.json({ success: true, exists: true, data: rows[0] });
    }
    return NextResponse.json({ success: true, exists: false, data: null });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// معادل btnOk_Click → Insert/UpdateApplicantFunctor_tbl
export async function POST(request) {
  try {
    const { taskId, applicantName = '', functorName = '' } = await request.json();
    const tid = Number(taskId);

    const applicantId = await resolvePersonId(applicantName);
    const functorId = await resolvePersonId(functorName);

    const exists = await query(`SELECT ApplicantFunctorID FROM ApplicantFunctor_tbl WHERE TaskID = ?`, [tid]);
    if (exists.length) {
      await query(
        `UPDATE ApplicantFunctor_tbl SET ApplicantID = ?, FunctorID = ? WHERE TaskID = ?`,
        [applicantId, functorId, tid]
      );
    } else {
      await query(
        `INSERT INTO ApplicantFunctor_tbl (TaskID, ApplicantID, FunctorID) VALUES (?, ?, ?)`,
        [tid, applicantId, functorId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}