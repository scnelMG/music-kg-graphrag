$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path ([System.IO.Path]::GetTempPath()) "music-kg-connected-render-test.yaml"
$previewOutput = Join-Path ([System.IO.Path]::GetTempPath()) "music-kg-connected-preview-render-test.yaml"
$script = Join-Path $PSScriptRoot "render-connected-cloud-run.ps1"
$digest = "asia-northeast3-docker.pkg.dev/project/music-kg/backend@sha256:$('a' * 64)"

try {
    $arguments = @{
        Template = Join-Path $repositoryRoot "deployment\cloud-run\connected-production-service.yaml.tmpl"
        Output = $output
        ImageDigest = $digest
        VercelOrigin = "https://music.example.invalid"
        ServiceAccount = "music-kg-production@project.iam.gserviceaccount.com"
        NotionDataSourceId = "notion-source"
        AlbumTitleField = "album"
        ArtistField = "artist"
        CoverField = "cover"
        SentimentField = "sentiment"
        FavouriteTrackField = "favourite-track"
        OwnedField = "owned"
        ReleaseGroupMbidField = "MusicBrainz MBID"
        ReleaseMbidField = "MusicBrainz Release MBID"
        CatalogSourceField = "Catalog Source"
        CatalogIdField = "Catalog ID"
        YoutubeRecordingMbidField = "MusicBrainz Recording MBID"
        YoutubeVideoIdField = "YouTube Video ID"
        YoutubeVideoTitleField = "YouTube Video Title"
        YoutubeChannelTitleField = "YouTube Channel Title"
        MusicBrainzUserAgent = "music-kg/1.0 (operator@example.invalid)"
        GraphDbBaseUrl = "http://10.178.0.2:7200"
        VpcNetwork = "default"
        VpcSubnetwork = "default"
    }
    & $script @arguments
    $rendered = Get-Content -LiteralPath $output -Raw -Encoding utf8
    if ($rendered -match '\$\{[A-Z0-9_]+\}') { throw "CONNECTED_MANIFEST_BINDING_REQUIRED" }
    if ($rendered -notmatch 'MUSIC_KG_GRAPHDB_BASE_URL') { throw "CONNECTED_MANIFEST_GRAPHDB_REQUIRED" }
    if ($rendered -notmatch 'run.googleapis.com/network-interfaces') { throw "CONNECTED_MANIFEST_VPC_REQUIRED" }
    if ($rendered -match 'MUSIC_KG_CONNECTED_READ_ONLY') { throw "PRODUCTION_READ_ONLY_MUST_DEFAULT_OFF" }
    if ($rendered -notmatch 'autoscaling.knative.dev/minScale:\s*"1"') { throw "PRODUCTION_MIN_INSTANCE_REQUIRED" }
    if ($rendered -notmatch 'run.googleapis.com/startup-cpu-boost:\s*"true"') { throw "PRODUCTION_STARTUP_CPU_BOOST_REQUIRED" }
    if ($rendered -notmatch 'containerConcurrency:\s*8') { throw "PRODUCTION_CONCURRENCY_REQUIRED" }
    if ($rendered -notmatch 'timeoutSeconds:\s*120') { throw "PRODUCTION_TIMEOUT_BASELINE_REQUIRED" }
    if ($rendered -notmatch '(?s)name:\s*MUSIC_KG_SEARCH_RATE_LIMIT_PER_MINUTE\s+value:\s*"300"') { throw "PRODUCTION_SEARCH_RATE_LIMIT_REQUIRED" }

    $previewArguments = $arguments.Clone()
    $previewArguments.Template = Join-Path $repositoryRoot "deployment\cloud-run\connected-preview-service.yaml.tmpl"
    $previewArguments.Output = $previewOutput
    $previewArguments.ServiceAccount = "music-kg-preview@project.iam.gserviceaccount.com"
    & $script @previewArguments
    $previewRendered = Get-Content -LiteralPath $previewOutput -Raw -Encoding utf8
    if ($previewRendered -notmatch '(?s)name:\s*MUSIC_KG_CONNECTED_READ_ONLY\s+value:\s*"true"') {
        throw "PREVIEW_READ_ONLY_REQUIRED"
    }
    if ($previewRendered -notmatch 'autoscaling.knative.dev/minScale:\s*"1"') { throw "PREVIEW_MIN_INSTANCE_REQUIRED" }
    if ($previewRendered -notmatch 'run.googleapis.com/startup-cpu-boost:\s*"true"') { throw "PREVIEW_STARTUP_CPU_BOOST_REQUIRED" }
    if ($previewRendered -notmatch 'containerConcurrency:\s*8') { throw "PREVIEW_CONCURRENCY_REQUIRED" }
    if ($previewRendered -notmatch 'timeoutSeconds:\s*120') { throw "PREVIEW_COLD_INSIGHTS_TIMEOUT_REQUIRED" }
    if ($previewRendered -notmatch '(?s)name:\s*MUSIC_KG_SEARCH_RATE_LIMIT_PER_MINUTE\s+value:\s*"300"') { throw "PREVIEW_SEARCH_RATE_LIMIT_REQUIRED" }
    Write-Output "CONNECTED_MANIFEST_RENDER_STATIC_CONTRACT_PASS"
} finally {
    Remove-Item -LiteralPath $output -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $previewOutput -Force -ErrorAction SilentlyContinue
}
