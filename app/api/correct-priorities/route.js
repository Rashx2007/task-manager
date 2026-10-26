import { NextResponse } from 'next/server';
import { correctTaskPriorities, schedulerFailure } from '@/lib/group-scheduler-service';

export async function POST() {
  try {
    const value = await correctTaskPriorities();
    return NextResponse.json({ success: true, corrected: value });
  } catch (error) {
    const failure = schedulerFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
