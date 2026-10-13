param(
    [Parameter(Mandatory = $true)][int]$ViewerProcessId,
    [ValidateSet('state', 'restore', 'drag', 'close')][string]$Action = 'state'
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WindowProbe {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr process);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
}
'@
[WindowProbe]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$viewer = Get-Process -Id $ViewerProcessId
$viewer.Refresh()
$handle = $viewer.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw 'Viewer main window was not found' }
if ($Action -eq 'restore') {
    [WindowProbe]::ShowWindow($handle, 9) | Out-Null
    [WindowProbe]::SetForegroundWindow($handle) | Out-Null
}
if ($Action -eq 'close') {
    [WindowProbe]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}
if ($Action -eq 'drag') {
    [WindowProbe]::ShowWindow($handle, 9) | Out-Null
    $cursor = New-Object WindowProbe+Point
    [WindowProbe]::GetCursorPos([ref]$cursor) | Out-Null
    $point = New-Object WindowProbe+Point
    $scale = [WindowProbe]::GetDpiForWindow($handle) / 96
    $point.X = [int](400 * $scale)
    $point.Y = [int](20 * $scale)
    [WindowProbe]::ClientToScreen($handle, [ref]$point) | Out-Null
    $currentThread = [WindowProbe]::GetCurrentThreadId()
    $foregroundThread = [WindowProbe]::GetWindowThreadProcessId([WindowProbe]::GetForegroundWindow(), [IntPtr]::Zero)
    [WindowProbe]::AttachThreadInput($currentThread, $foregroundThread, $true) | Out-Null
    try {
        [WindowProbe]::BringWindowToTop($handle) | Out-Null
        [WindowProbe]::SetForegroundWindow($handle) | Out-Null
    } finally {
        [WindowProbe]::AttachThreadInput($currentThread, $foregroundThread, $false) | Out-Null
    }
    try {
        if (-not [WindowProbe]::SetCursorPos($point.X, $point.Y)) { throw 'Native mouse positioning is unavailable' }
        [WindowProbe]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 150
        [WindowProbe]::SetCursorPos(($point.X + 60), ($point.Y + 45)) | Out-Null
        Start-Sleep -Milliseconds 150
    } finally {
        [WindowProbe]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
        [WindowProbe]::SetCursorPos($cursor.X, $cursor.Y) | Out-Null
    }
}
$rect = New-Object WindowProbe+Rect
if (-not [WindowProbe]::GetWindowRect($handle, [ref]$rect)) { throw 'Cannot read window geometry' }
$topPoint = (($rect.Top + 1) -shl 16) -bor (($rect.Left + 200) -band 0xffff)
$topHit = [WindowProbe]::SendMessage($handle, 0x0084, [IntPtr]::Zero, [IntPtr]$topPoint).ToInt32()
@{
    maximized = [WindowProbe]::IsZoomed($handle)
    minimized = [WindowProbe]::IsIconic($handle)
    left = $rect.Left
    top = $rect.Top
    width = $rect.Right - $rect.Left
    height = $rect.Bottom - $rect.Top
    topHit = $topHit
    visible = [WindowProbe]::IsWindowVisible($handle)
    foreground = [WindowProbe]::GetForegroundWindow() -eq $handle
} | ConvertTo-Json -Compress
