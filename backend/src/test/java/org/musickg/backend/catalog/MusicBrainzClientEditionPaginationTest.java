package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MusicBrainzClientEditionPaginationTest {
    @Test
    void returnsABoundedFirstPageWithATruthfulCursorWithoutFetchingEveryEdition() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        String releases = IntStream.range(0, 20)
                .mapToObj(index -> "{\"id\":\"release-" + index + "\",\"date\":\"2001-01-" + String.format("%02d", index + 1) + "\"}")
                .collect(java.util.stream.Collectors.joining(","));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":245,\"releases\":[" + releases + "]}", MediaType.APPLICATION_JSON));

        MusicCatalogGateway.EditionPage page = client.editions("group-id", null, null);

        assertThat(page.editions()).hasSize(20);
        assertThat(page.editions()).filteredOn(MusicCatalogGateway.Edition::recommended).hasSize(1);
        assertThat(page.nextCursor()).isEqualTo("20");
        assertThat(page.hasMore()).isTrue();
        server.verify();
    }

    @Test
    void returnsOnlyTheRequestedHighCountNextPageAndKeepsRecommendationUnset() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        String releases = IntStream.range(20, 40)
                .mapToObj(index -> "{\"id\":\"release-" + index + "\",\"date\":\"2002-01-01\"}")
                .collect(java.util.stream.Collectors.joining(","));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=20&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":245,\"releases\":[" + releases + "]}", MediaType.APPLICATION_JSON));

        MusicCatalogGateway.EditionPage page = client.editions("group-id", "20", null);

        assertThat(page.editions()).hasSize(20).noneMatch(MusicCatalogGateway.Edition::recommended);
        assertThat(page.nextCursor()).isEqualTo("40");
        assertThat(page.hasMore()).isTrue();
        server.verify();
    }

    @Test
    void includesAStoredEditionOutsideTheFirstPageWithoutScanningIntermediatePages() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":245,\"releases\":[{\"id\":\"release-0\",\"date\":\"2001-01-01\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release/stored-release?inc=release-groups&fmt=json"))
                .andRespond(withSuccess("{\"id\":\"stored-release\",\"title\":\"Stored Edition\",\"date\":\"2020-01-01\",\"release-group\":{\"id\":\"group-id\"}}", MediaType.APPLICATION_JSON));

        MusicCatalogGateway.EditionPage page = client.editions("group-id", null, "stored-release");

        assertThat(page.editions()).extracting(MusicCatalogGateway.Edition::releaseMbid)
                .containsExactly("release-0", "stored-release");
        assertThat(page.editions()).filteredOn(MusicCatalogGateway.Edition::recommended)
                .extracting(MusicCatalogGateway.Edition::releaseMbid).containsExactly("release-0");
        server.verify();
    }

    @Test
    void rejectsAReleasePageWithAMissingReleaseIdentifier() {
        assertContractFailure("{\"release-count\":1,\"releases\":[{}]}");
    }

    @Test
    void rejectsAReleasePageWithABlankReleaseIdentifier() {
        assertContractFailure("{\"release-count\":1,\"releases\":[{\"id\":\" \"}]}");
    }

    @Test
    void rejectsAReleasePageWithAMissingDeclaredReleaseCount() {
        assertContractFailure("{\"releases\":[{\"id\":\"release-id\"}]}");
    }

    @Test
    void rejectsAReleasePageWithANegativeDeclaredReleaseCount() {
        assertContractFailure("{\"release-count\":-1,\"releases\":[{\"id\":\"release-id\"}]}");
    }

    @Test
    void doesNotFallBackToRecordingSearchWhenTheEditionBrowseViolatesItsContract() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":1,\"releases\":[{}]}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.tracks("group-id"))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
        server.verify();
    }

    @Test
    void rejectsAnEmptyBrowsePageBeforeTheDeclaredReleaseCount() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=1&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":2,\"releases\":[]}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.editions("group-id", "1", null))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
        server.verify();
    }

    @Test
    void acceptsAChangedReleaseCountAcrossDistinctBrowseCalls() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":2,\"releases\":[{\"id\":\"release-1\"}]}" , MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=1&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":3,\"releases\":[{\"id\":\"release-2\"}]}" , MediaType.APPLICATION_JSON));

        assertThat(client.editions("group-id", null, null).hasMore()).isTrue();
        MusicCatalogGateway.EditionPage refreshedPage = client.editions("group-id", "1", null);

        assertThat(refreshedPage.editions()).extracting(MusicCatalogGateway.Edition::releaseMbid)
                .containsExactly("release-2");
        assertThat(refreshedPage.nextCursor()).isEqualTo("2");
        assertThat(refreshedPage.hasMore()).isTrue();
        server.verify();
    }

    @Test
    void rejectsDuplicateReleaseIdentifiersWithinAProviderPage() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":2,\"releases\":[{\"id\":\"release-id\"},{\"id\":\"release-id\"}]}" , MediaType.APPLICATION_JSON));

        assertContractFailure(client);
        server.verify();
    }

    @Test
    void cachesAValidatedEditionBrowseResult() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{\"release-count\":1,\"releases\":[{\"id\":\"release-id\"}]}" , MediaType.APPLICATION_JSON));

        assertThat(client.editions("group-id")).hasSize(1);
        assertThat(client.editions("group-id")).hasSize(1);
        server.verify();
    }

    private static void assertContractFailure(String response) {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertContractFailure(client(builder));
        server.verify();
    }

    private static void assertContractFailure(MusicBrainzClient client) {
        assertThatThrownBy(() -> client.editions("group-id"))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
    }

    private static MusicBrainzClient client(RestClient.Builder builder) {
        return new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz(
                "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
    }
}
