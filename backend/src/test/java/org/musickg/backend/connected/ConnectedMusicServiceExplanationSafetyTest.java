package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

class ConnectedMusicServiceExplanationSafetyTest {
    @Test
    void returnsAnHonestNoEvidenceExplanationWhenTheGraphHasNoQualifyingPaths() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        PersonalGraphProjectionGateway graph = mock(PersonalGraphProjectionGateway.class);
        NotionClient.ExistingRecord recorded = new NotionClient.ExistingRecord(
                "page", "Recorded album", "Recorded artist", "", "Loved", "Track", false,
                "release-group", "release", List.of("Recorded artist"), Instant.parse("2026-08-15T00:00:00Z"));
        given(records.list()).willReturn(List.of(recorded));
        given(graph.syncSnapshot()).willReturn(new PersonalGraphProjectionGateway.SyncSnapshot(Optional.empty()));
        given(graph.retrieveRecords()).willReturn(List.of(recorded));
        given(graph.retrieveEvidence()).willReturn(List.of());
        given(graph.retrievalMethod()).willReturn("GRAPHDB_PERSONAL_RECORDS");
        ConnectedMusicService service = new ConnectedMusicService(catalog, records, graph,
                java.time.Clock.systemUTC(), GroundedExplanationGenerator.disabled());

        ConnectedMusicService.GraphRagExplanation explanation = service.explainPersonalTaste();

        assertThat(explanation.status()).isEqualTo(ConnectedMusicService.ExplanationStatus.NO_EVIDENCE);
        assertThat(explanation.answer()).isEmpty();
        assertThat(explanation.citations()).isEmpty();
    }
}
