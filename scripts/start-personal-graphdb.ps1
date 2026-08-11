[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [string]$ContainerName = "music-kg-personal-graphdb",
    [string]$VolumeName = "music-kg-personal-graphdb-data"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$repositoryConfig = Join-Path $repositoryRoot "deployment\graphdb\personal-repository-config.ttl"
$graphDbImage = "ontotext/graphdb@sha256:e66ad4c6cbec16bb209735d4f777c97bab8c508cdd7709d916abe854612052d3"
$graphDbUrl = "http://127.0.0.1:7200"

if (-not (Test-Path -LiteralPath $repositoryConfig -PathType Leaf)) {
    throw "PERSONAL_GRAPHDB_REPOSITORY_CONFIG_REQUIRED"
}
if ($graphDbImage -notmatch "@sha256:[0-9a-f]{64}$") {
    throw "PERSONAL_GRAPHDB_IMMUTABLE_IMAGE_REQUIRED"
}
if ($CheckOnly) {
    Write-Output "PERSONAL_GRAPHDB_CONFIGURATION_READY"
    return
}

function Invoke-Docker {
    param([string[]]$Arguments)

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "PERSONAL_GRAPHDB_DOCKER_COMMAND_FAILED"
    }
}

$existing = (& docker ps --all --filter "name=^/$ContainerName$" --format "{{.Names}}" 2>$null).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "PERSONAL_GRAPHDB_DOCKER_UNAVAILABLE"
}
if ($existing -eq $ContainerName) {
    Invoke-Docker -Arguments @("start", $ContainerName)
} elseif ([string]::IsNullOrWhiteSpace($existing)) {
    Invoke-Docker -Arguments @("volume", "create", $VolumeName)
    Invoke-Docker -Arguments @(
        "run", "--detach", "--name", $ContainerName,
        "--restart", "unless-stopped",
        "--publish", "127.0.0.1:7200:7200",
        "--env", "GDB_HEAP_SIZE=2g",
        "--volume", "${VolumeName}:/opt/graphdb/home",
        $graphDbImage
    )
} else {
    throw "PERSONAL_GRAPHDB_CONTAINER_NAME_CONFLICT"
}

$deadline = [DateTime]::UtcNow.AddMinutes(3)
while ([DateTime]::UtcNow -lt $deadline) {
    try {
        $repositories = Invoke-WebRequest -UseBasicParsing -Uri "$graphDbUrl/rest/repositories" -TimeoutSec 5
        if ($repositories.StatusCode -eq 200) { break }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if ($null -eq $repositories -or $repositories.StatusCode -ne 200) {
    throw "PERSONAL_GRAPHDB_READINESS_TIMEOUT"
}

if ($repositories.Content -notmatch '"id"\s*:\s*"music-kg-personal"') {
    & curl.exe --fail-with-body --silent --show-error --request POST `
        --form "config=@$repositoryConfig" "$graphDbUrl/rest/repositories"
    if ($LASTEXITCODE -ne 0) {
        throw "PERSONAL_GRAPHDB_REPOSITORY_CREATE_FAILED"
    }
}

Write-Output "PERSONAL_GRAPHDB_READY: $graphDbUrl/repositories/music-kg-personal/"
