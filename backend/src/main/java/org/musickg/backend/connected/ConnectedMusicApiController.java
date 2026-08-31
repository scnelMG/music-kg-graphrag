package org.musickg.backend.connected;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
import org.springframework.http.ResponseEntity;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(prefix = "music-kg.connected", name = "mode", havingValue = "connected")
class ConnectedMusicApiController {
    private final ConnectedMusicService service;
    private final ConnectedOperationMetrics metrics;

    ConnectedMusicApiController(ConnectedMusicService service, ConnectedOperationMetrics metrics) {
        this.service = service;
        this.metrics = metrics;
    }

    @GetMapping("/health")
    Health health() {
        return metrics.observe("health", () -> new Health("ok", "connected"));
    }

    @GetMapping("/ready")
    ResponseEntity<ConnectedMusicService.ServiceReadiness> readiness() {
        return metrics.observe("readiness", () -> {
            ConnectedMusicService.ServiceReadiness readiness = service.readiness();
            return readiness.ready() ? ResponseEntity.ok(readiness) : ResponseEntity.status(503).body(readiness);
        });
    }

    @GetMapping("/catalog/albums")
    List<MusicCatalogGateway.Album> albums(@RequestParam @NotBlank String q) {
        return metrics.observe("catalog.search", () -> service.search(q));
    }

    @GetMapping("/catalog/explore")
    List<MusicCatalogGateway.Album> explore(@RequestParam @Pattern(regexp = "dream-pop|indie-rock|folk|electronic") String genre) {
        return metrics.observe("catalog.explore", () -> service.searchByTag(catalogTag(genre)));
    }

    @GetMapping("/catalog/albums/{releaseGroupMbid}/editions")
    MusicCatalogGateway.EditionPage editions(@PathVariable @NotBlank String releaseGroupMbid,
                                               @RequestParam(required = false) @Min(0) Integer cursor,
                                               @RequestParam(required = false) String selected) {
        String cursorValue = cursor == null ? null : Integer.toString(cursor);
        return metrics.observe("catalog.editions", () -> service.editions(releaseGroupMbid, cursorValue, selected));
    }

    @GetMapping("/catalog/albums/{releaseGroupMbid}/tracks")
    List<MusicCatalogGateway.Track> tracks(@PathVariable @NotBlank String releaseGroupMbid,
                                            @RequestParam("edition") @NotBlank String releaseMbid) {
        return metrics.observe("catalog.tracks", () -> service.tracks(releaseGroupMbid, releaseMbid));
    }

    @GetMapping("/catalog/itunes/albums/{collectionId}/tracks")
    List<MusicCatalogGateway.Track> iTunesTracks(@PathVariable @NotBlank String collectionId) {
        return metrics.observe("catalog.itunes.tracks", () -> service.iTunesTracks(collectionId));
    }

    @GetMapping("/listening-records")
    List<NotionClient.ExistingRecord> records() {
        return metrics.observe("records.list", service::records);
    }

    @GetMapping("/listening-records/page")
    NotionClient.RecordPage recordsPage(@RequestParam(defaultValue = "12") @Min(1) @Max(24) int limit,
                                        @RequestParam(required = false) String cursor) {
        return metrics.observe("records.page", () -> service.recordsPage(limit, cursor));
    }

    @GetMapping("/listening-records/by-release-group/{releaseGroupMbid}")
    ResponseEntity<NotionClient.ExistingRecord> recordByReleaseGroupMbid(
            @PathVariable @NotBlank String releaseGroupMbid) {
        return metrics.observe("records.lookup", () -> service.recordByReleaseGroupMbid(releaseGroupMbid)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build()));
    }

    @GetMapping("/listening-records/by-catalog-identity")
    ResponseEntity<NotionClient.ExistingRecord> recordByCatalogIdentity(
            @RequestParam @Pattern(regexp = "MUSICBRAINZ|ITUNES") String source,
            @RequestParam @NotBlank String catalogId) {
        return metrics.observe("records.lookup", () -> service.recordByCatalogIdentity(source, catalogId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build()));
    }

    @GetMapping("/listening-records/form-options")
    FormOptions formOptions() {
        return metrics.observe("records.formOptions", () -> new FormOptions(service.sentimentOptions()));
    }

    @PostMapping("/listening-records")
    ConnectedMusicService.SaveResult save(@Valid @RequestBody SaveRequest request) {
        return metrics.observe("records.save", () -> service.save(new ConnectedMusicService.RecordInput(
                request.releaseGroupMbid(), request.releaseMbid(), request.albumTitle(), request.artist(), request.coverUrl(),
                request.sentiment(), request.favouriteTrack(), request.owned(), request.artistCredits(),
                request.youtubeRecordingMbid(), request.youtubeVideoId(), request.youtubeVideoTitle(), request.youtubeChannelTitle(),
                request.catalogSource(), request.catalogId(), request.favouriteRecordingMbid())));
    }

    @DeleteMapping("/listening-records/{pageId}")
    ConnectedMusicService.SaveResult archive(@PathVariable @NotBlank String pageId) {
        return metrics.observe("records.archive", () -> service.remove(pageId));
    }

    @PostMapping("/listening-records/{pageId}/restore")
    ConnectedMusicService.SaveResult restore(@PathVariable @NotBlank String pageId) {
        return metrics.observe("records.restore", () -> service.restore(pageId));
    }

    @GetMapping("/taste-profile")
    ConnectedMusicService.TasteProfile tasteProfile() {
        return metrics.observe("taste.profile", service::tasteProfile);
    }

    @GetMapping("/recommendations/discover")
    PublicDiscovery discover() {
        return metrics.observe("recommendations.discover", () -> {
            ConnectedMusicService.Discovery discovery = service.publicDiscovery();
            return new PublicDiscovery(
                    discovery.seedArtist(),
                    discovery.albums().stream().map(ConnectedMusicApiController::publicRecommendation).toList(),
                    discovery.retrievalMethod());
        });
    }

    @GetMapping("/graphrag/taste")
    PublicGraphRagTaste graphRagTaste() {
        return metrics.observe("graphrag.taste", () -> {
            ConnectedMusicService.GraphTaste graphTaste = service.graphTaste();
            return publicGraphTaste(graphTaste);
        });
    }

    @GetMapping("/personal-insights")
    PublicPersonalInsights personalInsights() {
        return metrics.observe("personal.insights", () -> {
            ConnectedMusicService.PersonalInsights insights = service.personalInsights();
            return new PublicPersonalInsights(insights.taste(), publicGraphTaste(insights.graphTaste()), insights.syncState());
        });
    }

    @PostMapping("/personal-insights/explanation")
    ConnectedMusicService.GraphRagExplanation explainPersonalTaste() {
        return metrics.observe("personal.insights.explanation", service::explainPersonalTaste);
    }

    @GetMapping("/personal-sync")
    PersonalGraphSyncService.SyncState personalGraphSyncState() {
        return metrics.observe("personal.sync.status", service::personalGraphSyncState);
    }

    @PostMapping("/personal-sync")
    PersonalGraphSyncService.SyncState refreshPersonalGraph() {
        return metrics.observe("personal.sync.refresh", service::refreshPersonalGraph);
    }

    @PostMapping("/personal-sync/reconcile")
    PersonalGraphSyncService.SyncState reconcilePersonalGraph() {
        return metrics.observe("personal.sync.reconcile", service::reconcilePersonalGraph);
    }

    @GetMapping("/operations")
    List<ConnectedOperationMetrics.OperationMetric> operations() {
        return metrics.snapshot();
    }

    record SaveRequest(String releaseGroupMbid, String releaseMbid, @NotBlank String albumTitle, @NotBlank String artist,
                       String coverUrl, @NotBlank String sentiment, @NotBlank String favouriteTrack, boolean owned,
                       List<String> artistCredits, String youtubeRecordingMbid, String youtubeVideoId,
                       String youtubeVideoTitle, String youtubeChannelTitle, String catalogSource, String catalogId,
                       String favouriteRecordingMbid) {
        SaveRequest {
            artistCredits = artistCredits == null || artistCredits.isEmpty() ? List.of(artist) : List.copyOf(artistCredits);
        }

        @AssertTrue
        boolean hasValidCatalogIdentity() {
            String source = catalogSource == null || catalogSource.isBlank() ? "MUSICBRAINZ" : catalogSource;
            return switch (source) {
                case "MUSICBRAINZ" -> releaseGroupMbid != null && !releaseGroupMbid.isBlank()
                        && releaseMbid != null && !releaseMbid.isBlank()
                        && (catalogId == null || catalogId.isBlank() || catalogId.equals(releaseGroupMbid));
                case "ITUNES" -> (releaseGroupMbid == null || releaseGroupMbid.isBlank())
                        && (releaseMbid == null || releaseMbid.isBlank())
                        && catalogId != null && catalogId.matches("[0-9]+");
                default -> false;
            };
        }
    }

    record FormOptions(List<String> sentiments) {}

    record Health(String status, String mode) {}

    private static String catalogTag(String genre) {
        return switch (genre) {
            case "dream-pop" -> "dream pop";
            case "indie-rock" -> "indie rock";
            case "folk" -> "folk";
            case "electronic" -> "electronic";
            default -> throw new IllegalArgumentException("Unsupported public catalog genre");
        };
    }

    private static PublicGraphRagTaste publicGraphTaste(ConnectedMusicService.GraphTaste graphTaste) {
        return new PublicGraphRagTaste(
                graphTaste.retrievalMethod(),
                false,
                graphTaste.personalRecordCount(),
                graphTaste.seedArtist(),
                graphTaste.relisten().stream().map(recommendation -> new PublicRelistenRecommendation(
                        recommendation.title(), recommendation.artist(), recommendation.releaseGroupMbid(),
                        recommendation.coverUrl(), recommendation.favouriteTrack(), recommendation.owned(),
                        recommendation.evidenceMethod())).toList(),
                graphTaste.recommendations().stream().map(ConnectedMusicApiController::publicRecommendation).toList());
    }

    private static PublicAlbumRecommendation publicRecommendation(ConnectedMusicService.AlbumRecommendation recommendation) {
        return new PublicAlbumRecommendation(
                recommendation.title(), recommendation.artist(), recommendation.releaseGroupMbid(),
                recommendation.firstReleaseDate(), recommendation.coverUrl(), recommendation.score(),
                recommendation.evidenceMethod(), recommendation.evidencePaths().stream().map(path ->
                        new PublicEvidencePath(path.relation(), path.value())).toList(), recommendation.artistCredits(),
                recommendation.primaryType());
    }

    record PublicPersonalInsights(ConnectedMusicService.TasteProfile taste, PublicGraphRagTaste graphTaste,
                                  PersonalGraphSyncService.SyncState syncState) {}

    record PublicGraphRagTaste(String retrievalMethod, boolean generatedByLlm, long personalRecordCount,
                               String seedArtist, List<PublicRelistenRecommendation> relisten,
                               List<PublicAlbumRecommendation> recommendations) {}

    record PublicDiscovery(String seedArtist, List<PublicAlbumRecommendation> albums, String retrievalMethod) {}

    record PublicRelistenRecommendation(String title, String artist, String releaseGroupMbid, String coverUrl,
                                        String favouriteTrack, boolean owned, String evidenceMethod) {}

    record PublicAlbumRecommendation(String title, String artist, String releaseGroupMbid, String firstReleaseDate,
                                     String coverUrl, long score, String evidenceMethod,
                                     List<PublicEvidencePath> evidencePaths, List<String> artistCredits,
                                     String primaryType) {}

    record PublicEvidencePath(String relation, String value) {}
}
