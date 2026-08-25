' One-click launcher for inkfight. Starts the static server hidden (no console
' flash) then opens the game in the default browser. Kept ASCII-only on purpose:
' VBScript is picky about file encoding, and non-ASCII comments here previously
' got misread as GBK and broke parsing ("Object required: 'fso'" on line 3).
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
gameDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = gameDir

' 0 = hidden window, False = don't wait (server must keep running)
shell.Run "node serve-game.mjs", 0, False

' give the server a moment to come up before opening the browser
WScript.Sleep 900

shell.Run "http://localhost:5566/inkfight.html", 1, False
