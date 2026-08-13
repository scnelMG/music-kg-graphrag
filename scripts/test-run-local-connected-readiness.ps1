$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "run-local-connected-readiness.ps1"

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "LOCAL_CONNECTED_READINESS_SCRIPT_MISSING"
}

$source = [System.IO.File]::ReadAllText($scriptPath, [System.Text.UTF8Encoding]::new($false))
foreach ($required in @(
        'LOCAL_CONNECTED_READINESS_READY',
        '/api/v1/health',
        '/api/v1/ready',
        '/api/v1/catalog/albums',
        '/tracks',
        'Get-ReadinessFailure',
        'LOCAL_CONNECTED_NOT_READY:',
        'MUSIC_KG_GRAPHDB_BASE_URL',
        'GRAPHDB_BASE_URL',
        'music-kg-personal',
        'BACKEND_BFF_SHARED_SECRET',
        'Stop-Process')) {
    if ($source -notmatch [regex]::Escape($required)) {
        throw "LOCAL_CONNECTED_READINESS_CONTRACT_MISSING: $required"
    }
}
foreach ($forbidden in @('/api/v1/listening-records', 'Invoke-RestMethod.*POST', 'Invoke-WebRequest.*POST')) {
    if ($source -match $forbidden) {
        throw "LOCAL_CONNECTED_READINESS_MUST_BE_READ_ONLY: $forbidden"
    }
}

Write-Output "LOCAL_CONNECTED_READINESS_SCRIPT_PASS"
