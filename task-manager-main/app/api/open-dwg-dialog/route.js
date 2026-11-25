// app/api/open-dwg-dialog/route.js
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

// ✅ دیالوگ OpenFileDialog بومی ویندوز؛ اسکریپت به‌صورت فایل .ps1 اجرا می‌شود (نه stdin)
export async function POST(request) {
  let initialDir = "";
  try {
    initialDir = String((await request.json())?.initialDir || "");
  } catch {}

  const stamp = Date.now();
  const resultFile = path.join(os.tmpdir(), `dwg_dialog_${stamp}.txt`);
  const scriptFile = path.join(os.tmpdir(), `dwg_dialog_${stamp}.ps1`);

  const script = [
    '$ErrorActionPreference = "Stop"',
    "try {",
    "  Add-Type -AssemblyName System.Windows.Forms",
    "  $dir = $env:DWG_INITIAL_DIR",
    "  $ofd = New-Object System.Windows.Forms.OpenFileDialog",
    '  $ofd.Filter = "DWG files (*.dwg)|*.dwg|All files (*.*)|*.*"',
    '  $ofd.Title = "Select Map File (DWG)"',
    "  $ofd.RestoreDirectory = $true",
    "  if ($dir -and (Test-Path -LiteralPath $dir)) { $ofd.InitialDirectory = $dir }",
    "  $res = $ofd.ShowDialog()",
    "  if ($res -eq [System.Windows.Forms.DialogResult]::OK) {",
    '    [System.IO.File]::WriteAllText($env:DWG_RESULT_FILE, ("PICKED|" + $ofd.FileName))',
    "  } else {",
    '    [System.IO.File]::WriteAllText($env:DWG_RESULT_FILE, "CANCELLED")',
    "  }",
    "} catch {",
    '  [System.IO.File]::WriteAllText($env:DWG_RESULT_FILE, ("ERROR|" + $_.Exception.Message))',
    "}",
  ].join("\r\n");

  try {
    fs.writeFileSync(scriptFile, script, "ascii");
    const run = await new Promise((resolve, reject) => {
      const child = spawn(
        "powershell",
        ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile],
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
    });

    let out = "";
    let resultExists = false;
    try {
      out = fs.readFileSync(resultFile, "utf8").trim();
      resultExists = true;
    } catch {}
    try { fs.unlinkSync(resultFile); } catch {}
    try { fs.unlinkSync(scriptFile); } catch {}

    console.log("[open-dwg-dialog] result:", out || "(empty)", "| exit:", run.code, "| stderr:", run.err.slice(0, 300));

    if (!out)
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          error:
            "دیالوگ سرور نتیجه‌ای ننوشت (exit=" +
            run.code +
            ", resultFile=" +
            (resultExists ? "exists-but-empty" : "missing") +
            ").\nstderr: " +
            run.err.slice(0, 300),
        },
        { status: 500 },
      );
    if (out.startsWith("ERROR|"))
      return NextResponse.json({ success: false, fallback: true, error: "خطای PowerShell:\n" + out.slice(6) }, { status: 500 });
    if (out === "CANCELLED") return NextResponse.json({ success: false, cancelled: true });
    if (out.startsWith("PICKED|")) return NextResponse.json({ success: true, path: out.slice(7) });
    return NextResponse.json({ success: false, fallback: true, error: "پاسخ نامشخص: " + out }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ success: false, fallback: true, error: e.message }, { status: 500 });
  }
}