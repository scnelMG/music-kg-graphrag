[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'restore-fixture-volumes.ps1'

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw 'RESTORE_FIXTURE_VOLUMES_CONTRACT_MISSING: restore-fixture-volumes.ps1 does not exist'
}

$source = Get-Content -LiteralPath $scriptPath -Raw
$requiredPatterns = [ordered]@{
    unique_run_prefix = '\[guid\]::NewGuid\(\)'
    exact_container_inventory = '\$containerNames\s*='
    exact_volume_inventory = '\$volumeNames\s*='
    predeclared_container_cleanup_inventory = '\$containerNames\s*=\s*@\(\s*\$sourcePostgresContainer'
    predeclared_volume_cleanup_inventory = '\$volumeNames\s*=\s*@\(\s*\$sourcePostgresVolume'
    fresh_postgres_source_volume = 'postgres-source'
    fresh_postgres_restore_volume = 'postgres-restored'
    fresh_graphdb_volume = 'graphdb-restored'
    pg_dump = '\bpg_dump\b'
    pg_restore = '\bpg_restore\b'
    canonical_outbox_projection = 'pipeline\.project_outbox'
    source_database_hash = 'source_database_sha256'
    restored_database_hash = 'restored_database_sha256'
    graph_hash = 'graph_sha256'
    graph_count = 'graph_triple_count'
    required_artifact_kind = "artifact_kind\s*=\s*'postgres_fresh_volume_restore'"
    required_restore_success = 'restore_exit_code\s*=\s*0'
    required_graph_verified = 'graph_verified\s*=\s*\$true'
    finally_cleanup = 'finally\s*\{'
    exact_container_cleanup = 'docker\s+rm\s+--force\s+--\s+\$containerName'
    exact_volume_cleanup = 'docker\s+volume\s+rm\s+--\s+\$volumeName'
    exact_network_cleanup = 'docker\s+network\s+rm\s+--\s+\$networkName'
    prefix_guard = 'StartsWith\(\$runPrefix'
    docker_stderr_does_not_abort = '\$ErrorActionPreference\s*=\s*''Continue'''
    docker_error_preference_restored = '\$ErrorActionPreference\s*=\s*\$previousErrorActionPreference'
    redacted_failure_operation = "\^\[A-Za-z0-9_:.-\]\+\$"
    native_safe_json_seed = 'jsonb_build_object\(''fixture'', true\)'
}

$missing = @(
    foreach ($entry in $requiredPatterns.GetEnumerator()) {
        if ($source -notmatch $entry.Value) {
            $entry.Key
        }
    }
)

if ($missing.Count -gt 0) {
    throw "RESTORE_FIXTURE_VOLUMES_CONTRACT_MISSING: $($missing -join ', ')"
}

$topologyPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'docs/deployment-topology.md'
$topology = Get-Content -LiteralPath $topologyPath -Raw
if ($topology -notmatch 'scripts/restore-fixture-volumes\.ps1') {
    throw 'RESTORE_FIXTURE_VOLUMES_CONTRACT_MISSING: topology_runbook_entry'
}

Write-Output 'RESTORE_FIXTURE_VOLUMES_STATIC_CONTRACT_VALID'
