[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentPath,
    [Parameter(Mandatory = $true)]
    [string]$AlbumQuery,
    [switch]$Execute
)

$ErrorActionPreference = "Stop"

function Set-EnvironmentFromFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "NOTION_E2E_ENV_FILE_REQUIRED" }
    [System.IO.File]::ReadAllLines($Path, [System.Text.UTF8Encoding]::new($false)) | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
        $pair = $line.Split("=", 2)
        if ($pair.Count -ne 2 -or [string]::IsNullOrWhiteSpace($pair[0])) { throw "NOTION_E2E_ENV_LINE_INVALID" }
        [System.Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), "Process")
    }
}

function Require-Value {
    param([string]$Name)

    $value = [System.Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value) -or $value.ToLowerInvariant().Contains("replace-with")) {
        throw "NOTION_E2E_VALUE_REQUIRED: $Name"
    }
    return $value
}

function Invoke-ConnectedApi {
    param([string]$Path, [string]$Method = "GET", [object]$Body)

    $headers = @{ "X-Music-Kg-Bff-Secret" = $script:sharedSecret }
    $parameters = @{ Uri = "$script:baseUrl/$Path"; Method = $Method; Headers = $headers; UseBasicParsing = $true }
    if ($null -ne $Body) {
        $parameters["ContentType"] = "application/json"
        $parameters["Body"] = $Body | ConvertTo-Json -Depth 8 -Compress
    }
    try {
        return (Invoke-WebRequest @parameters).Content | ConvertFrom-Json
    } catch {
        $response = $_.Exception.Response
        $status = if ($null -eq $response) { "NETWORK" } else { [int]$response.StatusCode }
        throw "NOTION_E2E_API_FAILED: $Method $Path ($status)"
    }
}

Set-EnvironmentFromFile -Path $EnvironmentPath
$notionDataSourceId = Require-Value -Name "NOTION_DATA_SOURCE_ID"
$productionDataSourceId = Require-Value -Name "NOTION_PRODUCTION_DATA_SOURCE_ID"
$script:sharedSecret = Require-Value -Name "BACKEND_BFF_SHARED_SECRET"
$script:baseUrl = $BaseUrl.TrimEnd("/")
if ($notionDataSourceId -eq $productionDataSourceId) {
    throw "NOTION_E2E_PRODUCTION_DATA_SOURCE_BLOCKED"
}
if (-not $script:baseUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "NOTION_E2E_HTTPS_BASE_URL_REQUIRED"
}

if (-not $Execute) {
    Write-Output "NOTION_E2E_PLAN_READY: no external request or Notion write was performed"
    return
}

$createdPageId = $null
try {
    $health = Invoke-ConnectedApi -Path "api/v1/health"
    $ready = Invoke-ConnectedApi -Path "api/v1/ready"
    if ($health.status -ne "ok" -or $health.mode -ne "connected" -or -not $ready.ready) {
        throw "NOTION_E2E_SERVICE_NOT_READY"
    }

    $records = @(Invoke-ConnectedApi -Path "api/v1/listening-records")
    $encodedQuery = [uri]::EscapeDataString($AlbumQuery.Trim())
    $albums = @(Invoke-ConnectedApi -Path "api/v1/catalog/albums?q=$encodedQuery")
    $candidate = $albums | Where-Object { -not ($records.releaseGroupMbid -contains $_.releaseGroupMbid) } | Select-Object -First 1
    if ($null -eq $candidate) { throw "NOTION_E2E_UNRECORDED_ALBUM_REQUIRED" }

    $tracks = @(Invoke-ConnectedApi -Path "api/v1/catalog/albums/$($candidate.releaseGroupMbid)/tracks")
    $track = $tracks | Select-Object -First 1
    if ($null -eq $track -or [string]::IsNullOrWhiteSpace($track.title)) { throw "NOTION_E2E_REAL_TRACK_REQUIRED" }
    $options = Invoke-ConnectedApi -Path "api/v1/listening-records/form-options"
    $sentiment = @($options.sentiments) | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($sentiment)) { throw "NOTION_E2E_SENTIMENT_OPTION_REQUIRED" }

    $saved = Invoke-ConnectedApi -Path "api/v1/listening-records" -Method "POST" -Body ([ordered]@{
        albumTitle = $candidate.title
        artist = $candidate.artist
        artistCredits = @($candidate.artistCredits)
        coverUrl = $candidate.coverUrl
        favouriteTrack = $track.title
        owned = $false
        releaseGroupMbid = $candidate.releaseGroupMbid
        sentiment = $sentiment
    })
    if ($saved.operation -ne "CREATED" -or [string]::IsNullOrWhiteSpace($saved.notionPageId)) {
        throw "NOTION_E2E_CREATE_CONTRACT_FAILED"
    }
    $createdPageId = $saved.notionPageId

    $refreshed = @(Invoke-ConnectedApi -Path "api/v1/listening-records")
    if (-not ($refreshed | Where-Object { $_.pageId -eq $createdPageId -and $_.favouriteTrack -eq $track.title })) {
        throw "NOTION_E2E_LIST_REFRESH_FAILED"
    }
    $archived = Invoke-ConnectedApi -Path "api/v1/listening-records/$createdPageId" -Method "DELETE"
    if ($archived.operation -ne "ARCHIVED") { throw "NOTION_E2E_ARCHIVE_CONTRACT_FAILED" }
    $restored = Invoke-ConnectedApi -Path "api/v1/listening-records/$createdPageId/restore" -Method "POST"
    if ($restored.operation -ne "RESTORED") { throw "NOTION_E2E_RESTORE_CONTRACT_FAILED" }
    $finalArchive = Invoke-ConnectedApi -Path "api/v1/listening-records/$createdPageId" -Method "DELETE"
    if ($finalArchive.operation -ne "ARCHIVED") { throw "NOTION_E2E_FINAL_ARCHIVE_FAILED" }
    $createdPageId = $null
    Write-Output "NOTION_E2E_PASS: searched, selected an unrecorded real album, validated a provider track, created, listed, restored, and archived the dedicated-test record"
} finally {
    if ($null -ne $createdPageId) {
        try { $null = Invoke-ConnectedApi -Path "api/v1/listening-records/$createdPageId" -Method "DELETE" } catch { Write-Error "NOTION_E2E_CLEANUP_ARCHIVE_FAILED" }
    }
}
