[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $repositoryRoot '.omo/evidence/fresh-volume-restore/manual-report.json'
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path $OutputPath -Parent
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$runPrefix = "music-kg-restore-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$resourceLabel = "org.music-kg.restore-run=$runPrefix"
$postgresImage = 'pgvector/pgvector@sha256:a36250871de0833b8757561c72f2477ef1ddd1101afa4e617fb552e0de514c6b'
$graphdbImage = 'ontotext/graphdb@sha256:e66ad4c6cbec16bb209735d4f777c97bab8c508cdd7709d916abe854612052d3'
$projectorImage = "$runPrefix-projector"
$databaseName = 'music_kg'
$databaseUser = 'music_kg'
$databasePassword = [guid]::NewGuid().ToString('N')
$networkName = "$runPrefix-network"
$sourcePostgresVolume = "$runPrefix-postgres-source"
$restoredPostgresVolume = "$runPrefix-postgres-restored"
$dumpVolume = "$runPrefix-postgres-dump"
$graphdbVolume = "$runPrefix-graphdb-restored"
$sourcePostgresContainer = "$runPrefix-postgres-source"
$restoredPostgresContainer = "$runPrefix-postgres-restored"
$graphdbContainer = "$runPrefix-graphdb-restored"
$bootstrapContainer = "$runPrefix-graphdb-bootstrap"
$projectorContainer = "$runPrefix-outbox-projector"
$containerNames = @(
    $sourcePostgresContainer,
    $restoredPostgresContainer,
    $graphdbContainer,
    $bootstrapContainer,
    $projectorContainer
)
$volumeNames = @(
    $sourcePostgresVolume,
    $restoredPostgresVolume,
    $dumpVolume,
    $graphdbVolume
)
$projectionReportPath = Join-Path ([System.IO.Path]::GetTempPath()) "$runPrefix-outbox.json"
$restoreExitCode = 1
$graphVerified = $false
$report = $null
$failureCode = $null

function Invoke-Docker {
    param(
        [Parameter(Mandatory)] [string[]]$Arguments,
        [Parameter(Mandatory)] [string]$Operation
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Docker BuildKit writes normal progress to stderr. Capture it without
        # allowing PowerShell 5 native-stderr promotion to abort the command.
        $ErrorActionPreference = 'Continue'
        $output = & docker @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "DOCKER_COMMAND_FAILED:$Operation`:exit_$exitCode"
    }
    return (@($output) -join "`n").Trim()
}

function Wait-Postgres {
    param([Parameter(Mandatory)] [string]$ContainerName)

    for ($attempt = 1; $attempt -le 60; $attempt++) {
        & docker exec -- $ContainerName pg_isready -U $databaseUser -d $databaseName *> $null
        if ($LASTEXITCODE -eq 0) {
            return
        }
        Start-Sleep -Seconds 1
    }
    throw 'POSTGRES_READINESS_TIMEOUT'
}

function Wait-GraphDb {
    for ($attempt = 1; $attempt -le 180; $attempt++) {
        & docker exec -- $graphdbContainer wget -q --spider http://localhost:7200/rest/repositories *> $null
        if ($LASTEXITCODE -eq 0) {
            return
        }
        Start-Sleep -Seconds 1
    }
    throw 'GRAPHDB_READINESS_TIMEOUT'
}

function Get-DatabaseSnapshot {
    param([Parameter(Mandatory)] [string]$ContainerName)

    $canonicalQuery = @'
SELECT row_value
FROM (
    SELECT 'artist|' || id::text || '|' || name AS row_value FROM artists
    UNION ALL
    SELECT 'release_group|' || id::text || '|' || title || '|' || COALESCE(primary_type, '') FROM release_groups
    UNION ALL
    SELECT 'release|' || id::text || '|' || release_group_id::text || '|' || title || '|' || COALESCE(release_date::text, '') || '|' || COALESCE(country_code, '') FROM releases
    UNION ALL
    SELECT 'credit|' || id::text || '|' || artist_id::text || '|' || release_group_id::text || '|' || credit_role || '|' || position::text FROM credits
    UNION ALL
    SELECT 'external_identifier|' || id::text || '|' || provider || '|' || entity_kind || '|' || external_id || '|' || release_id::text FROM external_identifiers
    UNION ALL
    SELECT 'outbox|' || id::text || '|' || aggregate_type || '|' || aggregate_id::text || '|' || event_type || '|' || payload_json::text || '|' || state || '|' || attempts::text FROM outbox_events
) canonical_rows
ORDER BY row_value;
'@
    $countQuery = @'
SELECT json_build_object(
    'artists', (SELECT count(*) FROM artists),
    'release_groups', (SELECT count(*) FROM release_groups),
    'releases', (SELECT count(*) FROM releases),
    'credits', (SELECT count(*) FROM credits),
    'external_identifiers', (SELECT count(*) FROM external_identifiers),
    'outbox_events', (SELECT count(*) FROM outbox_events)
)::text;
'@
    $rows = Invoke-Docker -Operation 'database_hash_readback' -Arguments @(
        'exec', '--', $ContainerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $databaseUser,
        '-d', $databaseName, '-At', '-c', $canonicalQuery
    )
    $countsJson = Invoke-Docker -Operation 'database_count_readback' -Arguments @(
        'exec', '--', $ContainerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $databaseUser,
        '-d', $databaseName, '-At', '-c', $countQuery
    )
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($rows + "`n")
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
    return [pscustomobject]@{
        sha256 = $hash
        counts = ($countsJson | ConvertFrom-Json)
    }
}

try {
    Invoke-Docker -Operation 'docker_daemon_check' -Arguments @('version', '--format', '{{.Server.Version}}') | Out-Null

    Invoke-Docker -Operation 'network_create' -Arguments @('network', 'create', '--label', $resourceLabel, $networkName) | Out-Null
    foreach ($volumeName in @($sourcePostgresVolume, $restoredPostgresVolume, $dumpVolume, $graphdbVolume)) {
        Invoke-Docker -Operation 'volume_create' -Arguments @('volume', 'create', '--label', $resourceLabel, $volumeName) | Out-Null
    }

    Invoke-Docker -Operation 'projector_image_build' -Arguments @(
        'build', '--label', $resourceLabel, '--file', 'deployment/graphdb/projector.Dockerfile',
        '--tag', $projectorImage, $repositoryRoot
    ) | Out-Null

    Invoke-Docker -Operation 'source_postgres_start' -Arguments @(
        'run', '--detach', '--name', $sourcePostgresContainer, '--label', $resourceLabel,
        '--network', $networkName, '--env', "POSTGRES_DB=$databaseName", '--env', "POSTGRES_USER=$databaseUser",
        '--env', "POSTGRES_PASSWORD=$databasePassword", '--volume', "${sourcePostgresVolume}:/var/lib/postgresql/data",
        '--volume', "${dumpVolume}:/backup", $postgresImage
    ) | Out-Null
    Wait-Postgres -ContainerName $sourcePostgresContainer

    Invoke-Docker -Operation 'migration_copy' -Arguments @(
        'cp', (Join-Path $repositoryRoot 'backend/src/main/resources/db/migration/V1__canonical_music_core.sql'),
        "${sourcePostgresContainer}:/tmp/V1__canonical_music_core.sql"
    ) | Out-Null
    Invoke-Docker -Operation 'migration_apply' -Arguments @(
        'exec', '--', $sourcePostgresContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $databaseUser,
        '-d', $databaseName, '-f', '/tmp/V1__canonical_music_core.sql'
    ) | Out-Null

    $seedSql = @'
INSERT INTO artists(id, name, sort_name, created_at, updated_at) VALUES
('00000000-0000-0000-0000-000000000001', 'Fixture Artist', 'Fixture Artist', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO release_groups(id, title, primary_type, created_at, updated_at) VALUES
('00000000-0000-0000-0000-000000000002', 'Fixture Album', 'Album', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO releases(id, release_group_id, title, release_date, country_code, created_at, updated_at) VALUES
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Fixture Album', '2026-01-01', 'KR', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
INSERT INTO credits(id, artist_id, release_group_id, credit_role, position, created_at) VALUES
('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'PRIMARY', 1, '2026-01-01T00:00:00Z');
INSERT INTO external_identifiers(id, provider, entity_kind, external_id, release_id, created_at) VALUES
('00000000-0000-0000-0000-000000000004', 'fixture', 'RELEASE', 'fixture-release-001', '00000000-0000-0000-0000-000000000003', '2026-01-01T00:00:00Z');
INSERT INTO outbox_events(id, aggregate_type, aggregate_id, event_type, payload_json, state, attempts, next_attempt_at, created_at) VALUES
('00000000-0000-0000-0000-000000000009', 'RELEASE_GROUP', '00000000-0000-0000-0000-000000000002', 'CANONICAL_FIXTURE_READY', jsonb_build_object('fixture', true), 'PENDING', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
'@
    Invoke-Docker -Operation 'canonical_fixture_seed' -Arguments @(
        'exec', '--', $sourcePostgresContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $databaseUser,
        '-d', $databaseName, '-c', $seedSql
    ) | Out-Null
    $sourceSnapshot = Get-DatabaseSnapshot -ContainerName $sourcePostgresContainer

    Invoke-Docker -Operation 'pg_dump' -Arguments @(
        'exec', '--', $sourcePostgresContainer, 'pg_dump', '-U', $databaseUser, '-d', $databaseName,
        '--format=custom', '--file=/backup/fixture.dump'
    ) | Out-Null

    Invoke-Docker -Operation 'restored_postgres_start' -Arguments @(
        'run', '--detach', '--name', $restoredPostgresContainer, '--label', $resourceLabel,
        '--network', $networkName, '--env', "POSTGRES_DB=$databaseName", '--env', "POSTGRES_USER=$databaseUser",
        '--env', "POSTGRES_PASSWORD=$databasePassword", '--volume', "${restoredPostgresVolume}:/var/lib/postgresql/data",
        '--volume', "${dumpVolume}:/backup:ro", $postgresImage
    ) | Out-Null
    Wait-Postgres -ContainerName $restoredPostgresContainer
    Invoke-Docker -Operation 'pg_restore' -Arguments @(
        'exec', '--', $restoredPostgresContainer, 'pg_restore', '-U', $databaseUser, '-d', $databaseName,
        '--exit-on-error', '--clean', '--if-exists', '/backup/fixture.dump'
    ) | Out-Null
    $restoreExitCode = 0
    $restoredSnapshot = Get-DatabaseSnapshot -ContainerName $restoredPostgresContainer
    if ($sourceSnapshot.sha256 -ne $restoredSnapshot.sha256) {
        throw 'DATABASE_RESTORE_HASH_MISMATCH'
    }
    if (($sourceSnapshot.counts | ConvertTo-Json -Compress) -ne ($restoredSnapshot.counts | ConvertTo-Json -Compress)) {
        throw 'DATABASE_RESTORE_COUNT_MISMATCH'
    }

    Invoke-Docker -Operation 'graphdb_start' -Arguments @(
        'run', '--detach', '--name', $graphdbContainer, '--label', $resourceLabel, '--network', $networkName,
        '--env', 'GDB_HEAP_SIZE=1g', '--volume', "${graphdbVolume}:/opt/graphdb/home", $graphdbImage
    ) | Out-Null
    Wait-GraphDb

    Invoke-Docker -Operation 'graphdb_bootstrap' -Arguments @(
        'run', '--name', $bootstrapContainer, '--label', $resourceLabel, '--network', $networkName,
        '--entrypoint', '/app/pipeline/.venv/bin/python', $projectorImage,
        '-m', 'pipeline.graphdb_bootstrap', '--graphdb-url', "http://${graphdbContainer}:7200"
    ) | Out-Null
    $databaseUrl = "postgresql://${databaseUser}:${databasePassword}@${restoredPostgresContainer}:5432/${databaseName}"
    Invoke-Docker -Operation 'canonical_outbox_projection' -Arguments @(
        'run', '--name', $projectorContainer, '--label', $resourceLabel, '--network', $networkName,
        '--entrypoint', '/app/pipeline/.venv/bin/python', $projectorImage,
        '-m', 'pipeline.project_outbox', '--database-url', $databaseUrl,
        '--graphdb-url', "http://${graphdbContainer}:7200", '--output', '/tmp/outbox.json', '--max-events', '1'
    ) | Out-Null
    Invoke-Docker -Operation 'projection_report_copy' -Arguments @('cp', "${projectorContainer}:/tmp/outbox.json", $projectionReportPath) | Out-Null
    $projectionReport = Get-Content -LiteralPath $projectionReportPath -Raw | ConvertFrom-Json
    if ($projectionReport.status -ne 'SUCCEEDED' -or $projectionReport.consumed_events -ne 1) {
        throw 'CANONICAL_OUTBOX_PROJECTION_FAILED'
    }

    $generation = '00000000-0000-0000-0000-000000000009'
    $graphIri = "https://w3id.org/music-kg-graphrag/graph/postgresql/generation/$generation"
    $graphReadbackCode = @'
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from rdflib import Dataset, Graph
from pipeline.projection_store import graph_payload
base, graph_iri = __import__('sys').argv[1:3]
query = urlencode({'context': f'<{graph_iri}>'})
request = Request(f'{base}/repositories/music-kg/statements?{query}', headers={'Accept': 'application/n-quads'})
with urlopen(request, timeout=30) as response:
    content = response.read().decode('utf-8')
dataset = Dataset()
dataset.parse(data=content, format='nquads')
graph = Graph()
for subject, predicate, value, _context in dataset.quads((None, None, None, None)):
    graph.add((subject, predicate, value))
payload = graph_payload(graph, graph_iri)
print(json.dumps({'graph_sha256': payload.sha256, 'graph_triple_count': payload.triple_count}, sort_keys=True))
'@
    $graphJson = Invoke-Docker -Operation 'graph_hash_count_readback' -Arguments @(
        'run', '--rm', '--label', $resourceLabel, '--network', $networkName,
        '--entrypoint', '/app/pipeline/.venv/bin/python', $projectorImage, '-c', $graphReadbackCode,
        "http://${graphdbContainer}:7200", $graphIri
    )
    $graphSnapshot = $graphJson | ConvertFrom-Json
    $graphVerified = ($graphSnapshot.graph_triple_count -gt 0 -and $graphSnapshot.graph_sha256 -match '^[a-f0-9]{64}$')
    if (-not $graphVerified) {
        throw 'GRAPH_READBACK_VERIFICATION_FAILED'
    }
    $succeededOutboxCount = [int](Invoke-Docker -Operation 'outbox_success_readback' -Arguments @(
        'exec', '--', $restoredPostgresContainer, 'psql', '-U', $databaseUser, '-d', $databaseName,
        '-At', '-c', "SELECT count(*) FROM outbox_events WHERE state = 'SUCCEEDED';"
    ))
    if ($succeededOutboxCount -ne 1) {
        throw 'RESTORED_OUTBOX_NOT_SUCCEEDED'
    }

    $report = [ordered]@{
        artifact_kind = 'postgres_fresh_volume_restore'
        contract_version = '1.0.0'
        run_id = $runPrefix
        restore_exit_code = 0
        source_database_sha256 = $sourceSnapshot.sha256
        restored_database_sha256 = $restoredSnapshot.sha256
        database_counts = $restoredSnapshot.counts
        outbox_succeeded_count = $succeededOutboxCount
        graph_verified = $true
        graph_sha256 = $graphSnapshot.graph_sha256
        graph_triple_count = [int]$graphSnapshot.graph_triple_count
        resource_scope = 'unique_ephemeral_prefix'
        cleanup_scope = 'exact_named_resources_only'
        secrets_redacted = $true
    }
}
catch {
    $failureCode = if ($_.Exception.Message -match '^[A-Za-z0-9_:.-]+$') { $_.Exception.Message } else { 'RESTORE_DRILL_FAILED' }
}
finally {
    if (Test-Path -LiteralPath $projectionReportPath) {
        Remove-Item -LiteralPath $projectionReportPath -Force
    }
    foreach ($containerName in $containerNames) {
        if ($containerName.StartsWith($runPrefix, [System.StringComparison]::Ordinal)) {
            & docker rm --force -- $containerName *> $null
        }
    }
    foreach ($volumeName in $volumeNames) {
        if ($volumeName.StartsWith($runPrefix, [System.StringComparison]::Ordinal)) {
            & docker volume rm -- $volumeName *> $null
        }
    }
    if ($networkName.StartsWith($runPrefix, [System.StringComparison]::Ordinal)) {
        & docker network rm -- $networkName *> $null
    }
    if ($projectorImage.StartsWith($runPrefix, [System.StringComparison]::Ordinal)) {
        & docker image rm --force -- $projectorImage *> $null
    }
}

if ($null -eq $report) {
    $report = [ordered]@{
        artifact_kind = 'postgres_fresh_volume_restore'
        contract_version = '1.0.0'
        run_id = $runPrefix
        restore_exit_code = $restoreExitCode
        graph_verified = $graphVerified
        failure_code = $failureCode
        resource_scope = 'unique_ephemeral_prefix'
        cleanup_scope = 'exact_named_resources_only'
        secrets_redacted = $true
    }
}

$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$report | ConvertTo-Json -Depth 6
if ($null -ne $failureCode) {
    throw $failureCode
}
