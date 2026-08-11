package org.musickg.backend.connected;

import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

public final class ConnectedMusicService {
    private final MusicCatalogGateway catalog;
    private final PersonalMusicRecordGateway records;
    private final PersonalGraphProjectionGateway graph;

    public ConnectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records) {
        this(catalog, records, new InMemoryPersonalGraphProjectionGateway());
    }

    public ConnectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records,
                                 PersonalGraphProjectionGateway graph) {
        this.catalog = catalog;
        this.records = records;
        this.graph = graph;
    }

    public List<MusicCatalogGateway.Album> search(String albumTitle, String artist) {
        return catalog.search(albumTitle, artist);
    }

    public List<MusicCatalogGateway.Album> search(String query) {
        return catalog.search(query);
    }

    public synchronized SaveResult save(RecordInput input) {
        NotionClient.Record record = new NotionClient.Record(
                input.albumTitle(), input.artist(), input.coverUrl(), input.sentiment(), input.favouriteTrack(), input.owned(),
                input.releaseGroupMbid(), input.artistCredits());
        return records.list().stream()
                .filter(existing -> sameAlbum(existing, input))
                .findFirst()
                .map(existing -> saved(records.update(existing.pageId(), record), SaveOperation.UPDATED))
                .orElseGet(() -> saved(records.create(record), SaveOperation.CREATED));
    }

    public synchronized SaveResult remove(String pageId) {
        return saved(records.archive(pageId), SaveOperation.ARCHIVED);
    }

    public List<NotionClient.ExistingRecord> records() {
        return records.list();
    }

    public List<String> sentimentOptions() {
        return records.sentimentOptions();
    }

    public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid) {
        return catalog.tracks(releaseGroupMbid);
    }

    public TasteProfile tasteProfile() {
        return tasteProfile(records.list());
    }

    public Discovery discover() {
        List<NotionClient.ExistingRecord> history = records.list();
        return discover(tasteProfile(history), history);
    }

    public GraphTaste graphTaste() {
        return personalInsights().graphTaste();
    }

    public PersonalInsights personalInsights() {
        List<NotionClient.ExistingRecord> history = records.list();
        TasteProfile profile = tasteProfile(history);
        Discovery discovery = discover(profile, history);
        GraphTaste graphTaste = new GraphTaste(
                profile.recordCount(), discovery.seedArtist(), discovery.evidencePageIds(), discovery.retrievalMethod(),
                relisten(discovery.seedArtist(), history), discovery.albums());
        return new PersonalInsights(profile, graphTaste);
    }

    private static List<RelistenRecommendation> relisten(String seedArtist, List<NotionClient.ExistingRecord> history) {
        return history.stream()
                .filter(record -> record.artist().equalsIgnoreCase(seedArtist))
                .sorted(Comparator.comparing(NotionClient.ExistingRecord::lastEditedAt).reversed()
                        .thenComparing(Comparator.comparing(NotionClient.ExistingRecord::owned).reversed())
                        .thenComparing(NotionClient.ExistingRecord::pageId))
                .limit(5)
                .map(record -> new RelistenRecommendation(
                        record.pageId(), record.releaseGroupMbid(), record.albumTitle(), record.artist(), record.coverUrl(),
                        record.favouriteTrack(), record.owned(), "PERSONAL_RECORD_RELISTEN"))
                .toList();
    }

    private static TasteProfile tasteProfile(List<NotionClient.ExistingRecord> history) {
        if (history.isEmpty()) throw new InsufficientHistoryException();
        return new TasteProfile(
                history.size(),
                counts(history, NotionClient.ExistingRecord::artist),
                counts(history, NotionClient.ExistingRecord::sentiment),
                counts(history.stream().filter(record -> !record.favouriteTrack().isBlank()).toList(), NotionClient.ExistingRecord::favouriteTrack));
    }

    private Discovery discover(TasteProfile profile, List<NotionClient.ExistingRecord> history) {
        List<PersonalGraphProjectionGateway.ArtistEvidence> artists = graph.projectAndRetrieve(history);
        String seedArtist = artists.getFirst().artist();
        Set<String> existingReleaseGroups = history.stream()
                .map(NotionClient.ExistingRecord::releaseGroupMbid)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> emittedReleaseGroups = new LinkedHashSet<>();
        List<AlbumRecommendation> albums = new java.util.ArrayList<>();
        for (TagEvidence tag : tagEvidence(history)) {
            for (MusicCatalogGateway.Album candidate : catalog.searchByTag(tag.tag())) {
                if (existingReleaseGroups.contains(candidate.releaseGroupMbid())
                        || history.stream().anyMatch(record -> sameAlbum(record, candidate))
                        || !emittedReleaseGroups.add(candidate.releaseGroupMbid())) continue;
                albums.add(new AlbumRecommendation(candidate.releaseGroupMbid(), candidate.title(), candidate.artist(),
                        candidate.firstReleaseDate(), candidate.coverUrl(), graph.retrievalMethod(), tag.weight(),
                        List.of(new EvidencePath(tag.pageId(), "SHARES_MUSICBRAINZ_TAG", tag.tag()))));
                break;
            }
            if (albums.size() == 5) break;
        }
        for (PersonalGraphProjectionGateway.ArtistEvidence artist : artists) {
            for (MusicCatalogGateway.Album candidate : catalog.searchByArtist(artist.artist())) {
                if (existingReleaseGroups.contains(candidate.releaseGroupMbid())
                        || history.stream().anyMatch(record -> sameAlbum(record, candidate))
                        || !emittedReleaseGroups.add(candidate.releaseGroupMbid())) continue;
                albums.add(new AlbumRecommendation(candidate.releaseGroupMbid(), candidate.title(), candidate.artist(),
                        candidate.firstReleaseDate(), candidate.coverUrl(), graph.retrievalMethod(), artist.score(),
                        artist.pageIds().stream().map(pageId -> new EvidencePath(pageId, "RECORDED_BY", artist.artist())).toList()));
                break;
            }
            if (albums.size() == 5) break;
        }
        List<String> evidencePageIds = artists.stream().flatMap(artist -> artist.pageIds().stream()).sorted().toList();
        return new Discovery(seedArtist, evidencePageIds, List.copyOf(albums), graph.retrievalMethod());
    }

    private List<TagEvidence> tagEvidence(List<NotionClient.ExistingRecord> history) {
        return history.stream()
                .filter(record -> !record.releaseGroupMbid().isBlank())
                .sorted(Comparator.comparing(NotionClient.ExistingRecord::lastEditedAt).reversed())
                .limit(2)
                .flatMap(record -> catalog.tags(record.releaseGroupMbid()).stream()
                        .map(tag -> new TagEvidence(record.pageId(), tag, evidenceWeight(record))))
                .sorted(Comparator.comparing(TagEvidence::weight).reversed().thenComparing(TagEvidence::tag))
                .limit(2)
                .toList();
    }

    private static long evidenceWeight(NotionClient.ExistingRecord record) {
        return 1L + (record.owned() ? 2L : 0L)
                + (record.favouriteTrack().isBlank() ? 0L : 1L)
                + (record.sentiment().isBlank() ? 0L : 1L);
    }

    private static SaveResult saved(NotionClient.SavedRecord saved, SaveOperation operation) {
        return new SaveResult(saved.pageId(), saved.lastEditedAt().toString(), operation);
    }

    private static List<Count> counts(List<NotionClient.ExistingRecord> records,
                                      Function<NotionClient.ExistingRecord, String> field) {
        Map<String, Long> frequencies = records.stream()
                .map(field)
                .filter(value -> !value.isBlank())
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        return frequencies.entrySet().stream()
                .map(entry -> new Count(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(Count::count).reversed().thenComparing(Count::value))
                .toList();
    }

    private static boolean sameAlbum(NotionClient.ExistingRecord record, RecordInput input) {
        if (!record.releaseGroupMbid().isBlank()) {
            return record.releaseGroupMbid().equals(input.releaseGroupMbid());
        }
        return normalized(record.albumTitle()).equals(normalized(input.albumTitle()))
                && normalized(record.artist()).equals(normalized(input.artist()));
    }

    private static boolean sameAlbum(NotionClient.ExistingRecord record, MusicCatalogGateway.Album candidate) {
        if (!record.releaseGroupMbid().isBlank()) {
            return record.releaseGroupMbid().equals(candidate.releaseGroupMbid());
        }
        return normalized(record.albumTitle()).equals(normalized(candidate.title()))
                && normalized(record.artist()).equals(normalized(candidate.artist()));
    }

    private static String normalized(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    public enum SaveOperation { CREATED, UPDATED, ARCHIVED }

    public record RecordInput(String releaseGroupMbid, String albumTitle, String artist, String coverUrl,
                              String sentiment, String favouriteTrack, boolean owned, List<String> artistCredits) {
        public RecordInput(String releaseGroupMbid, String albumTitle, String artist, String coverUrl,
                           String sentiment, String favouriteTrack, boolean owned) {
            this(releaseGroupMbid, albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, List.of(artist));
        }

        public RecordInput {
            artistCredits = artistCredits == null || artistCredits.isEmpty() ? List.of(artist) : List.copyOf(artistCredits);
        }
    }

    public record SaveResult(String notionPageId, String notionLastEditedAt, SaveOperation operation) {}

    public record Count(String value, long count) {}

    public record TasteProfile(long recordCount, List<Count> artists, List<Count> sentiments, List<Count> favouriteTracks) {}

    public record EvidencePath(String recordPageId, String relation, String value) {}

    public record AlbumRecommendation(String releaseGroupMbid, String title, String artist, String firstReleaseDate,
                                      String coverUrl, String evidenceMethod, long score,
                                      List<EvidencePath> evidencePaths) {
        public AlbumRecommendation(String releaseGroupMbid, String title, String artist, String firstReleaseDate,
                                   String coverUrl, String evidenceMethod) {
            this(releaseGroupMbid, title, artist, firstReleaseDate, coverUrl, evidenceMethod, 0, List.of());
        }

        public AlbumRecommendation {
            evidencePaths = List.copyOf(evidencePaths);
        }
    }

    public record Discovery(String seedArtist, List<String> evidencePageIds, List<AlbumRecommendation> albums,
                            String retrievalMethod) {
        public Discovery(String seedArtist, List<String> evidencePageIds, List<AlbumRecommendation> albums) {
            this(seedArtist, evidencePageIds, albums, "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL");
        }
    }

    public record RelistenRecommendation(String evidencePageId, String releaseGroupMbid, String title, String artist,
                                         String coverUrl, String favouriteTrack, boolean owned, String evidenceMethod) {}

    public record GraphTaste(long personalRecordCount, String seedArtist, List<String> evidencePageIds, String retrievalMethod,
                             List<RelistenRecommendation> relisten, List<AlbumRecommendation> recommendations) {
        public GraphTaste(long personalRecordCount, String seedArtist, List<String> evidencePageIds,
                          List<AlbumRecommendation> recommendations) {
            this(personalRecordCount, seedArtist, evidencePageIds, "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", List.of(), recommendations);
        }
    }

    private record TagEvidence(String pageId, String tag, long weight) {}

    public record PersonalInsights(TasteProfile taste, GraphTaste graphTaste) {}

    public static final class InsufficientHistoryException extends RuntimeException {}
}
