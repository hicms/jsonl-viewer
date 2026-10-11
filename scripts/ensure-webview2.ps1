Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-WebView2Version {
    $client = 'Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    foreach ($key in @("HKLM:\SOFTWARE\WOW6432Node\$client", "HKLM:\SOFTWARE\$client", "HKCU:\SOFTWARE\$client")) {
        $value = Get-ItemPropertyValue -LiteralPath $key -Name pv -ErrorAction SilentlyContinue
        $version = $null
        if ([version]::TryParse($value, [ref] $version) -and $version -gt [version] '0.0.0.0') {
            return $version
        }
    }
}

$installed = Get-WebView2Version
if ($installed) {
    Write-Host "WebView2 runtime already installed: $installed"
    return
}

# The Microsoft bootstrapper installs the runtime matching the machine architecture.
# https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
$installer = Join-Path ([IO.Path]::GetTempPath()) "jsonl-webview2-$([guid]::NewGuid()).exe"
try {
    Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $installer
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') {
        throw 'WebView2 bootstrapper must have a valid Microsoft signature.'
    }
    $setup = Start-Process -FilePath $installer -ArgumentList '/silent', '/install' -Wait -PassThru -WindowStyle Hidden
    $installed = Get-WebView2Version
    if (-not $installed) {
        throw "WebView2 installation failed (exit code $($setup.ExitCode))."
    }
    Write-Host "WebView2 runtime installed: $installed (setup exit code $($setup.ExitCode))"
} finally {
    Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
}
