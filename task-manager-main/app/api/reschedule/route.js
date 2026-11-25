import { NextResponse } from 'next/server';
import { rescheduleTasks, schedulerFailure } from '@/lib/group-scheduler-service';

export async function POST() {
  try {
    const value = await rescheduleTasks();
    return NextResponse.json({ success: true, count: value });
  } catch (error) {
    const failure = schedulerFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
