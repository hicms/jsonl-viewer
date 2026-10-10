param([Parameter(Mandatory = $true)][int]$ViewerProcessId)
$ErrorActionPreference = 'Stop'
Add-Type -Namespace JsonlTests -Name MenuProbe -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr GetMenu(System.IntPtr window);
'@
$viewer = Get-Process -Id $ViewerProcessId
$viewer.Refresh()
if ($viewer.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Viewer main window was not found' }
[JsonlTests.MenuProbe]::GetMenu($viewer.MainWindowHandle).ToInt64()
