[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$Deploy,
    [Parameter(Mandatory = $true)]
    [string]$Project,
    [string]$Zone = "asia-northeast3-a",
    [string]$Network = "default",
    [string]$Subnetwork = "default"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$startupScript = Join-Path $repositoryRoot "deployment\graphdb\personal-graphdb-startup.sh"
$repositoryConfig = Join-Path $repositoryRoot "deployment\graphdb\personal-repository-config.ttl"
$instanceName = "music-kg-personal-graphdb"
$gcloud = if ($env:OS -eq "Windows_NT") { "gcloud.cmd" } else { "gcloud" }

function Invoke-Gcloud {
    param([string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $gcloud @Arguments
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) { throw "PERSONAL_GRAPHDB_GCLOUD_COMMAND_FAILED" }
}

function Invoke-GcloudCapture {
    param([string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & $gcloud @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    return [PSCustomObject]@{ ExitCode = $exitCode; Output = ($output -join "`n").Trim() }
}

foreach ($path in @($startupScript, $repositoryConfig)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "PERSONAL_GRAPHDB_DEPLOYMENT_ASSET_REQUIRED" }
}
if ($CheckOnly) {
    Write-Output "PERSONAL_GRAPHDB_VM_DEPLOYMENT_READY"
    return
}
if (-not $Deploy) {
    throw "PERSONAL_GRAPHDB_DEPLOY_APPROVAL_REQUIRED: rerun with -Deploy after reviewing e2-medium plus 30GB pd-balanced recurring cost."
}

$lookup = Invoke-GcloudCapture -Arguments @("compute", "instances", "describe", $instanceName,
    "--project", $Project, "--zone", $Zone, "--format=value(name)")
if ($lookup.ExitCode -eq 0 -and $lookup.Output -match "(?m)^$instanceName$") {
    Write-Output "PERSONAL_GRAPHDB_VM_EXISTS: $instanceName"
    return
}
if ($lookup.ExitCode -ne 0 -and $lookup.Output -notmatch "(was not found|Could not fetch resource)") {
    throw "PERSONAL_GRAPHDB_VM_LOOKUP_FAILED"
}

Invoke-Gcloud -Arguments @("compute", "instances", "create", $instanceName,
    "--project", $Project,
    "--zone", $Zone,
    "--machine-type", "e2-medium",
    "--network-interface", "network=$Network,subnet=$Subnetwork",
    "--tags", "music-kg-graphdb",
    "--boot-disk-size", "30GB",
    "--boot-disk-type", "pd-balanced",
    "--image-family", "debian-12",
    "--image-project", "debian-cloud",
    "--metadata-from-file", "startup-script=$startupScript,personal-repository-config=$repositoryConfig")


$addressLookup = Invoke-GcloudCapture -Arguments @("compute", "instances", "describe", $instanceName,
    "--project", $Project, "--zone", $Zone, "--format=value(networkInterfaces[0].networkIP)")
$internalAddress = @($addressLookup.Output -split "`r?`n" | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }) | Select-Object -Last 1
if ($addressLookup.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($internalAddress)) {
    throw "PERSONAL_GRAPHDB_INTERNAL_ADDRESS_REQUIRED"
}
Write-Output "PERSONAL_GRAPHDB_VM_READY: http://${internalAddress}:7200"
