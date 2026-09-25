// app/api/save-report/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export async function POST(request) {
  let tmp = "";
  try {
    const { fileName, dataBase64 } = await request.json();
    if (!fileName || !dataBase64)
      return NextResponse.json({ success: false, error: "داده‌ای ارسال نشد." }, { status: 400 });

    const ext = (fileName.split(".").pop() || "txt").toLowerCase();
    tmp = path.join(os.tmpdir(), `report_${Date.now()}.${ext}`);
    fs.writeFileSync(tmp, Buffer.from(dataBase64, "base64"));

    const script = `
if (-not [Environment]::UserInteractive) { Write-Output "NONINTERACTIVE"; exit 0 }
Add-Type -AssemblyName System.Windows.Forms
$tmp  = $env:RPT_TMP
$name = $env:RPT_NAME
$dir  = 'D:\\Task(01)\\Reports'
if (-not (Test-Path -LiteralPath $dir)) { $dir = [Environment]::GetFolderPath('MyDocuments') }
$ext = ($name -split '\\.' | Select-Object -Last 1)
$sfd = New-Object System.Windows.Forms.SaveFileDialog
$sfd.FileName = $name
$sfd.InitialDirectory = $dir
$sfd.Filter = "$ext files|*.$ext|All files|*.*"
$sfd.Title = "Save Report"
$res = $sfd.ShowDialog()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
  Copy-Item -LiteralPath $tmp -Destination $sfd.FileName -Force
  Start-Process -LiteralPath $sfd.FileName
  Write-Output ("SAVED|" + $sfd.FileName)
} else {
  Write-Output "CANCELLED"
}
`;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        "powershell",
        ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"],
        { env: { ...process.env, RPT_TMP: tmp, RPT_NAME: fileName } },
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolve({ out: out.trim(), err: err.trim(), code }));
      child.stdin.write(script);
      child.stdin.end();
    });

    try { fs.unlinkSync(tmp); } catch {}

    // ✅ خطای واقعی اسکریپت (به‌جای «لغو شد» گمراه‌کننده)
    if (result.err || result.code !== 0) {
      return NextResponse.json(
        { success: false, error: "خطای دیالوگ ویندوز:\n" + (result.err || "کد خروج: " + result.code) },
        { status: 500 },
      );
    }
    if (result.out === "NONINTERACTIVE") {
      return NextResponse.json(
        { success: false, error: "سرور در نشست غیرتعاملی است و دیالوگ ویندوز نمایش داده نمی‌شود." },
        { status: 500 },
      );
    }
    if (result.out.startsWith("SAVED|")) {
      return NextResponse.json({ success: true, path: result.out.slice(6) });
    }
    return NextResponse.json({ success: false, cancelled: true });
  } catch (e) {
    try { if (tmp) fs.unlinkSync(tmp); } catch {}
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}