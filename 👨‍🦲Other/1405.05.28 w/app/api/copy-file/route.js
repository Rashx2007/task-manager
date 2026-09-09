import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const normalize = (s) => String(s || '').replace(/[^0-9a-zA-Z\u0600-\u06FF]+/g, '');
// پشتیبانی مسیرهای بلند ویندوز
const nt = (p) => (String(p).length > 240 && !String(p).startsWith('\\\\?\\') ? '\\\\?\\' + p : p);

function findSource(candidates) {
  for (const cand of candidates) {
    const s = String(cand || '').trim();
    if (s && fs.existsSync(nt(s))) return s;
  }
  for (const cand of candidates) {
    const s = String(cand || '').trim();
    if (!s) continue;
    const dir = path.dirname(s);
    if (!fs.existsSync(nt(dir)) || !fs.statSync(nt(dir)).isDirectory()) continue;
    const base = normalize(path.basename(s));
    if (!base) continue;
    const entries = fs.readdirSync(nt(dir));
    const exact = entries.find((f) => normalize(f) === base);
    if (exact) return path.join(dir, exact);
    const part = entries.find((f) => {
      const nf = normalize(f);
      return nf.includes(base) || base.includes(nf);
    });
    if (part) return path.join(dir, part);
  }
  return null;
}

// نگاشت آینه‌ای: حذف درایو مبدأ و جایگذاری ریشهٔ اشتراکی
function mapDest(src, shareRoot) {
  const { root } = path.parse(src);
  const rel = root ? src.slice(root.length) : src;
  return path.join(shareRoot, rel);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const sources = Array.isArray(body.sources) && body.sources.length ? body.sources : [body.src];
    const shareRoot = String(body.destDir || '').trim();
    if (!shareRoot) return NextResponse.json({ success: false, error: 'پوشهٔ اشتراکی مشخص نشده است.' }, { status: 400 });

    let found = findSource(sources);
    if (!found) return NextResponse.json({ success: false, error: 'مبدأ یافت نشد. مسیرهای بررسی‌شده:\n' + sources.filter(Boolean).join('\n') }, { status: 404 });

    // ✅ اگر «کپی آینه‌ای پوشه» خواسته شده و مبدأ فایل است، پوشهٔ والد مبنا می‌شود تا کل محتوا برود
    if (body.mirrorDir && fs.statSync(nt(found)).isFile()) found = path.dirname(found);

    const dest = mapDest(found, shareRoot);

    if (fs.statSync(nt(found)).isDirectory()) {
      fs.mkdirSync(nt(dest), { recursive: true });           // نبود بساز
      fs.cpSync(nt(found), nt(dest), { recursive: true, force: true }); // کل محتوا + بازنویسی همنام‌ها
    } else {
      fs.mkdirSync(nt(path.dirname(dest)), { recursive: true });
      fs.copyFileSync(nt(found), nt(dest));
    }
    return NextResponse.json({ success: true, dest, src: found });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}