[CmdletBinding()]
param(
    [string]$EnvironmentPath,
    [ValidateRange(1024, 65535)]
    [int]$BackendPort = 18080,
    [string]$CatalogQuery = "IU"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) {
    $EnvironmentPath = Join-Path $repositoryRoot ".env"
}

function Import-EnvironmentFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "LOCAL_CONNECTED_ENV_FILE_REQUIRED" }
    [System.IO.File]::ReadAllLines($Path, [System.Text.UTF8Encoding]::new($false)) | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
        $pair = $line.Split("=", 2)
        if ($pair.Count -ne 2 -or [string]::IsNullOrWhiteSpace($pair[0])) { throw "LOCAL_CONNECTED_ENV_LINE_INVALID" }
        [System.Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), "Process")
    }
}

function Require-ConfiguredValue {
    param([string]$Name)

    $value = [System.Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value) -or $value.ToLowerInvariant().Contains("replace-with")) {
        throw "LOCAL_CONNECTED_ENV_VALUE_REQUIRED: $Name"
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

function New-ProcessOnlySecret {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Get-ReadinessFailure {
    param($ErrorRecord)

    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) { return "status=NETWORK" }
    $status = [int]$response.StatusCode
    $stream = $response.GetResponseStream()
    if ($null -eq $stream) { return "status=$status" }
    $reader = New-Object System.IO.StreamReader($stream)
    try {
        $payload = $reader.ReadToEnd() | ConvertFrom-Json
        $components = @($payload.components | ForEach-Object { "$($_.name):$($_.code)" }) -join ","
        return "status=$status components=$components"
    } catch {
        return "status=$status"
    } finally {
        $reader.Dispose()
    }
}

Import-EnvironmentFile -Path $EnvironmentPath
Set-GraphDbEnvironmentDefaults
foreach ($name in @(
        "NOTION_API_KEY", "NOTION_DATA_SOURCE_ID", "NOTION_ALBUM_TITLE_FIELD", "NOTION_ARTIST_FIELD",
        "NOTION_COVER_FIELD", "NOTION_SENTIMENT_FIELD", "NOTION_FAVOURITE_TRACK_FIELD", "NOTION_OWNED_FIELD",
        "NOTION_RELEASE_GROUP_MBID_FIELD", "MUSICBRAINZ_USER_AGENT", "MUSIC_KG_GRAPHDB_BASE_URL",
        "MUSIC_KG_GRAPHDB_REPOSITORY")) {
    $null = Require-ConfiguredValue -Name $name
}
if ([System.Environment]::GetEnvironmentVariable("MUSIC_KG_CONNECTED_MODE", "Process") -ne "connected") {
    throw "LOCAL_CONNECTED_MODE_REQUIRED"
}

$secret = [System.Environment]::GetEnvironmentVariable("BACKEND_BFF_SHARED_SECRET", "Process")
if ([string]::IsNullOrWhiteSpace($secret) -or $secret.ToLowerInvariant().Contains("replace-with")) {
    $secret = New-ProcessOnlySecret
    [System.Environment]::SetEnvironmentVariable("BACKEND_BFF_SHARED_SECRET", $secret, "Process")
}
[System.Environment]::SetEnvironmentVariable("PORT", $BackendPort.ToString(), "Process")
[System.Environment]::SetEnvironmentVariable("SPRING_PROFILES_ACTIVE", "connected", "Process")

$jar = Join-Path $repositoryRoot "backend\build\libs\music-kg-backend-0.1.0.jar"
if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) {
    throw "LOCAL_CONNECTED_BACKEND_JAR_REQUIRED: run backend\\gradlew.bat -p backend bootJar first"
}

$backend = Start-Process -FilePath "java.exe" -ArgumentList @("-jar", $jar) -PassThru -WindowStyle Hidden
$baseUrl = "http://127.0.0.1:$BackendPort"
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    $health = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($backend.HasExited) { throw "LOCAL_CONNECTED_BACKEND_EXITED_BEFORE_HEALTH" }
        try {
            $health = Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Music-Kg-Bff-Secret" = $secret } -Uri "$baseUrl/api/v1/health" -TimeoutSec 3
            if ($health.StatusCode -eq 200) { break }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if ($null -eq $health -or $health.StatusCode -ne 200) { throw "LOCAL_CONNECTED_HEALTH_TIMEOUT" }

    try {
        $readiness = Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Music-Kg-Bff-Secret" = $secret } -Uri "$baseUrl/api/v1/ready" -TimeoutSec 15
    } catch {
        throw "LOCAL_CONNECTED_NOT_READY: $(Get-ReadinessFailure -ErrorRecord $_)"
    }
    $healthPayload = $health.Content | ConvertFrom-Json
    $readinessPayload = $readiness.Content | ConvertFrom-Json
    if ($healthPayload.status -ne "ok" -or $healthPayload.mode -ne "connected" -or -not $readinessPayload.ready) {
        throw "LOCAL_CONNECTED_NOT_READY"
    }
    $encodedQuery = [uri]::EscapeDataString($CatalogQuery.Trim())
    if ([string]::IsNullOrWhiteSpace($encodedQuery)) { throw "LOCAL_CONNECTED_CATALOG_QUERY_REQUIRED" }
    $catalog = Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Music-Kg-Bff-Secret" = $secret } -Uri "$baseUrl/api/v1/catalog/albums?q=$encodedQuery" -TimeoutSec 15
    $albums = @($catalog.Content | ConvertFrom-Json)
    if ($albums.Count -eq 0 -or [string]::IsNullOrWhiteSpace($albums[0].releaseGroupMbid)) {
        throw "LOCAL_CONNECTED_CATALOG_EMPTY"
    }
    $tracks = Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Music-Kg-Bff-Secret" = $secret } -Uri "$baseUrl/api/v1/catalog/albums/$($albums[0].releaseGroupMbid)/tracks" -TimeoutSec 15
    $trackValues = @($tracks.Content | ConvertFrom-Json)
    if ($trackValues.Count -eq 0) { throw "LOCAL_CONNECTED_TRACKS_EMPTY" }
    $components = @($readinessPayload.components | ForEach-Object { "$($_.name):$($_.code)" }) -join ","
    Write-Output "LOCAL_CONNECTED_READINESS_READY: mode=$($healthPayload.mode) components=$components catalog=$($albums.Count) tracks=$($trackValues.Count)"
} finally {
    if ($null -ne $backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
