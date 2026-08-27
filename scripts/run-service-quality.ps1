param(
    [switch]$Integration
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$pytestUnitTempRoot = Join-Path $repositoryRoot ".tmp\pytest-service-quality-$PID"
$pytestIntegrationTempRoot = Join-Path $repositoryRoot ".tmp\pytest-service-integration-$PID"

Push-Location $repositoryRoot
try {
    New-Item -ItemType Directory -Force -Path $pytestUnitTempRoot | Out-Null
    & pnpm --dir frontend typecheck
    if ($LASTEXITCODE -ne 0) { throw "Frontend typecheck failed with exit code $LASTEXITCODE." }
    & pnpm --dir frontend test
    if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed with exit code $LASTEXITCODE." }
    & pnpm --dir frontend build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE." }
    & .\backend\gradlew.bat -p backend test --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Backend unit and contract tests failed with exit code $LASTEXITCODE." }
    Push-Location (Join-Path $repositoryRoot "pipeline")
    try {
        & .\.venv\Scripts\python.exe -m pytest tests -m "not integration" -q -p no:cacheprovider --basetemp $pytestUnitTempRoot
        $pipelineUnitExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($pipelineUnitExitCode -ne 0) { throw "Pipeline unit and contract tests failed with exit code $pipelineUnitExitCode." }
    if ($Integration) {
        & .\backend\gradlew.bat -p backend integrationTest --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "Backend integration tests failed with exit code $LASTEXITCODE." }
        New-Item -ItemType Directory -Force -Path $pytestIntegrationTempRoot | Out-Null
        Push-Location (Join-Path $repositoryRoot "pipeline")
        try {
            & .\.venv\Scripts\python.exe -m pytest tests -m integration -q -p no:cacheprovider --basetemp $pytestIntegrationTempRoot
            $pipelineIntegrationExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        if ($pipelineIntegrationExitCode -ne 0) { throw "Pipeline integration tests failed with exit code $pipelineIntegrationExitCode." }
    }
} finally {
    Pop-Location
}
