// app/api/open-dwg-dialog/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

// ✅ دیالوگ OpenFileDialog بومی ویندوز؛ نتیجه به‌جای stdout در فایل موقت نوشته می‌شود
export async function POST(request) {
  let initialDir = "";
  try {
    initialDir = String((await request.json())?.initialDir || "");
  } catch {}

  const resultFile = path.join(os.tmpdir(), `dwg_dialog_${Date.now()}.txt`);

  const script = `
$ErrorActionPreference = "Stop"
$out = $env:DWG_RESULT_FILE
try {
  Add-Type -AssemblyName System.Windows.Forms
  $dir = $env:DWG_INITIAL_DIR
  $ofd = New-Object System.Windows.Forms.OpenFileDialog
  $ofd.Filter = "DWG files (*.dwg)|*.dwg|All files (*.*)|*.*"
  $ofd.Title = "Select Map File (DWG)"
  $ofd.RestoreDirectory = $true
  if ($dir -and (Test-Path -LiteralPath $dir)) { $ofd.InitialDirectory = $dir }
  $res = $ofd.ShowDialog()
  if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [System.IO.File]::WriteAllText($out, ("PICKED|" + $ofd.FileName))
  } else {
    [System.IO.File]::WriteAllText($out, "CANCELLED")
  }
} catch {
  [System.IO.File]::WriteAllText($out, ("ERROR|" + $_.Exception.Message))
}
`;

  try {
    const run = await new Promise((resolve, reject) => {
      const child = spawn(
        "powershell",
        ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"],
        {
          env: {
            ...process.env,
            DWG_INITIAL_DIR: initialDir,
            DWG_RESULT_FILE: resultFile,
          },
        },
      );
      let err = "";
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, err }));
      child.stdin.write(script);
      child.stdin.end();
    });

    let out = "";
    try {
      out = fs.readFileSync(resultFile, "utf8").trim();
    } catch {}
    try {
      fs.unlinkSync(resultFile);
    } catch {}

    console.log("[open-dwg-dialog] result:", out || "(empty)", "| exit:", run.code);

    if (!out)
      return NextResponse.json(
        {
          success: false,
          error:
            "دیالوگ ویندوز هیچ نتیجه‌ای ننوشت؛ سرور Next باید در همان نشست تعاملی ویندوز (ترمینال دسکتاپ) اجرا شود، نه به‌صورت سرویس.",
        },
        { status: 500 },
      );
    if (out.startsWith("ERROR|"))
      return NextResponse.json({ success: false, error: "خطای PowerShell:\n" + out.slice(6) }, { status: 500 });
    if (out === "CANCELLED") return NextResponse.json({ success: false, cancelled: true });
    if (out.startsWith("PICKED|")) return NextResponse.json({ success: true, path: out.slice(7) });
    return NextResponse.json({ success: false, error: "پاسخ نامشخص: " + out }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}