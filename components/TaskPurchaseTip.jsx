"use client";
import { useEffect, useRef, useState } from 'react';
import Tip from './Tip';
import { parseTaskId } from '@/lib/task-inspection';
import { readTaskPurchaseNumbers } from '@/lib/task-purchase-numbers';

export default function TaskPurchaseTip({ taskId, children, block = false }) {
  const id = parseTaskId(taskId);
  const currentId = useRef(id); currentId.current = id;
  const request = useRef({ version: 0, controller: null });
  const [result, setResult] = useState(null);
  const cancel = () => {
    request.current.version++;
    request.current.controller?.abort();
    request.current.controller = null;
  };
  useEffect(() => cancel, [id]);

  const load = async () => {
    if (!id || request.current.controller) return;
    const controller = new AbortController();
    const version = ++request.current.version;
    request.current.controller = controller;
    const current = () => !controller.signal.aborted && request.current.version === version && currentId.current === id;
    setResult({ id, status: 'loading' });
    try {
      const data = await readTaskPurchaseNumbers(id, { signal: controller.signal });
      if (current()) setResult({ id, status: 'ready', data });
    } catch (error) {
      if (current() && error.name !== 'AbortError') setResult({ id, status: 'error' });
    } finally {
      if (request.current.controller === controller) request.current.controller = null;
    }
  };

  const text = key => {
    if (!id) return 'پس از ثبت کار';
    if (result?.id !== id || result.status === 'loading') return 'در حال دریافت…';
    if (result.status === 'error') return 'دریافت ناموفق؛ دوباره هاور کنید';
    return result.data[key].join('، ') || 'ثبت نشده';
  };
  const tip = <>
    <span style={{ display: 'block' }}>شماره‌های درخواست: <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{text('requestNumbers')}</span></span>
    <span style={{ display: 'block' }}>شماره‌های خرید: <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{text('purchaseNumbers')}</span></span>
  </>;
  return <Tip tip={tip} block={block} onOpen={load} onClose={cancel} focusable zIndex={100060}>{children}</Tip>;
}
