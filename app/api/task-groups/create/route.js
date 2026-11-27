import { NextResponse } from 'next/server';
import { previewGroupCreation, createTaskGroup } from '@/lib/task-group-creation-service';
import { TaskGroupError } from '@/lib/task-groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = error => error instanceof TaskGroupError
  ? reply({ success: false, error: error.message, code: error.code }, error.status)
  : reply({ success: false, error: 'عملیات گروه‌بندی انجام نشد؛ دوباره تلاش کنید.', code: 'GROUP_CREATE_FAILED' }, 500);

// POST { mode: 'preview' | 'create', ...body }. Preview never writes.
export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return reply({ success: false, error: 'بدنهٔ درخواست معتبر نیست.', code: 'INVALID_BODY' }, 400); }
  if (!body || typeof body !== 'object' || !['preview', 'create'].includes(body.mode)) {
    return reply({ success: false, error: 'نوع عملیات معتبر نیست.', code: 'INVALID_MODE' }, 400);
  }
  const { mode, ...input } = body;
  try {
    const data = mode === 'preview' ? await previewGroupCreation(input) : await createTaskGroup(input);
    return reply({ success: true, data });
  } catch (error) { return failure(error); }
}
