import { NextResponse } from 'next/server';
import * as statusService from '@/lib/task-status-service';

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'بدنهٔ درخواست معتبر نیست.' }, { status: 400 }); }
  try {
    return NextResponse.json({ success: true, ...await statusService.completeTask(body?.taskId) });
  } catch (error) {
    const failure = statusService.statusFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
