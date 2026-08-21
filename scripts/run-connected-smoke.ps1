[CmdletBinding()]
param(
    [ValidateSet("fixture", "connected")]
    [string]$Mode = "connected",
    [string]$EnvironmentPath,
    [string]$BaseUrl,
    [switch]$CheckOnly,
    [switch]$AllowProductionNotionWrite
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) {
    $EnvironmentPath = Join-Path $repositoryRoot ".env"
}

function Set-EnvironmentFromFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "CONNECTED_ENV_FILE_REQUIRED"
    }

    [System.IO.File]::ReadAllLines($Path, [System.Text.UTF8Encoding]::new($false)) | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
        $pair = $line.Split("=", 2)
        if ($pair.Count -ne 2 -or [string]::IsNullOrWhiteSpace($pair[0])) {
            throw "CONNECTED_ENV_LINE_INVALID"
        }
        [System.Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), "Process")
    }
}

function Require-ConfiguredValue {
    param([string]$Name)

    $value = [System.Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value) -or $value.ToLowerInvariant().Contains("replace-with")) {
        throw "CONNECTED_ENV_VALUE_REQUIRED: $Name"
    }
    return $value
}

function Set-GraphDbEnvironmentDefaults {
    foreach ($mapping in @(
            @{ Primary = "MUSIC_KG_GRAPHDB_BASE_URL"; Fallback = "GRAPHDB_BASE_URL" })) {
        $primary = [System.Environment]::GetEnvironmentVariable($mapping.Primary, "Process")
        if (-not [string]::IsNullOrWhiteSpace($primary)) { continue }
        $fallback = [System.Environment]::GetEnvironmentVariable($mapping.Fallback, "Process")
        if (-not [string]::IsNullOrWhiteSpace($fallback)) {
            [System.Environment]::SetEnvironmentVariable($mapping.Primary, $fallback, "Process")
        }
    }
    $repository = [System.Environment]::GetEnvironmentVariable("MUSIC_KG_GRAPHDB_REPOSITORY", "Process")
    if ([string]::IsNullOrWhiteSpace($repository)) {
        [System.Environment]::SetEnvironmentVariable("MUSIC_KG_GRAPHDB_REPOSITORY", "music-kg-personal", "Process")
    }
}

function Invoke-AuthenticatedGet {
    param([string]$Uri, [string]$Secret)

    try {
        return Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Music-Kg-Bff-Secret" = $Secret } -Uri $Uri
    } catch {
        $response = $_.Exception.Response
        $status = if ($null -eq $response) { "NETWORK" } else { [int]$response.StatusCode }
        throw "CONNECTED_SMOKE_REQUEST_FAILED: $status"
    }
}

if ($Mode -eq "fixture") {
    if (-not [string]::IsNullOrWhiteSpace($BaseUrl)) {
        throw "FIXTURE_SMOKE_BASE_URL_UNSUPPORTED"
    }
    Write-Output "FIXTURE_SMOKE_CONFIGURATION_READY"
    return
}

Set-EnvironmentFromFile -Path $EnvironmentPath
Set-GraphDbEnvironmentDefaults
foreach ($name in @(
        "NOTION_API_KEY", "NOTION_DATA_SOURCE_ID", "NOTION_ALBUM_TITLE_FIELD", "NOTION_ARTIST_FIELD",
        "NOTION_COVER_FIELD", "NOTION_SENTIMENT_FIELD", "NOTION_FAVOURITE_TRACK_FIELD", "NOTION_OWNED_FIELD",
        "NOTION_RELEASE_GROUP_MBID_FIELD", "NOTION_RELEASE_MBID_FIELD", "MUSICBRAINZ_USER_AGENT", "MUSIC_KG_GRAPHDB_BASE_URL",
        "MUSIC_KG_GRAPHDB_REPOSITORY")) {
    $null = Require-ConfiguredValue -Name $name
}

if ([System.Environment]::GetEnvironmentVariable("MUSIC_KG_CONNECTED_MODE", "Process") -ne "connected") {
    throw "CONNECTED_MODE_REQUIRED"
}

$notionDataSourceId = Require-ConfiguredValue -Name "NOTION_DATA_SOURCE_ID"
$productionDataSourceId = [System.Environment]::GetEnvironmentVariable("NOTION_PRODUCTION_DATA_SOURCE_ID", "Process")
if (-not [string]::IsNullOrWhiteSpace($productionDataSourceId) -and $notionDataSourceId -eq $productionDataSourceId -and -not $AllowProductionNotionWrite) {
    throw "CONNECTED_PRODUCTION_NOTION_WRITE_BLOCKED"
}

if ($CheckOnly) {
    Write-Output "CONNECTED_SMOKE_CONFIGURATION_READY"
    return
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    throw "CONNECTED_SMOKE_BASE_URL_REQUIRED"
}

$secret = Require-ConfiguredValue -Name "BACKEND_BFF_SHARED_SECRET"
$normalizedBaseUrl = $BaseUrl.TrimEnd("/")
$health = Invoke-AuthenticatedGet -Uri "$normalizedBaseUrl/api/v1/health" -Secret $secret
$readiness = Invoke-AuthenticatedGet -Uri "$normalizedBaseUrl/api/v1/ready" -Secret $secret
$healthPayload = $health.Content | ConvertFrom-Json
$readinessPayload = $readiness.Content | ConvertFrom-Json
if ($healthPayload.status -ne "ok" -or $healthPayload.mode -ne "connected" -or -not $readinessPayload.ready) {
    throw "CONNECTED_SMOKE_NOT_READY"
}

$components = @($readinessPayload.components | ForEach-Object { "$($_.name):$($_.code)" }) -join ","
Write-Output "CONNECTED_SMOKE_READY: mode=$($healthPayload.mode) components=$components"
