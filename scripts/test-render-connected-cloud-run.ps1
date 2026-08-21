$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path ([System.IO.Path]::GetTempPath()) "music-kg-connected-render-test.yaml"
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
    Write-Output "CONNECTED_MANIFEST_RENDER_STATIC_CONTRACT_PASS"
} finally {
    Remove-Item -LiteralPath $output -Force -ErrorAction SilentlyContinue
}
