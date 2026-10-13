param(
    [Parameter(Mandatory = $true)][int]$ViewerProcessId,
    [Parameter(Mandatory = $true)][ValidateSet('restore', 'close')][string]$Action
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WindowAction {
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, IntPtr className, string title);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
}
'@
# Process.MainWindowHandle can select Tauri's single-instance IPC helper after minimizing.
$handle = [IntPtr]::Zero
[uint32]$ownerProcessId = 0
do {
    $handle = [WindowAction]::FindWindowEx([IntPtr]::Zero, $handle, [IntPtr]::Zero, 'JSONL Viewer')
    if ($handle -eq [IntPtr]::Zero) { throw 'Viewer main window was not found' }
    [WindowAction]::GetWindowThreadProcessId($handle, [ref]$ownerProcessId) | Out-Null
} while ($ownerProcessId -ne $ViewerProcessId)
if ($Action -eq 'restore') {
    [WindowAction]::ShowWindow($handle, 9) | Out-Null
} elseif (-not [WindowAction]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
    throw 'Cannot request native window close'
}
