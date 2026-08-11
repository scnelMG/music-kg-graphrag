$ErrorActionPreference = "Stop"
$script = Get-Content -LiteralPath (Join-Path $PSScriptRoot "deploy-personal-graphdb-vm.ps1") -Raw
$startup = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) "deployment\graphdb\personal-graphdb-startup.sh") -Raw

if ($script -notmatch '\[switch\]\$Deploy') { throw "PERSONAL_GRAPHDB_EXPLICIT_DEPLOY_REQUIRED" }
if ($script -notmatch 'e2-medium') { throw "PERSONAL_GRAPHDB_MINIMUM_MEMORY_CLASS_REQUIRED" }
if ($script -notmatch '"--boot-disk-size", "30GB"') { throw "PERSONAL_GRAPHDB_PERSISTENT_DISK_REQUIRED" }
if ($script -notmatch 'network=\$Network,subnet=\$Subnetwork') { throw "PERSONAL_GRAPHDB_VPC_REQUIRED" }
if ($startup -notmatch 'ontotext/graphdb@sha256:[0-9a-f]{64}') { throw "PERSONAL_GRAPHDB_IMMUTABLE_IMAGE_REQUIRED" }
if ($startup -notmatch 'music-kg-personal') { throw "PERSONAL_GRAPHDB_PRIVATE_REPOSITORY_REQUIRED" }
if ($startup -notmatch 'personal-repository-config') { throw "PERSONAL_GRAPHDB_BOOTSTRAP_CONFIG_REQUIRED" }

Write-Output "PERSONAL_GRAPHDB_VM_STATIC_CONTRACT_PASS"
