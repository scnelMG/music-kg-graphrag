package org.musickg.backend.connected;

import java.time.Duration;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.musickg.backend.catalog.MusicBrainzClient;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

public final class ConnectedMusicService {
    private final MusicCatalogGateway catalog;
    private final PersonalMusicRecordGateway records;
    private final PersonalGraphProjectionGateway graph;
    private final PersonalGraphSyncService sync;
    private final GroundedExplanationGenerator explanationGenerator;
    private final Map<String, String> recentlySavedPageIds = new HashMap<>();
    private volatile CachedInsights cachedInsights;

    public ConnectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records) {
        this(catalog, records, new InMemoryPersonalGraphProjectionGateway());
    }

    public ConnectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records,
                                 PersonalGraphProjectionGateway graph) {
        this(catalog, records, graph, Clock.systemUTC());
    }

    ConnectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records,
                          PersonalGraphProjectionGateway graph, Clock clock) {
        this(catalog, records, graph, clock, GroundedExplanationGenerator.disabled());
    }

    ConnectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records,
                          PersonalGraphProjectionGateway graph, Clock clock,
                          GroundedExplanationGenerator explanationGenerator) {
        this.catalog = catalog;
        this.records = records;
        this.graph = graph;
        this.sync = new PersonalGraphSyncService(records, graph, clock);
        this.explanationGenerator = explanationGenerator;
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
        String identity = recordIdentity(input);
        String recentlySavedPageId = recentlySavedPageIds.get(identity);
        if (recentlySavedPageId != null) {
            return savedAndSynchronize(records.update(recentlySavedPageId, record), SaveOperation.UPDATED, record);
        }
        if (!input.releaseGroupMbid().isBlank()) {
            NotionClient.ExistingRecord matchedByMbid = records.findByReleaseGroupMbid(input.releaseGroupMbid()).orElse(null);
            if (matchedByMbid != null) {
                recentlySavedPageIds.put(identity, matchedByMbid.pageId());
                return savedAndSynchronize(records.update(matchedByMbid.pageId(), record), SaveOperation.UPDATED, record);
            }
        }
        NotionClient.ExistingRecord existing = records.list().stream()
                .filter(value -> sameAlbum(value, input))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            recentlySavedPageIds.put(identity, existing.pageId());
            return savedAndSynchronize(records.update(existing.pageId(), record), SaveOperation.UPDATED, record);
        }
        NotionClient.SavedRecord created = records.create(record);
        recentlySavedPageIds.put(identity, created.pageId());
        return savedAndSynchronize(created, SaveOperation.CREATED, record);
    }

    public synchronized SaveResult remove(String pageId) {
        NotionClient.SavedRecord archived = records.archive(pageId);
        recentlySavedPageIds.entrySet().removeIf(entry -> entry.getValue().equals(pageId));
        sync.removeRecord(pageId);
        return savedAndInvalidate(archived, SaveOperation.ARCHIVED);
    }

    public synchronized SaveResult restore(String pageId) {
        NotionClient.SavedRecord restored = records.restore(pageId);
        records.list().stream().filter(record -> record.pageId().equals(pageId)).findFirst().ifPresent(sync::synchronizeRecord);
        return savedAndInvalidate(restored, SaveOperation.RESTORED);
    }

    public List<NotionClient.ExistingRecord> records() {
        return records.list();
    }

    public NotionClient.RecordPage recordsPage(int pageSize, String cursor) {
        return records.listPage(pageSize, cursor);
    }

    public List<String> sentimentOptions() {
        return records.sentimentOptions();
    }

    public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid) {
        return catalog.tracks(releaseGroupMbid);
    }

    public TasteProfile tasteProfile() {
        return tasteProfile(synchronizedHistory());
    }

    public Discovery discover() {
        List<NotionClient.ExistingRecord> history = synchronizedHistory();
        return discover(tasteProfile(history), history);
    }

    public GraphTaste graphTaste() {
        return personalInsights().graphTaste();
    }

    public PersonalGraphSyncService.SyncState personalGraphSyncState() {
        return sync.lastState();
    }

    public PersonalGraphSyncService.SyncState refreshPersonalGraph() {
        PersonalGraphSyncService.SyncState state = sync.synchronize();
        cachedInsights = null;
        return state;
    }

    public PersonalGraphSyncService.SyncState reconcilePersonalGraph() {
        PersonalGraphSyncService.SyncState state = sync.reconcile();
        cachedInsights = null;
        return state;
    }

    public ServiceReadiness readiness() {
        List<DependencyReadiness> components = List.of(
                probe("notion", records::verifyReadiness),
                probe("musicbrainz", catalog::verifyReadiness),
                probe("graphdb", graph::verifyReadiness));
        return new ServiceReadiness(components.stream().allMatch(DependencyReadiness::ready), components);
    }

    public PersonalInsights personalInsights() {
        return currentInsights().insights();
    }

    public GraphRagExplanation explainPersonalTaste() {
        CachedInsights insights = currentInsights();
        try {
            GroundedExplanationGenerator.Generated generated = explanationGenerator.generate(insights.explanationContext());
            List<ExplanationCitation> citations = generated.evidenceLabels().stream()
                    .map(label -> insights.explanationContext().evidence().stream()
                            .filter(evidence -> evidence.label().equals(label)).findFirst().orElseThrow())
                    .map(evidence -> new ExplanationCitation(evidence.label(), evidence.albumTitle(), evidence.artist(), evidence.relation()))
                    .toList();
            return new GraphRagExplanation(ExplanationStatus.GENERATED, generated.answer(), citations);
        } catch (GroundedExplanationGenerator.GenerationException exception) {
            ExplanationStatus status = "LLM_DISABLED".equals(exception.getMessage())
                    ? ExplanationStatus.DISABLED : ExplanationStatus.UNAVAILABLE;
            return new GraphRagExplanation(status, "", List.of());
        }
    }

    private CachedInsights currentInsights() {
        CachedInsights cached = cachedInsights;
        if (cached != null && !cached.expired()) return cached;
        synchronized (this) {
            cached = cachedInsights;
            if (cached != null && !cached.expired()) return cached;
            List<NotionClient.ExistingRecord> history = synchronizedHistory();
            TasteProfile profile = tasteProfile(history);
            Discovery discovery = discover(profile, history);
            GraphTaste graphTaste = new GraphTaste(
                    profile.recordCount(), discovery.seedArtist(), discovery.evidencePageIds(), discovery.retrievalMethod(),
                    relisten(discovery.seedArtist(), history), discovery.albums());
            PersonalInsights insights = new PersonalInsights(profile, graphTaste, sync.lastState());
            cachedInsights = new CachedInsights(insights, explanationContext(history, discovery),
                    System.nanoTime() + Duration.ofSeconds(30).toNanos());
            return cachedInsights;
        }
    }

    private static GroundedExplanationGenerator.Context explanationContext(List<NotionClient.ExistingRecord> history,
                                                                             Discovery discovery) {
        Set<String> evidencePageIds = Set.copyOf(discovery.evidencePageIds());
        List<NotionClient.ExistingRecord> evidenceRecords = history.stream()
                .filter(record -> evidencePageIds.contains(record.pageId()))
                .sorted(Comparator.comparing(NotionClient.ExistingRecord::lastEditedAt).reversed())
                .limit(3)
                .toList();
        List<GroundedExplanationGenerator.Evidence> evidence = new java.util.ArrayList<>();
        for (NotionClient.ExistingRecord record : evidenceRecords) {
            evidence.add(new GroundedExplanationGenerator.Evidence("E" + (evidence.size() + 1), record.albumTitle(),
                    record.artist(), "RECORDED_BY", recordDetail(record)));
        }
        for (AlbumRecommendation recommendation : discovery.albums().stream().limit(2).toList()) {
            String relation = recommendation.evidencePaths().isEmpty() ? "GRAPH_RETRIEVED"
                    : recommendation.evidencePaths().getFirst().relation();
            evidence.add(new GroundedExplanationGenerator.Evidence("E" + (evidence.size() + 1), recommendation.title(),
                    recommendation.artist(), relation, "MusicBrainz 후보 · 그래프 근거 점수 " + recommendation.score()));
        }
        return new GroundedExplanationGenerator.Context("내 기록과 추천의 연결을 설명해 주세요.", evidence);
    }

    private static String recordDetail(NotionClient.ExistingRecord record) {
        List<String> values = new java.util.ArrayList<>();
        if (!record.sentiment().isBlank()) values.add("감상: " + record.sentiment());
        if (!record.favouriteTrack().isBlank()) values.add("최애곡: " + record.favouriteTrack());
        if (record.owned()) values.add("보유 기록");
        return String.join(" · ", values.isEmpty() ? List.of("개인 기록") : values);
    }

    private static List<RelistenRecommendation> relisten(String seedArtist, List<NotionClient.ExistingRecord> history) {
        return history.stream()
                .filter(PersonalTasteWeights::supportsRecommendation)
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
        List<PersonalGraphProjectionGateway.ArtistEvidence> artists = graph.retrieveEvidence();
        if (artists.isEmpty()) {
            return new Discovery("긍정적인 감상", List.of(), List.of(), graph.retrievalMethod());
        }
        String seedArtist = artists.getFirst().artist();
        Set<String> existingReleaseGroups = history.stream()
                .map(NotionClient.ExistingRecord::releaseGroupMbid)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, RecommendationCandidate> candidates = new HashMap<>();
        for (TagEvidence tag : tagEvidence(history)) {
            for (MusicCatalogGateway.Album candidate : catalog.searchByTag(tag.tag())) {
                if (existingReleaseGroups.contains(candidate.releaseGroupMbid())
                        || history.stream().anyMatch(record -> sameAlbum(record, candidate))) continue;
                candidates.computeIfAbsent(candidate.releaseGroupMbid(), ignored -> new RecommendationCandidate(candidate))
                        .add(tag.weight(), new EvidencePath(tag.pageId(), "SHARES_MUSICBRAINZ_TAG", tag.tag()));
            }
        }
        for (PersonalGraphProjectionGateway.ArtistEvidence artist : artists) {
            for (MusicCatalogGateway.Album candidate : catalog.searchByArtist(artist.artist())) {
                if (existingReleaseGroups.contains(candidate.releaseGroupMbid())
                        || history.stream().anyMatch(record -> sameAlbum(record, candidate))) continue;
                RecommendationCandidate recommendation = candidates.computeIfAbsent(candidate.releaseGroupMbid(),
                        ignored -> new RecommendationCandidate(candidate));
                boolean firstPath = true;
                for (String pageId : artist.pageIds()) {
                    recommendation.add(firstPath ? artist.score() : 0,
                            new EvidencePath(pageId, "RECORDED_BY", artist.artist()));
                    firstPath = false;
                }
            }
        }
        List<String> evidencePageIds = artists.stream().flatMap(artist -> artist.pageIds().stream()).sorted().toList();
        List<AlbumRecommendation> ranked = candidates.values().stream()
                .map(candidate -> candidate.toRecommendation(graph.retrievalMethod()))
                .sorted(Comparator.comparing(AlbumRecommendation::score).reversed()
                        .thenComparing(AlbumRecommendation::title)
                        .thenComparing(AlbumRecommendation::releaseGroupMbid))
                .toList();
        List<AlbumRecommendation> albums = diverseAlbums(ranked);
        return new Discovery(seedArtist, evidencePageIds, albums, graph.retrievalMethod());
    }

    private static List<AlbumRecommendation> diverseAlbums(List<AlbumRecommendation> ranked) {
        Set<String> representedArtists = new LinkedHashSet<>();
        List<AlbumRecommendation> albums = new ArrayList<>();
        for (AlbumRecommendation recommendation : ranked) {
            String artistKey = recommendation.artist().trim().toLowerCase(Locale.ROOT);
            if (artistKey.isBlank() || !representedArtists.add(artistKey)) continue;
            albums.add(recommendation);
            if (albums.size() == 5) break;
        }
        return List.copyOf(albums);
    }

    private List<NotionClient.ExistingRecord> synchronizedHistory() {
        sync.synchronize();
        return graph.retrieveRecords();
    }

    private List<TagEvidence> tagEvidence(List<NotionClient.ExistingRecord> history) {
        return history.stream()
                .filter(PersonalTasteWeights::supportsRecommendation)
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
        return PersonalTasteWeights.weight(record);
    }

    private static DependencyReadiness probe(String name, Runnable probe) {
        try {
            probe.run();
            return new DependencyReadiness(name, true, "READY");
        } catch (NotionClient.AccessException exception) {
            return new DependencyReadiness(name, false, exception.getMessage());
        } catch (MusicBrainzClient.CatalogAccessException exception) {
            return new DependencyReadiness(name, false, exception.getMessage());
        } catch (GraphDbPersonalGraphProjectionGateway.GraphAccessException exception) {
            return new DependencyReadiness(name, false, exception.getMessage());
        } catch (RuntimeException exception) {
            return new DependencyReadiness(name, false, "DEPENDENCY_UNAVAILABLE");
        }
    }

    private static SaveResult saved(NotionClient.SavedRecord saved, SaveOperation operation) {
        return new SaveResult(saved.pageId(), saved.lastEditedAt().toString(), operation);
    }

    private SaveResult savedAndInvalidate(NotionClient.SavedRecord saved, SaveOperation operation) {
        cachedInsights = null;
        return saved(saved, operation);
    }

    private SaveResult savedAndSynchronize(NotionClient.SavedRecord saved, SaveOperation operation, NotionClient.Record record) {
        sync.synchronizeRecord(new NotionClient.ExistingRecord(
                saved.pageId(), record.albumTitle(), record.artist(), record.coverUrl(), record.sentiment(),
                record.favouriteTrack(), record.owned(), record.releaseGroupMbid(), record.artistCredits(), saved.lastEditedAt()));
        return savedAndInvalidate(saved, operation);
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

    private static String recordIdentity(RecordInput input) {
        if (!input.releaseGroupMbid().isBlank()) return "release-group:" + input.releaseGroupMbid();
        return "album:" + normalized(input.albumTitle()) + "|artist:" + normalized(input.artist());
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

    public enum SaveOperation { CREATED, UPDATED, ARCHIVED, RESTORED }

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

    private static final class RecommendationCandidate {
        private final MusicCatalogGateway.Album album;
        private final Map<EvidencePath, Long> pathWeights = new HashMap<>();

        private RecommendationCandidate(MusicCatalogGateway.Album album) {
            this.album = album;
        }

        private void add(long weight, EvidencePath path) {
            pathWeights.merge(path, weight, Math::max);
        }

        private AlbumRecommendation toRecommendation(String retrievalMethod) {
            List<EvidencePath> paths = pathWeights.keySet().stream()
                    .sorted(Comparator.comparing(EvidencePath::relation)
                            .thenComparing(EvidencePath::recordPageId)
                            .thenComparing(EvidencePath::value))
                    .toList();
            long score = pathWeights.values().stream().mapToLong(Long::longValue).sum();
            return new AlbumRecommendation(album.releaseGroupMbid(), album.title(), album.artist(), album.firstReleaseDate(),
                    album.coverUrl(), retrievalMethod, score, paths);
        }
    }

    private record CachedInsights(PersonalInsights insights, GroundedExplanationGenerator.Context explanationContext,
                                  long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    public record PersonalInsights(TasteProfile taste, GraphTaste graphTaste, PersonalGraphSyncService.SyncState syncState) {
        public PersonalInsights(TasteProfile taste, GraphTaste graphTaste) {
            this(taste, graphTaste, new PersonalGraphSyncService.SyncState(
                    PersonalGraphSyncService.Status.UNINITIALIZED, null, 0, false));
        }
    }

    public enum ExplanationStatus { GENERATED, DISABLED, UNAVAILABLE }

    public record ExplanationCitation(String label, String recordTitle, String artist, String relation) {}

    public record GraphRagExplanation(ExplanationStatus status, String answer, List<ExplanationCitation> citations) {
        public GraphRagExplanation {
            answer = answer == null ? "" : answer;
            citations = List.copyOf(citations == null ? List.of() : citations);
        }
    }

    public record DependencyReadiness(String name, boolean ready, String code) {}

    public record ServiceReadiness(boolean ready, List<DependencyReadiness> components) {
        public ServiceReadiness {
            components = List.copyOf(components);
        }
    }

    public static final class InsufficientHistoryException extends RuntimeException {}
}
