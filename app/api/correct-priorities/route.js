// correct-priorities/route.js
import { NextResponse } from 'next/server';
import { correctPriorityNames } from '@/lib/scheduler-logic';
export async function POST() {
  try { const n = await correctPriorityNames(); return NextResponse.json({ success: true, corrected: n }); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}