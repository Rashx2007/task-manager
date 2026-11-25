import { NextResponse } from 'next/server';
import { readTaskGroupSnapshot } from '@/lib/task-group-reader';
import { TaskGroupError } from '@/lib/task-groups';

export const dynamic = 'force-dynamic';

// Read-only stage. No POST/PUT/PATCH/DELETE handlers are enabled here.
export async function GET(request) {
  const reply = (body, status = 200) => NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  try {
    const parameters = new URL(request.url).searchParams;
    if (parameters.getAll('taskId').length !== 1) return reply({ success: false, error: 'یک کد کار معتبر لازم است.', code: 'INVALID_ID' }, 400);
    const data = await readTaskGroupSnapshot(parameters.get('taskId'));
    return reply({ success: true, data });
  } catch (error) {
    if (error instanceof TaskGroupError) return reply({ success: false, error: error.message, code: error.code }, error.status);
    return reply({ success: false, error: 'دریافت اطلاعات گروه انجام نشد؛ دوباره تلاش کنید.', code: 'GROUP_READ_FAILED' }, 500);
  }
}
