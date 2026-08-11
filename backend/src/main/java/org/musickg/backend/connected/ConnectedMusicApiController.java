package org.musickg.backend.connected;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
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

    ConnectedMusicApiController(ConnectedMusicService service) {
        this.service = service;
    }

    @GetMapping("/health")
    Health health() {
        return new Health("ok", "connected");
    }

    @GetMapping("/catalog/albums")
    List<MusicCatalogGateway.Album> albums(@RequestParam @NotBlank String q) {
        return service.search(q);
    }

    @GetMapping("/catalog/albums/{releaseGroupMbid}/tracks")
    List<MusicCatalogGateway.Track> tracks(@PathVariable @NotBlank String releaseGroupMbid) {
        return service.tracks(releaseGroupMbid);
    }

    @GetMapping("/listening-records")
    List<NotionClient.ExistingRecord> records() {
        return service.records();
    }

    @GetMapping("/listening-records/form-options")
    FormOptions formOptions() {
        return new FormOptions(service.sentimentOptions());
    }

    @PostMapping("/listening-records")
    ConnectedMusicService.SaveResult save(@Valid @RequestBody SaveRequest request) {
        return service.save(new ConnectedMusicService.RecordInput(
                request.releaseGroupMbid(), request.albumTitle(), request.artist(), request.coverUrl(),
                request.sentiment(), request.favouriteTrack(), request.owned(), request.artistCredits()));
    }

    @DeleteMapping("/listening-records/{pageId}")
    ConnectedMusicService.SaveResult archive(@PathVariable @NotBlank String pageId) {
        return service.remove(pageId);
    }

    @GetMapping("/taste-profile")
    ConnectedMusicService.TasteProfile tasteProfile() {
        return service.tasteProfile();
    }

    @GetMapping("/recommendations/discover")
    ConnectedMusicService.Discovery discover() {
        return service.discover();
    }

    @GetMapping("/graphrag/taste")
    GraphRagTaste graphRagTaste() {
        ConnectedMusicService.GraphTaste graphTaste = service.graphTaste();
        return new GraphRagTaste(
                graphTaste.retrievalMethod(),
                false,
                graphTaste.personalRecordCount(),
                graphTaste.seedArtist(),
                graphTaste.evidencePageIds(),
                graphTaste.recommendations());
    }

    @GetMapping("/personal-insights")
    ConnectedMusicService.PersonalInsights personalInsights() {
        return service.personalInsights();
    }

    record SaveRequest(@NotBlank String releaseGroupMbid, @NotBlank String albumTitle, @NotBlank String artist,
                       String coverUrl, @NotBlank String sentiment, @NotBlank String favouriteTrack, boolean owned,
                       List<String> artistCredits) {
        SaveRequest {
            artistCredits = artistCredits == null || artistCredits.isEmpty() ? List.of(artist) : List.copyOf(artistCredits);
        }
    }

    record FormOptions(List<String> sentiments) {}

    record Health(String status, String mode) {}

    record GraphRagTaste(String retrievalMethod, boolean generatedByLlm, long personalRecordCount,
                         String seedArtist, List<String> evidencePageIds,
                         List<ConnectedMusicService.AlbumRecommendation> recommendations) {}
}
