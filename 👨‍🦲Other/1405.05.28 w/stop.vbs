Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & fso.GetParentFolderName(WScript.ScriptFullName) & "\stop.bat" & Chr(34), 0, False
Set WshShell = Nothing