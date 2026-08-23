// move-fixed/route.js
import { NextResponse } from 'next/server';
import { moveFixedTasksForward } from '@/lib/scheduler-logic';
export async function POST(request) {
  try { const { minutes } = await request.json(); const n = await moveFixedTasksForward(minutes); return NextResponse.json({ success: true, rescheduled: n }); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}