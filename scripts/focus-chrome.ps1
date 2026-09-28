Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
$h = [IntPtr]197940
[void][W]::ShowWindowAsync($h, 3)
Start-Sleep -Milliseconds 600
[void][W]::SetForegroundWindow($h)
[void][W]::keybd_event([byte]0x12, 0, 0, [UIntPtr]::Zero)   # alt down
[void][W]::keybd_event([byte]0x12, 0, 2, [UIntPtr]::Zero)   # alt up
[void][W]::SetForegroundWindow($h)
Write-Output "done"
