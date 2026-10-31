import { NextResponse } from 'next/server';
import { readGroupFollowContext } from '@/lib/task-group-follow-context';
import { createGroupFollow, updateGroupFollow, groupFollowFailure } from '@/lib/task-group-follow-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = error => {
  const result = groupFollowFailure(error);
  return reply(result.body, result.status);
};
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.getAll('taskId').length !== 1) return reply({ success: false, error: 'یک کد کار معتبر لازم است.', code: 'INVALID_ID' }, 400);
    return reply({ success: true, data: await readGroupFollowContext(params.get('taskId')) });
  } catch (error) { return failure(error); }
}
async function write(request, editing) {
  let body;
  try { body = await request.json(); }
  catch { return reply({ success: false, error: 'بدنهٔ درخواست معتبر نیست.', code: 'INVALID_BODY' }, 400); }
  try {
    return reply({ success: true, data: await (editing ? updateGroupFollow(body) : createGroupFollow(body)) });
  } catch (error) { return failure(error); }
}
export async function POST(request) { return write(request, false); }
export async function PUT(request) { return write(request, true); }
// No DELETE/PATCH: group-wide deletion or implicit conversion is not enabled.
