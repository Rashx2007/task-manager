import { NextResponse } from 'next/server';
import { rescheduleTasks, schedulerFailure } from '@/lib/group-scheduler-service';

export async function POST(request) {
  try {
    // بدنه اختیاری است: {startLocal:'YYYY-MM-DD HH:mm'}؛ بدون آن، زمان فعلی سیستم.
    let body = {};
    try { body = (await request?.json?.()) || {}; } catch { body = {}; }
    const report = { skipped: [], split: [] };
    const value = await rescheduleTasks(body.startLocal ?? null, report);
    return NextResponse.json({ success: true, count: value, skipped: report.skipped, split: report.split });
  } catch (error) {
    const failure = schedulerFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
