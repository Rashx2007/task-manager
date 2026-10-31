import { NextResponse } from 'next/server';
import * as followService from '@/lib/task-follow-service';

const failure = error => {
  const result = followService.followFailure(error);
  return NextResponse.json(result.body, { status: result.status });
};
export async function GET(request) {
  try {
    const taskId = new URL(request.url).searchParams.get('taskId');
    return NextResponse.json({ success: true, rows: await followService.readTaskFollows(taskId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
async function save(request, editing) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'بدنهٔ درخواست معتبر نیست.' }, { status: 400 }); }
  try { return NextResponse.json({ success: true, ...await followService.saveTaskFollow(body, editing) }); }
  catch (error) { return failure(error); }
}
export async function POST(request) { return save(request, false); }
export async function PUT(request) { return save(request, true); }
export async function DELETE(request) {
  try {
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ success: true, ...await followService.deleteTaskFollow(params.get('id'), params.get('taskId')) });
  } catch (error) { return failure(error); }
}
