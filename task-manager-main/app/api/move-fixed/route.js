import { NextResponse } from 'next/server';
import { moveFixedTaskSchedules, schedulerFailure } from '@/lib/group-scheduler-service';

export async function POST(request) {
  try {
    const body = await request.json();
    const value = await moveFixedTaskSchedules(body.minutes);
    return NextResponse.json({ success: true, rescheduled: value });
  } catch (error) {
    const failure = schedulerFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
