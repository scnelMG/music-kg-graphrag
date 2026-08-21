$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "run-connected-smoke.ps1"
$powerShellExecutable = if ($PSVersionTable.PSEdition -eq "Desktop") { "powershell.exe" } else { "pwsh" }
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "CONNECTED_SMOKE_SCRIPT_MISSING"
}

$source = [System.IO.File]::ReadAllText($scriptPath, [System.Text.UTF8Encoding]::new($false))
foreach ($required in @(
        'ValidateSet\("fixture", "connected"\)',
        'CONNECTED_PRODUCTION_NOTION_WRITE_BLOCKED',
        'CONNECTED_SMOKE_CONFIGURATION_READY',
        'NOTION_RELEASE_MBID_FIELD',
        'X-Music-Kg-Bff-Secret',
        '/api/v1/ready')) {
    if ($source -notmatch $required) { throw "CONNECTED_SMOKE_CONTRACT_MISSING: $required" }
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("music-kg-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
    $environmentPath = Join-Path $temporaryRoot ".env"
    @(
        'NOTION_API_KEY=integration-token',
        'NOTION_DATA_SOURCE_ID=test-data-source',
        'NOTION_ALBUM_TITLE_FIELD=Album',
        'NOTION_ARTIST_FIELD=Artist',
        'NOTION_COVER_FIELD=Cover',
        'NOTION_SENTIMENT_FIELD=Sentiment',
        'NOTION_FAVOURITE_TRACK_FIELD=Favourite track',
        'NOTION_OWNED_FIELD=Owned',
        'NOTION_RELEASE_GROUP_MBID_FIELD=MusicBrainz MBID',
        'NOTION_RELEASE_MBID_FIELD=MusicBrainz Release MBID',
        'MUSICBRAINZ_USER_AGENT=music-kg-test/1.0 (test@example.invalid)',
        'MUSIC_KG_GRAPHDB_BASE_URL=http://127.0.0.1:7200',
        'MUSIC_KG_GRAPHDB_REPOSITORY=music-kg-personal',
        'MUSIC_KG_CONNECTED_MODE=connected',
        'NOTION_PRODUCTION_DATA_SOURCE_ID=production-data-source'
    ) | Set-Content -LiteralPath $environmentPath -Encoding utf8

    $connected = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Mode connected -CheckOnly -EnvironmentPath $environmentPath
    if ($LASTEXITCODE -ne 0 -or $connected -notcontains "CONNECTED_SMOKE_CONFIGURATION_READY") {
        throw "CONNECTED_SMOKE_CHECK_ONLY_FAILED"
    }
    $missingReleaseMbidFieldEnvironmentPath = Join-Path $temporaryRoot ".env-missing-release-mbid-field"
    Get-Content -LiteralPath $environmentPath | Where-Object { $_ -notmatch '^NOTION_RELEASE_MBID_FIELD=' } |
        Set-Content -LiteralPath $missingReleaseMbidFieldEnvironmentPath -Encoding utf8
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $missingReleaseMbidField = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Mode connected -CheckOnly -EnvironmentPath $missingReleaseMbidFieldEnvironmentPath 2>&1
        $missingReleaseMbidFieldExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($missingReleaseMbidFieldExitCode -eq 0 -or ($missingReleaseMbidField | Out-String) -notmatch 'CONNECTED_ENV_VALUE_REQUIRED: NOTION_RELEASE_MBID_FIELD') {
        throw "CONNECTED_SMOKE_RELEASE_MBID_FIELD_GUARD_MISSING"
    }
    $fallbackEnvironmentPath = Join-Path $temporaryRoot ".env-generic-graphdb"
    Get-Content -LiteralPath $environmentPath | Where-Object { $_ -notmatch '^MUSIC_KG_GRAPHDB_' } |
        Add-Content -LiteralPath $fallbackEnvironmentPath -Encoding utf8
    Add-Content -LiteralPath $fallbackEnvironmentPath -Value @(
        'GRAPHDB_BASE_URL=http://127.0.0.1:7200',
        'GRAPHDB_REPOSITORY=canonical-music-kg'
    )
    $genericGraphDb = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Mode connected -CheckOnly -EnvironmentPath $fallbackEnvironmentPath
    if ($LASTEXITCODE -ne 0 -or $genericGraphDb -notcontains "CONNECTED_SMOKE_CONFIGURATION_READY") {
        throw "CONNECTED_SMOKE_GENERIC_GRAPHDB_FALLBACK_FAILED"
    }
    $fixture = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Mode fixture -CheckOnly
    if ($LASTEXITCODE -ne 0 -or $fixture -notcontains "FIXTURE_SMOKE_CONFIGURATION_READY") {
        throw "FIXTURE_SMOKE_CHECK_ONLY_FAILED"
    }

    Add-Content -LiteralPath $environmentPath -Value 'NOTION_DATA_SOURCE_ID=production-data-source'
    $blocked = $false
    try {
        $blockedOutput = & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Mode connected -CheckOnly -EnvironmentPath $environmentPath 2>&1
        $blocked = $LASTEXITCODE -ne 0 -and ($blockedOutput | Out-String) -match 'CONNECTED_PRODUCTION_NOTION_WRITE_BLOCKED'
    } catch { $blocked = $_.Exception.Message -match 'CONNECTED_PRODUCTION_NOTION_WRITE_BLOCKED' }
    if (-not $blocked) { throw "CONNECTED_SMOKE_PRODUCTION_GUARD_MISSING" }
} finally {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}

Write-Output "CONNECTED_SMOKE_SCRIPT_PASS"
exit 0
