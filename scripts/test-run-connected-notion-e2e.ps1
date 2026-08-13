$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "run-connected-notion-e2e.ps1"
$powerShellExecutable = if ($PSVersionTable.PSEdition -eq "Desktop") { "powershell.exe" } else { "pwsh" }
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw "NOTION_E2E_SCRIPT_MISSING" }

$source = [System.IO.File]::ReadAllText($scriptPath, [System.Text.UTF8Encoding]::new($false))
foreach ($required in @(
        'NOTION_E2E_PRODUCTION_DATA_SOURCE_BLOCKED',
        'NOTION_E2E_PLAN_READY',
        'NOTION_E2E_UNRECORDED_ALBUM_REQUIRED',
        'NOTION_E2E_REAL_TRACK_REQUIRED',
        'NOTION_E2E_FINAL_ARCHIVE_FAILED',
        'api/v1/listening-records/\$createdPageId/restore')) {
    if ($source -notmatch $required) { throw "NOTION_E2E_CONTRACT_MISSING: $required" }
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("music-kg-notion-e2e-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
    $environmentPath = Join-Path $temporaryRoot ".env.e2e"
    @('NOTION_API_KEY=test-token', 'NOTION_DATA_SOURCE_ID=dedicated-test-source', 'NOTION_PRODUCTION_DATA_SOURCE_ID=production-source', 'BACKEND_BFF_SHARED_SECRET=test-bff-secret') |
        Set-Content -LiteralPath $environmentPath -Encoding utf8
    $plan = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -BaseUrl 'https://example.test' -EnvironmentPath $environmentPath -AlbumQuery '가수 또는 앨범'
    if ($LASTEXITCODE -ne 0 -or $plan -notcontains 'NOTION_E2E_PLAN_READY: no external request or Notion write was performed') {
        throw "NOTION_E2E_PLAN_ONLY_FAILED"
    }
    Add-Content -LiteralPath $environmentPath -Value 'NOTION_DATA_SOURCE_ID=production-source'
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $blocked = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -BaseUrl 'https://example.test' -EnvironmentPath $environmentPath -AlbumQuery '가수 또는 앨범' 2>&1
        $blockedExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorPreference
    }
    if ($blockedExitCode -eq 0 -or ($blocked | Out-String) -notmatch 'NOTION_E2E_PRODUCTION_DATA_SOURCE_BLOCKED') {
        throw "NOTION_E2E_PRODUCTION_GUARD_MISSING"
    }
} finally {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}

Write-Output "NOTION_E2E_SCRIPT_PASS"
