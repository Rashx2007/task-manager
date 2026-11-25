import { NextResponse } from 'next/server';
import { increaseTaskPriorities, schedulerFailure } from '@/lib/group-scheduler-service';

export async function POST() {
  try {
    const value = await increaseTaskPriorities();
    return NextResponse.json({ success: true, changed: value });
  } catch (error) {
    const failure = schedulerFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
