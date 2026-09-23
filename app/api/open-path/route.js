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
    const { path: target, select } = await request.json();
    let p = String(target || "").trim();
    if (!p) return NextResponse.json({ success: false, error: "مسیری ارسال نشد." }, { status: 400 });

    let adjusted = false;
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
    const args = select && !isDir ? ["/select,", p] : [isDir ? p + "\\" : p];

    // ✅ spawn بدون شل → پرانتز/فاصله امن؛ و به کد خروج explorer توجه نمی‌کنیم
    const child = spawn("explorer", args, { detached: true, stdio: "ignore" });
    child.unref();

    return NextResponse.json({ success: true, adjusted, opened: p });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}