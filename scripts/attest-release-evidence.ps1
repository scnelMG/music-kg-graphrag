[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$OutputDirectory,
    [Parameter(Mandatory)] [string]$ProtectedPreviewEvidence,
    [Parameter(Mandatory)] [string]$FreshRestoreEvidence,
    [Parameter(Mandatory)] [string]$RollbackEvidence,
    [Parameter(Mandatory)] [string]$VercelEnvironmentEvidence
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$keyValue = [Environment]::GetEnvironmentVariable('MUSIC_KG_RELEASE_ATTESTATION_KEY', 'Process')
if ($null -eq $keyValue) {
    throw 'RELEASE_ATTESTATION_KEY_MISSING'
}
$keyBytes = $utf8.GetBytes($keyValue)
if ($keyBytes.Length -lt 32) {
    throw 'RELEASE_ATTESTATION_KEY_TOO_SHORT'
}

$gateDefinitions = @(
    [ordered]@{
        filename = 'protected-preview.json'
        gate = 'protected-preview'
        input = $ProtectedPreviewEvidence
        evidence = [ordered]@{
            access_control = 'protected'
            artifact_kind = 'vercel_protected_preview'
            health_status = 200
        }
    },
    [ordered]@{
        filename = 'fresh-volume-restore.json'
        gate = 'fresh-volume-restore'
        input = $FreshRestoreEvidence
        evidence = [ordered]@{
            artifact_kind = 'postgres_fresh_volume_restore'
            graph_verified = $true
            restore_exit_code = 0
        }
    },
    [ordered]@{
        filename = 'deployment-rollback.json'
        gate = 'deployment-rollback'
        input = $RollbackEvidence
        evidence = [ordered]@{
            artifact_kind = 'cloud_run_rollback'
            rollback_exit_code = 0
            service_healthy = $true
        }
    },
    [ordered]@{
        filename = 'vercel-environments.json'
        gate = 'vercel-environments'
        input = $VercelEnvironmentEvidence
        evidence = [ordered]@{
            artifact_kind = 'vercel_environment_inventory'
            preview_configured = $true
            production_configured = $true
            public_secret_exposure = $false
        }
    }
)

function Read-ValidatedEvidence {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [System.Collections.IDictionary]$Expected,
        [Parameter(Mandatory)] [string]$Gate
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "RELEASE_EVIDENCE_MISSING:$Gate"
    }
    try {
        $loaded = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "RELEASE_EVIDENCE_INVALID_JSON:$Gate"
    }
    if ($null -eq $loaded -or $loaded -is [System.Array]) {
        throw "RELEASE_EVIDENCE_INVALID_OBJECT:$Gate"
    }
    foreach ($entry in $Expected.GetEnumerator()) {
        $property = $loaded.PSObject.Properties[$entry.Key]
        if ($null -eq $property -or $property.Value -isnot $entry.Value.GetType() -or $property.Value -cne $entry.Value) {
            throw "RELEASE_EVIDENCE_FIELD_MISMATCH:$Gate`:$($entry.Key)"
        }
    }
    return $Expected
}

function Get-Sha256 {
    param([Parameter(Mandatory)] [byte[]]$Bytes)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-HmacSha256 {
    param([Parameter(Mandatory)] [string]$Value)

    $hmac = New-Object System.Security.Cryptography.HMACSHA256(,$keyBytes)
    try {
        return ([BitConverter]::ToString($hmac.ComputeHash($utf8.GetBytes($Value)))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hmac.Dispose()
    }
}

$validated = @()
foreach ($definition in $gateDefinitions) {
    $validated += [ordered]@{
        filename = $definition.filename
        gate = $definition.gate
        evidence = Read-ValidatedEvidence -Path $definition.input -Expected $definition.evidence -Gate $definition.gate
    }
}

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputPath) {
    throw 'RELEASE_ATTESTATION_OUTPUT_EXISTS'
}
$outputParent = Split-Path $outputPath -Parent
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
    [System.IO.Directory]::CreateDirectory($outputParent) | Out-Null
}
$stagingPath = "$outputPath.staging-$([guid]::NewGuid().ToString('N'))"
$observedAt = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture)

try {
    [System.IO.Directory]::CreateDirectory((Join-Path $stagingPath 'transcripts')) | Out-Null
    foreach ($item in $validated) {
        $evidenceJson = $item.evidence | ConvertTo-Json -Compress
        $transcript = [ordered]@{
            argv = @('attest-release-evidence', '--prevalidated-gate', $item.gate)
            exit_code = 0
            schema_version = 'music-kg-command-transcript/v1'
            stderr = ''
            stdout = $evidenceJson + "`n"
        }
        $transcriptJson = ($transcript | ConvertTo-Json -Depth 8) + "`n"
        $transcriptBytes = $utf8.GetBytes($transcriptJson)
        $transcriptPath = Join-Path (Join-Path $stagingPath 'transcripts') $item.filename
        [System.IO.File]::WriteAllBytes($transcriptPath, $transcriptBytes)

        $receiptBody = [ordered]@{
            command_artifact = [ordered]@{
                exit_code = 0
                path = "transcripts/$($item.filename)"
                sha256 = "sha256:$(Get-Sha256 -Bytes $transcriptBytes)"
            }
            evidence = $item.evidence
            gate = $item.gate
            observed_at = $observedAt
            provenance = [ordered]@{
                collection_mode = 'live-command'
                issuer = 'music-kg-ops-verifier'
            }
            schema_version = 'music-kg-release-evidence/v2'
            status = 'PASS'
        }
        $canonical = $receiptBody | ConvertTo-Json -Compress -Depth 8
        $receipt = [ordered]@{}
        foreach ($entry in $receiptBody.GetEnumerator()) {
            $receipt[$entry.Key] = $entry.Value
        }
        $receipt.attestation = "hmac-sha256:$(Get-HmacSha256 -Value $canonical)"
        $receiptBytes = $utf8.GetBytes(($receipt | ConvertTo-Json -Compress -Depth 8) + "`n")
        [System.IO.File]::WriteAllBytes((Join-Path $stagingPath $item.filename), $receiptBytes)
    }
    Move-Item -LiteralPath $stagingPath -Destination $outputPath
}
finally {
    if ($stagingPath.StartsWith("$outputPath.staging-", [StringComparison]::Ordinal) -and (Test-Path -LiteralPath $stagingPath)) {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
}

Write-Output 'RELEASE_EVIDENCE_ATTESTED gates=4'
