import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { parseTaskId } from '@/lib/task-inspection';
import { summarizeTaskPurchaseNumbers } from '@/lib/task-purchase-numbers';

const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Read-only, fetched on hover/focus rather than one request for every table row.
export async function GET(request) {
  const id = parseTaskId(new URL(request.url).searchParams.get('taskId'));
  if (!id) return reply({ success: false, error: 'کد کار معتبر نیست.' }, 400);
  try {
    const rows = await query(`SELECT TaskID, RequestNumber, RegisterNumber
      FROM Purchase_Request_tbl WHERE TaskID = ? ORDER BY RequestID DESC`, [id]);
    return reply({ success: true, data: summarizeTaskPurchaseNumbers(id, rows) });
  } catch {
    return reply({ success: false, error: 'دریافت شماره‌های درخواست و خرید ناموفق بود.' }, 500);
  }
}
