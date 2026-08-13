$scriptPath = Join-Path $PSScriptRoot "sync-personal-graph.ps1"
$source = Get-Content -Raw $scriptPath
if ($source -notmatch 'ValidateSet\("Incremental", "Reconcile"\)') { throw "SYNC_MODE_CONTRACT_MISSING" }
if ($source -notmatch 'PERSONAL_GRAPH_SYNC_CONFIGURATION_REQUIRED') { throw "SYNC_CONFIGURATION_GUARD_MISSING" }
if ($source -match 'Write-(Host|Output).*sharedSecret') { throw "SYNC_SECRET_OUTPUT_DETECTED" }
if ($source -notmatch 'personal-sync/reconcile') { throw "SYNC_RECONCILE_ENDPOINT_MISSING" }
Write-Output "SYNC_PERSONAL_GRAPH_STATIC_CONTRACT_PASS"
