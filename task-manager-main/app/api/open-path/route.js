// app/api/open-path/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

function nearestExisting(p) {
  let cur = p;
  while (cur && !fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return fs.existsSync(cur) ? cur : null;
}

export async function POST(request) {
  try {
    const { path: target, select, candidates } = await request.json();
    const norm = (s) => String(s || "").trim();
    const list =
      Array.isArray(candidates) && candidates.length
        ? candidates.map(norm).filter(Boolean)
        : [norm(target)].filter(Boolean);
    if (!list.length)
      return NextResponse.json({ success: false, error: "مسیری ارسال نشد." }, { status: 400 });

    let adjusted = false;
    let p = list.find((c) => fs.existsSync(c)) || list[0];

    // ✅ نرمال‌سازی یونیکد قبل از fallback (نیم‌فاصله، علائم جهت، ی/ک عربی، فاصله‌ها)
    if (!fs.existsSync(p)) {
      const cands = [
        p.replace(/[\u200b\u200c\u200d\u200e\u200f]/g, ""),
        p.replace(/ي/g, "ی").replace(/ك/g, "ک"),
        p.replace(/\s+/g, " "),
      ];
      const hit = cands.find((c) => c && fs.existsSync(c));
      if (hit) p = hit;
    }

    if (!fs.existsSync(p)) {
      const near = nearestExisting(p);
      if (!near)
        return NextResponse.json(
          { success: false, error: "این مسیر و هیچ زیرمسیری از آن روی دیسک یافت نشد." },
          { status: 404 },
        );
      p = near;
      adjusted = true;
    }

    const isDir = fs.statSync(p).isDirectory();
    const args = select && !isDir ? ["/select,", p] : [p];
    const child = spawn("explorer", args, { detached: true, stdio: "ignore" });
    child.unref();

    return NextResponse.json({ success: true, adjusted, opened: p });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}