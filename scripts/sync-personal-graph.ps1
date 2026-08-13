[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Incremental", "Reconcile")]
    [string]$Mode,
    [Parameter(Mandatory = $true)]
    [string]$BackendBaseUrl
)

$ErrorActionPreference = "Stop"
$sharedSecret = $env:BACKEND_BFF_SHARED_SECRET
if ([string]::IsNullOrWhiteSpace($BackendBaseUrl) -or [string]::IsNullOrWhiteSpace($sharedSecret)) {
    Write-Error "PERSONAL_GRAPH_SYNC_CONFIGURATION_REQUIRED"
    exit 2
}

$path = if ($Mode -eq "Reconcile") { "/api/v1/personal-sync/reconcile" } else { "/api/v1/personal-sync" }
try {
    $response = Invoke-RestMethod -Method Post -Uri ($BackendBaseUrl.TrimEnd("/") + $path) `
        -Headers @{ "X-Music-Kg-Bff-Secret" = $sharedSecret } -ContentType "application/json"
} catch {
    Write-Error "PERSONAL_GRAPH_SYNC_REQUEST_FAILED"
    exit 1
}

if ($null -eq $response.status -or $null -eq $response.changedRecordCount -or $null -eq $response.stale) {
    Write-Error "PERSONAL_GRAPH_SYNC_RESPONSE_INVALID"
    exit 1
}

[ordered]@{
    status = [string]$response.status
    lastSuccessfulAt = $response.lastSuccessfulAt
    changedRecordCount = [int]$response.changedRecordCount
    stale = [bool]$response.stale
} | ConvertTo-Json -Compress
