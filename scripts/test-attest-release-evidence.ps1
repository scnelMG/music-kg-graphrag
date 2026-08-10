[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$attesterPath = Join-Path $PSScriptRoot 'attest-release-evidence.ps1'
if (-not (Test-Path -LiteralPath $attesterPath -PathType Leaf)) {
    throw 'RELEASE_ATTESTER_MISSING: attest-release-evidence.ps1 does not exist'
}

$runRoot = Join-Path ([System.IO.Path]::GetTempPath()) "music-kg-attester-test-$([guid]::NewGuid().ToString('N'))"
$inputDirectory = Join-Path $runRoot 'inputs'
$validOutput = Join-Path $runRoot 'valid-output'
$missingKeyOutput = Join-Path $runRoot 'missing-key-output'
$shortKeyOutput = Join-Path $runRoot 'short-key-output'
$wrongEvidenceOutput = Join-Path $runRoot 'wrong-evidence-output'
$missingEvidenceOutput = Join-Path $runRoot 'missing-evidence-output'
$originalKey = [Environment]::GetEnvironmentVariable('MUSIC_KG_RELEASE_ATTESTATION_KEY', 'Process')

function Write-FixtureJson {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [System.Collections.IDictionary]$Value
    )
    $Value | ConvertTo-Json -Compress | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-Attester {
    param([Parameter(Mandatory)] [string]$OutputDirectory)
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $attesterPath `
            -OutputDirectory $OutputDirectory `
            -ProtectedPreviewEvidence (Join-Path $inputDirectory 'protected-preview.json') `
            -FreshRestoreEvidence (Join-Path $inputDirectory 'fresh-volume-restore.json') `
            -RollbackEvidence (Join-Path $inputDirectory 'deployment-rollback.json') `
            -VercelEnvironmentEvidence (Join-Path $inputDirectory 'vercel-environments.json') *> $null
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

try {
    [System.IO.Directory]::CreateDirectory($inputDirectory) | Out-Null
    Write-FixtureJson -Path (Join-Path $inputDirectory 'protected-preview.json') -Value ([ordered]@{
        access_control = 'protected'; artifact_kind = 'vercel_protected_preview'; health_status = 200
    })
    Write-FixtureJson -Path (Join-Path $inputDirectory 'fresh-volume-restore.json') -Value ([ordered]@{
        artifact_kind = 'postgres_fresh_volume_restore'; graph_verified = $true; restore_exit_code = 0
    })
    Write-FixtureJson -Path (Join-Path $inputDirectory 'deployment-rollback.json') -Value ([ordered]@{
        artifact_kind = 'cloud_run_rollback'; rollback_exit_code = 0; service_healthy = $true
    })
    Write-FixtureJson -Path (Join-Path $inputDirectory 'vercel-environments.json') -Value ([ordered]@{
        artifact_kind = 'vercel_environment_inventory'; preview_configured = $true
        production_configured = $true; public_secret_exposure = $false
    })

    [Environment]::SetEnvironmentVariable('MUSIC_KG_RELEASE_ATTESTATION_KEY', $null, 'Process')
    if ((Invoke-Attester -OutputDirectory $missingKeyOutput) -eq 0 -or (Test-Path -LiteralPath $missingKeyOutput)) {
        throw 'GIVEN_MISSING_KEY_WHEN_ATTESTING_THEN_FAIL_CLOSED'
    }

    [Environment]::SetEnvironmentVariable('MUSIC_KG_RELEASE_ATTESTATION_KEY', 'short', 'Process')
    if ((Invoke-Attester -OutputDirectory $shortKeyOutput) -eq 0 -or (Test-Path -LiteralPath $shortKeyOutput)) {
        throw 'GIVEN_SHORT_KEY_WHEN_ATTESTING_THEN_FAIL_CLOSED'
    }

    $keyBytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($keyBytes)
    $runtimeKey = [Convert]::ToBase64String($keyBytes)
    [Environment]::SetEnvironmentVariable('MUSIC_KG_RELEASE_ATTESTATION_KEY', $runtimeKey, 'Process')
    if ((Invoke-Attester -OutputDirectory $validOutput) -ne 0) {
        throw 'GIVEN_VALID_EVIDENCE_WHEN_ATTESTING_THEN_SUCCEED'
    }

    $expectedFiles = @(
        'protected-preview.json', 'fresh-volume-restore.json',
        'deployment-rollback.json', 'vercel-environments.json',
        'transcripts/protected-preview.json', 'transcripts/fresh-volume-restore.json',
        'transcripts/deployment-rollback.json', 'transcripts/vercel-environments.json'
    )
    foreach ($relativePath in $expectedFiles) {
        $path = Join-Path $validOutput $relativePath
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
            throw "ATTESTATION_OUTPUT_MISSING:$relativePath"
        }
    }

    foreach ($filename in @('protected-preview.json', 'fresh-volume-restore.json', 'deployment-rollback.json', 'vercel-environments.json')) {
        $receiptPath = Join-Path $validOutput $filename
        $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        if ($receipt.schema_version -ne 'music-kg-release-evidence/v2' -or $receipt.status -ne 'PASS') {
            throw "INVALID_RECEIPT_CONTRACT:$filename"
        }
        $body = [ordered]@{}
        foreach ($property in $receipt.PSObject.Properties) {
            if ($property.Name -ne 'attestation') {
                $body[$property.Name] = $property.Value
            }
        }
        $canonical = $body | ConvertTo-Json -Compress -Depth 8
        $hmac = New-Object System.Security.Cryptography.HMACSHA256(,[System.Text.Encoding]::UTF8.GetBytes($runtimeKey))
        try {
            $expectedHmac = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical)))).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $hmac.Dispose()
        }
        if ($receipt.attestation -ne "hmac-sha256:$expectedHmac") {
            throw "INVALID_RECEIPT_HMAC:$filename"
        }
        $transcriptPath = Join-Path $validOutput $receipt.command_artifact.path
        $transcriptBytes = [System.IO.File]::ReadAllBytes($transcriptPath)
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $transcriptHash = ([BitConverter]::ToString($sha256.ComputeHash($transcriptBytes))).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $sha256.Dispose()
        }
        if ($receipt.command_artifact.sha256 -ne "sha256:$transcriptHash") {
            throw "INVALID_TRANSCRIPT_HASH:$filename"
        }
        $transcriptText = [Text.Encoding]::UTF8.GetString($transcriptBytes)
        if ($transcriptText.Contains($runtimeKey) -or $transcriptText -match 'https?://') {
            throw "TRANSCRIPT_SENSITIVE_VALUE_EXPOSURE:$filename"
        }
        $transcript = $transcriptText | ConvertFrom-Json
        if ($transcript.schema_version -ne 'music-kg-command-transcript/v1' -or $transcript.exit_code -ne 0 -or $transcript.stderr -ne '') {
            throw "INVALID_TRANSCRIPT_CONTRACT:$filename"
        }
        $stdoutEvidence = $transcript.stdout | ConvertFrom-Json
        if (($stdoutEvidence | ConvertTo-Json -Compress) -ne ($receipt.evidence | ConvertTo-Json -Compress)) {
            throw "TRANSCRIPT_EVIDENCE_MISMATCH:$filename"
        }
    }

    Write-FixtureJson -Path (Join-Path $inputDirectory 'deployment-rollback.json') -Value ([ordered]@{
        artifact_kind = 'cloud_run_rollback'; rollback_exit_code = 1; service_healthy = $true
    })
    if ((Invoke-Attester -OutputDirectory $wrongEvidenceOutput) -eq 0 -or (Test-Path -LiteralPath $wrongEvidenceOutput)) {
        throw 'GIVEN_WRONG_EVIDENCE_WHEN_ATTESTING_THEN_FAIL_CLOSED'
    }

    Write-FixtureJson -Path (Join-Path $inputDirectory 'deployment-rollback.json') -Value ([ordered]@{
        artifact_kind = 'cloud_run_rollback'; rollback_exit_code = 0; service_healthy = $true
    })
    $protectedPath = Join-Path $inputDirectory 'protected-preview.json'
    $heldProtectedPath = "$protectedPath.held"
    Move-Item -LiteralPath $protectedPath -Destination $heldProtectedPath
    try {
        if ((Invoke-Attester -OutputDirectory $missingEvidenceOutput) -eq 0 -or (Test-Path -LiteralPath $missingEvidenceOutput)) {
            throw 'GIVEN_MISSING_EVIDENCE_WHEN_ATTESTING_THEN_FAIL_CLOSED'
        }
    }
    finally {
        Move-Item -LiteralPath $heldProtectedPath -Destination $protectedPath
    }

    Write-Output 'RELEASE_EVIDENCE_ATTESTER_TESTS_VALID'
}
finally {
    [Environment]::SetEnvironmentVariable('MUSIC_KG_RELEASE_ATTESTATION_KEY', $originalKey, 'Process')
    if ($runRoot.StartsWith([System.IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $runRoot)) {
        Remove-Item -LiteralPath $runRoot -Recurse -Force
    }
}
