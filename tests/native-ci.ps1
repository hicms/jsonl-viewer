Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'This script configures an ephemeral GitHub-hosted Windows runner. Use npm run test:native locally.'
}

$application = Split-Path -Leaf $env:JSONL_QA_EXE
$port = if ($env:JSONL_QA_CDP_PORT) { [int] $env:JSONL_QA_CDP_PORT } else { 9224 }
if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid test CDP port.' }

# Elevated WebView2 150+ hosts honor HKLM policies instead of environment switches.
# https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645
$policy = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
if (-not (Test-Path -LiteralPath $policy)) {
    New-Item -Path $policy -Force | Out-Null
}
if ((Get-Item -LiteralPath $policy).GetValueNames() -contains $application) {
    throw "An existing WebView2 policy is already configured for $application."
}
try {
    New-ItemProperty -LiteralPath $policy -Name $application -Value "--remote-debugging-port=$port" -PropertyType String | Out-Null
    npm run test:native
    if ($LASTEXITCODE -ne 0) { throw "Native WebView2 tests failed (exit code $LASTEXITCODE)." }
} finally {
    Remove-ItemProperty -LiteralPath $policy -Name $application -ErrorAction SilentlyContinue
}
