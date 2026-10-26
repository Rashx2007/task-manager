import { NextResponse } from 'next/server';
import { saveTaskSchedule, schedulerFailure } from '@/lib/group-scheduler-service';

export async function POST(request) {
  try {
    return NextResponse.json(await saveTaskSchedule(await request.json()));
  } catch (error) {
    const failure = schedulerFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
