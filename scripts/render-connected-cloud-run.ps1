[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Template,
    [Parameter(Mandatory = $true)][string]$Output,
    [Parameter(Mandatory = $true)][string]$ImageDigest,
    [Parameter(Mandatory = $true)][string]$VercelOrigin,
    [Parameter(Mandatory = $true)][string]$ServiceAccount,
    [Parameter(Mandatory = $true)][string]$NotionDataSourceId,
    [Parameter(Mandatory = $true)][string]$AlbumTitleField,
    [Parameter(Mandatory = $true)][string]$ArtistField,
    [Parameter(Mandatory = $true)][string]$CoverField,
    [Parameter(Mandatory = $true)][string]$SentimentField,
    [Parameter(Mandatory = $true)][string]$FavouriteTrackField,
    [Parameter(Mandatory = $true)][string]$OwnedField,
    [Parameter(Mandatory = $true)][string]$ReleaseGroupMbidField,
    [Parameter(Mandatory = $true)][string]$MusicBrainzUserAgent,
    [Parameter(Mandatory = $true)][string]$GraphDbBaseUrl,
    [Parameter(Mandatory = $true)][string]$VpcNetwork,
    [Parameter(Mandatory = $true)][string]$VpcSubnetwork
)

$ErrorActionPreference = "Stop"
if ($ImageDigest -notmatch '@sha256:[0-9a-f]{64}$') { throw "IMMUTABLE_IMAGE_DIGEST_REQUIRED" }
if ($VercelOrigin -notmatch '^https://[^/]+$') { throw "VERCEL_ORIGIN_REQUIRED" }
if ($ServiceAccount -notmatch '^[^@]+@[^@]+\.iam\.gserviceaccount\.com$') { throw "SERVICE_ACCOUNT_REQUIRED" }
if ($GraphDbBaseUrl -notmatch '^http://10\.') { throw "PRIVATE_GRAPHDB_URL_REQUIRED" }

$source = Get-Content -LiteralPath $Template -Raw -Encoding utf8
$bindings = [ordered]@{
    '${IMAGE_DIGEST}' = $ImageDigest
    '${VERCEL_PRODUCTION_ORIGIN}' = $VercelOrigin
    '${VERCEL_PREVIEW_ORIGIN}' = $VercelOrigin
    '${CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT}' = $ServiceAccount
    '${CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT}' = $ServiceAccount
    '${NOTION_PRODUCTION_DATA_SOURCE_ID}' = $NotionDataSourceId
    '${NOTION_PREVIEW_DATA_SOURCE_ID}' = $NotionDataSourceId
    '${NOTION_ALBUM_TITLE_FIELD}' = $AlbumTitleField
    '${NOTION_ARTIST_FIELD}' = $ArtistField
    '${NOTION_COVER_FIELD}' = $CoverField
    '${NOTION_SENTIMENT_FIELD}' = $SentimentField
    '${NOTION_FAVOURITE_TRACK_FIELD}' = $FavouriteTrackField
    '${NOTION_OWNED_FIELD}' = $OwnedField
    '${NOTION_RELEASE_GROUP_MBID_FIELD}' = $ReleaseGroupMbidField
    '${MUSICBRAINZ_USER_AGENT}' = $MusicBrainzUserAgent
    '${PERSONAL_GRAPHDB_BASE_URL}' = $GraphDbBaseUrl
    '${PERSONAL_GRAPHDB_VPC_NETWORK}' = $VpcNetwork
    '${PERSONAL_GRAPHDB_VPC_SUBNETWORK}' = $VpcSubnetwork
}
foreach ($binding in $bindings.GetEnumerator()) {
    $source = $source.Replace($binding.Key, $binding.Value)
}
if ($source -match '\$\{[A-Z0-9_]+\}') { throw "CONNECTED_MANIFEST_BINDING_REQUIRED" }

$outputDirectory = Split-Path -Parent $Output
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
[System.IO.File]::WriteAllText($Output, $source, [System.Text.UTF8Encoding]::new($false))
Write-Output "CONNECTED_MANIFEST_RENDERED: $Output"
