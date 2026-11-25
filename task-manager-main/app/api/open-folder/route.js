import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// ✅ حذف کاراکترهای غیرمجاز نام پوشه (ست اول درایو دست‌نخورده می‌ماند)
const cleanSegment = (seg) => String(seg).replace(/[*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
const sanitizePath = (p) =>
  String(p || '')
    .split(/[\\/]+/)
    .map((seg, i) => (i === 0 ? seg : cleanSegment(seg)))
    .filter((seg, i) => i === 0 || seg !== '')
    .join('\\');

// ✅ نزدیک‌ترین پوشهٔ والدِ موجود روی دیسک
const nearestExisting = (p) => {
  let cur = String(p || '').replace(/[\\/]+$/, '');
  while (cur && !fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur && fs.existsSync(cur) ? cur : null;
};

export async function POST(request) {
  try {
    const b = await request.json();
    const raw = String(b.path || '');
    if (!raw.trim()) return NextResponse.json({ success: false, error: 'مسیری ارسال نشد.' });

    const clean = sanitizePath(raw);
    const target = nearestExisting(clean) || nearestExisting(raw);
    if (!target) {
      return NextResponse.json({ success: false, error: `هیچ بخشی از این مسیر روی دیسک وجود ندارد:\n${clean}` });
    }

    // ✅ spawn بدون تکیه بر کد خروج explorer (جلوگیری از Command failed کاذب)
    const child = spawn('explorer', [target], { detached: true, stdio: 'ignore' });
    child.unref();

    return NextResponse.json({
      success: true,
      opened: target,
      adjusted: target !== clean ? clean : null,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}