import { NextResponse } from 'next/server';
import { rescheduleAll } from '@/lib/scheduler-logic';
export async function POST() {
  try { const n = await rescheduleAll(); return NextResponse.json({ success: true, count: n }); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}