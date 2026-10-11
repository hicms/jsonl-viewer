param([switch] $Publish, [string] $Version, [switch] $Help)

# GitHub is simulated; version edits, commits, tags and atomic pushes use real Git.
function gh {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'api') {
        if ($env:RELEASE_TEST_FAILURE -eq 'existing-release') { '42' }
        if ($env:RELEASE_TEST_FAILURE -eq 'api-failure') { $global:LASTEXITCODE = 1 }
        return
    }
    switch ("$($args[0]) $($args[1])") {
        'repo view' {
            if ($args[2] -cne (& git remote get-url origin)) { throw 'Repository must match origin.' }
            'test/jsonl-viewer'
        }
        'workflow view' {
            if ($env:RELEASE_TEST_FAILURE -eq 'config') { $global:LASTEXITCODE = 1 }
        }
        'run list' {
            $tag = $args[[Array]::IndexOf($args, '--branch') + 1]
            @(
                @{ databaseId = 99; headSha = 'different-commit'; headBranch = $tag },
                @{ databaseId = 1; headSha = (& git rev-parse HEAD); headBranch = $tag }
            ) | ConvertTo-Json -Compress
        }
        'run watch' {
            if ($args[2] -ne 1) { throw 'Watched an unrelated workflow run.' }
            if ($env:RELEASE_TEST_FAILURE -eq 'workflow') { $global:LASTEXITCODE = 1 }
        }
        'release view' {
            $tag = $args[2]
            $names = @(& node scripts/release-config.mjs assets $tag)
            $assets = @($names | ForEach-Object { @{ name = $_; size = 100 } })
            if ($env:RELEASE_TEST_FAILURE -eq 'asset') { $assets = @($assets | Select-Object -Skip 1) }
            if ($env:RELEASE_TEST_FAILURE -eq 'empty') { $assets[0].size = 0 }
            @{ url = "https://example.com/releases/$tag"; assets = $assets; isDraft = ($env:RELEASE_TEST_FAILURE -eq 'draft'); isPrerelease = $false } | ConvertTo-Json -Compress
        }
        default { throw "Unexpected gh command: $args" }
    }
}

& (Join-Path (Get-Location) 'scripts/release.ps1') @PSBoundParameters
exit $LASTEXITCODE
