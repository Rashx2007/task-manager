import { NextResponse } from 'next/server';
import * as statusService from '@/lib/task-status-service';
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const data = await statusService.readTaskStatusHistory({ taskId: params.get('taskId'), beforeId: params.get('beforeId'), limit: params.get('limit') ?? 20 });
    return reply({ success: true, data });
  } catch (error) {
    const failure = statusService.statusFailure(error);
    return reply(failure.body, failure.status);
  }
}
