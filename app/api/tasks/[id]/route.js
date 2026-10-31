import { NextResponse } from "next/server";
import { query, runTransaction } from "@/lib/db";
import { normalizeDigits } from "@/lib/assetRules";
import * as statusService from "@/lib/task-status-service";

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const rows = await query(
      `SELECT tsk.*, COALESCE(atk.AssetID, tsk.AssetID) AS ResolvedAssetID,
      TD.DueDateTime AS TDDue, TD.EndDateTime AS TDEnd, TD.Priorities AS TDP, TD.FixedDueTime AS TDF
      FROM Tsk_tbl tsk
      LEFT JOIN Asset_Task_tbl atk ON tsk.TaskID = atk.TaskID
      LEFT JOIN TimeDate_tbl TD ON TD.TaskID = tsk.TaskID
      WHERE tsk.TaskID = ?`,
      [Number(id)],
    );
    return NextResponse.json({ success: true, data: rows[0] || null });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 },
    );
  }
}

export async function PUT(request, { params }) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: "بدنهٔ درخواست معتبر نیست." }, { status: 400 }); }
  try {
    const { id } = await params;
    return NextResponse.json({ success: true, ...await statusService.saveTaskEdit(id, body) });
  } catch (error) {
    const failure = statusService.statusFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const text = normalizeDigits(id).trim();
    const tid = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(tid) || tid < 1 || tid > 2147483647) {
      return NextResponse.json(
        { success: false, error: "کد کار معتبر نیست." },
        { status: 400 },
      );
    }

    const deleted = await runTransaction(async (tx) => {
      // تمام حذف‌ها باید روی همان اتصال و در یک تراکنش انجام شوند.
      const rows = await tx(
        `SELECT TaskID FROM Tsk_tbl WITH (UPDLOCK, HOLDLOCK) WHERE TaskID=?`,
        [tid],
      );
      if (!rows.length) return false;

      await tx(`DELETE FROM TimeDate_tbl WHERE TaskID=?`, [tid]);
      await tx(`DELETE FROM Asset_Task_tbl WHERE TaskID=?`, [tid]);
      await tx(`DELETE FROM ApplicantFunctor_tbl WHERE TaskID=?`, [tid]);
      await tx(`DELETE FROM Follow_tbl WHERE TaskID=?`, [tid]);
      await tx(`DELETE FROM Folder_tbl WHERE TaskID=?`, [tid]);
      await tx(`DELETE FROM Tsk_tbl WHERE TaskID=?`, [tid]);
      return true;
    });

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "این کار پیدا نشد؛ ممکن است قبلاً حذف شده باشد. فهرست را تازه‌سازی کنید." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    // کلیدهای خارجی، از جمله سوابق گروه‌ها، نباید با حذف آبشاری دور زده شوند.
    const errors = Array.isArray(e) ? e : [e, ...(Array.isArray(e?.errors) ? e.errors : [])];
    const referenced = errors.some((error) =>
      Number(error?.number) === 547 || Number(error?.code) === 547 ||
      /foreign key|reference constraint/i.test(String(error?.message || "")),
    );
    return NextResponse.json(
      { success: false, error: referenced
        ? "این کار یا سوابق آن در اطلاعات دیگری ارجاع دارد؛ حذف انجام نشد. ابتدا وابستگی‌ها باید بررسی شوند."
        : "حذف کار با خطا روبه‌رو شد؛ فهرست را تازه‌سازی کنید و پیش از تلاش مجدد، وضعیت کار را بررسی کنید." },
      { status: referenced ? 409 : 500 },
    );
  }
}
