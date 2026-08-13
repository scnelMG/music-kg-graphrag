[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [ValidateRange(1024, 65535)]
    [int]$BackendPort = 8080,
    [ValidateRange(1024, 65535)]
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $repositoryRoot ".env"

if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
    throw "CONNECTED_ENV_FILE_REQUIRED: copy .env.example to .env and configure the server-only Notion token."
}

[System.IO.File]::ReadAllLines($environmentPath, [System.Text.UTF8Encoding]::new($false)) | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
    $pair = $line.Split("=", 2)
    if ($pair.Count -ne 2) { throw "CONNECTED_ENV_LINE_INVALID" }
    [System.Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), "Process")
}

foreach ($mapping in @(
        @{ Primary = "MUSIC_KG_GRAPHDB_BASE_URL"; Fallback = "GRAPHDB_BASE_URL" })) {
    $primary = [System.Environment]::GetEnvironmentVariable($mapping.Primary, "Process")
    if (-not [string]::IsNullOrWhiteSpace($primary)) { continue }
    $fallback = [System.Environment]::GetEnvironmentVariable($mapping.Fallback, "Process")
    if (-not [string]::IsNullOrWhiteSpace($fallback)) {
        [System.Environment]::SetEnvironmentVariable($mapping.Primary, $fallback, "Process")
    }
}
if ([string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("MUSIC_KG_GRAPHDB_REPOSITORY", "Process"))) {
    [System.Environment]::SetEnvironmentVariable("MUSIC_KG_GRAPHDB_REPOSITORY", "music-kg-personal", "Process")
}

$requiredNames = @(
    "NOTION_API_KEY",
    "NOTION_DATA_SOURCE_ID",
    "NOTION_ALBUM_TITLE_FIELD",
    "NOTION_ARTIST_FIELD",
    "NOTION_COVER_FIELD",
    "NOTION_SENTIMENT_FIELD",
    "NOTION_FAVOURITE_TRACK_FIELD",
    "NOTION_OWNED_FIELD",
    "NOTION_RELEASE_GROUP_MBID_FIELD",
    "MUSICBRAINZ_USER_AGENT",
    "MUSIC_KG_GRAPHDB_BASE_URL",
    "MUSIC_KG_GRAPHDB_REPOSITORY"
)

foreach ($name in $requiredNames) {
    $value = [System.Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace($value) -or $value.ToLowerInvariant().Contains("replace-with")) {
        throw "CONNECTED_ENV_VALUE_REQUIRED: $name"
    }
}

if ([System.Environment]::GetEnvironmentVariable("MUSIC_KG_CONNECTED_MODE", "Process") -ne "connected") {
    throw "CONNECTED_MODE_REQUIRED"
}

if ($CheckOnly) {
    Write-Output "CONNECTED_CONFIGURATION_READY"
    return
}

$secret = [System.Environment]::GetEnvironmentVariable("BACKEND_BFF_SHARED_SECRET", "Process")
if ([string]::IsNullOrWhiteSpace($secret) -or $secret.ToLowerInvariant().Contains("replace-with")) {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    [System.Environment]::SetEnvironmentVariable("BACKEND_BFF_SHARED_SECRET", [Convert]::ToBase64String($bytes), "Process")
}

[System.Environment]::SetEnvironmentVariable("PORT", $BackendPort.ToString(), "Process")
[System.Environment]::SetEnvironmentVariable("SPRING_PROFILES_ACTIVE", "connected", "Process")
& (Join-Path $repositoryRoot "backend\gradlew.bat") -p (Join-Path $repositoryRoot "backend") bootJar --no-daemon
if ($LASTEXITCODE -ne 0) { throw "CONNECTED_BACKEND_BUILD_FAILED" }
$backendJar = Join-Path $repositoryRoot "backend\build\libs\music-kg-backend-0.1.0.jar"
if (-not (Test-Path -LiteralPath $backendJar -PathType Leaf)) { throw "CONNECTED_BACKEND_JAR_REQUIRED" }
$backend = Start-Process -FilePath "java.exe" -ArgumentList @("-jar", $backendJar) -PassThru -WindowStyle Hidden

$deadline = [DateTime]::UtcNow.AddSeconds(90)
$backendUrl = "http://127.0.0.1:$BackendPort"
while ([DateTime]::UtcNow -lt $deadline) {
    if ($backend.HasExited) { throw "CONNECTED_BACKEND_EXITED_BEFORE_READY" }
    try {
        $health = Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Music-Kg-Bff-Secret" = [System.Environment]::GetEnvironmentVariable("BACKEND_BFF_SHARED_SECRET", "Process") } -Uri "$backendUrl/api/v1/health"
        if ($health.StatusCode -eq 200) { break }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if ($health.StatusCode -ne 200) { throw "CONNECTED_BACKEND_NOT_READY" }

[System.Environment]::SetEnvironmentVariable("BACKEND_BASE_URL", $backendUrl, "Process")
$frontendRoot = Join-Path $repositoryRoot "frontend"
$nextCli = Join-Path $frontendRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $nextCli -PathType Leaf)) { throw "CONNECTED_FRONTEND_DEPENDENCIES_REQUIRED" }
$frontend = Start-Process -FilePath "node.exe" -ArgumentList @(
    $nextCli, "dev", "-H", "127.0.0.1", "-p", $FrontendPort.ToString()
) -WorkingDirectory $frontendRoot -PassThru -WindowStyle Hidden

Write-Output "CONNECTED_BACKEND_READY: $backendUrl (PID $($backend.Id))"
Write-Output "CONNECTED_FRONTEND_STARTING: http://127.0.0.1:$FrontendPort (PID $($frontend.Id))"
Write-Output "Stop both local processes with: Stop-Process -Id $($backend.Id), $($frontend.Id)"
