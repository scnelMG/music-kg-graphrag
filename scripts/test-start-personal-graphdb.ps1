$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$script = Get-Content -LiteralPath (Join-Path $PSScriptRoot "start-personal-graphdb.ps1") -Raw
$repositoryConfig = Join-Path $repositoryRoot "deployment\graphdb\personal-repository-config.ttl"

if (-not (Test-Path -LiteralPath $repositoryConfig -PathType Leaf)) { throw "PERSONAL_GRAPHDB_REPOSITORY_CONFIG_REQUIRED" }
if ($script -notmatch '127\.0\.0\.1:7200:7200') { throw "PERSONAL_GRAPHDB_LOOPBACK_BINDING_REQUIRED" }
if ($script -notmatch 'ontotext/graphdb@sha256:[0-9a-f]{64}') { throw "PERSONAL_GRAPHDB_IMMUTABLE_IMAGE_REQUIRED" }
if ($script -notmatch 'music-kg-personal') { throw "PERSONAL_GRAPHDB_PRIVATE_REPOSITORY_REQUIRED" }
if ($script -notmatch 'PERSONAL_GRAPHDB_CONFIGURATION_READY') { throw "PERSONAL_GRAPHDB_CHECK_ONLY_REQUIRED" }
if ($script -notmatch 'Out-String\)\.Trim\(\)') { throw "PERSONAL_GRAPHDB_EMPTY_CONTAINER_LIST_HANDLING_REQUIRED" }
$config = Get-Content -LiteralPath $repositoryConfig -Raw
if ($config -notmatch 'graphdb#query-timeout>\s+"5"') { throw "PERSONAL_GRAPHDB_QUERY_TIMEOUT_REQUIRED" }
if ($config -notmatch 'graphdb#throw-QueryEvaluationException-on-timeout>\s+"true"') { throw "PERSONAL_GRAPHDB_TIMEOUT_MUST_FAIL_CLOSED" }

Write-Output "PERSONAL_GRAPHDB_STATIC_CONTRACT_PASS"
