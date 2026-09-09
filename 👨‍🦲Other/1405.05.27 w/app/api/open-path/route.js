import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function POST(request) {
  try {
    const { path } = await request.json();
    if (!path) return NextResponse.json({ success: false, error: 'مسیری مشخص نشده' }, { status: 400 });
    await new Promise((resolve, reject) => exec(`start "" "${path}"`, (err) => (err ? reject(err) : resolve())));
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}