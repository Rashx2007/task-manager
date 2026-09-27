// app/api/open-dwg-dialog/route.js
import { NextResponse } from "next/server";
import { spawn } from "child_process";

// ✅ دیالوگ OpenFileDialog بومی ویندوز؛ بدون هیچ محدودیت پوشه‌ای
export async function POST(request) {
  let initialDir = "";
  try {
    initialDir = String((await request.json())?.initialDir || "");
  } catch {}
  try {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$dir = $env:DWG_INITIAL_DIR
$ofd = New-Object System.Windows.Forms.OpenFileDialog
$ofd.Filter = "DWG files (*.dwg)|*.dwg|All files (*.*)|*.*"
$ofd.Title = "Select Map File (DWG)"
$ofd.RestoreDirectory = $true
if ($dir -and (Test-Path -LiteralPath $dir)) { $ofd.InitialDirectory = $dir }
$res = $ofd.ShowDialog()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output ("PICKED|" + $ofd.FileName)
} else {
  Write-Output "CANCELLED"
}
`;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        "powershell",
        ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"],
        { env: { ...process.env, DWG_INITIAL_DIR: initialDir } },
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

    if (result.err || result.code !== 0)
      return NextResponse.json(
        { success: false, error: "خطای دیالوگ ویندوز:\n" + (result.err || "کد خروج: " + result.code) },
        { status: 500 },
      );
    if (!result.out || result.out === "CANCELLED")
      return NextResponse.json({ success: false, cancelled: true });
    if (result.out.startsWith("PICKED|"))
      return NextResponse.json({ success: true, path: result.out.slice(7) });
    return NextResponse.json({ success: false, error: "پاسخ نامشخص دیالوگ: " + result.out }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}