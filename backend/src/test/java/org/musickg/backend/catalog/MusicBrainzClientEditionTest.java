package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MusicBrainzClientEditionTest {
    @Test
    void recommendsTheEarliestDatedEditionAndLoadsTracksFromTheChosenRelease() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("""
                        {"release-count":3,"releases":[
                          {"id":"remaster-release","title":"수잔","date":"2025-01-01","country":"KR","status":"Official","disambiguation":"2025 remaster"},
                          {"id":"original-release","title":"수잔","date":"2015-10-27","country":"KR","status":"Official","disambiguation":""},
                          {"id":"undated-release","title":"수잔","date":"","country":"KR","status":"Official","disambiguation":""}
                        ]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release/remaster-release?inc=recordings%2Bmedia&fmt=json"))
                .andRespond(withSuccess("""
                        {"media":[{"tracks":[{"position":1,"recording":{"id":"remaster-track","title":"Actual Remaster Track"}}]}]}
                        """, MediaType.APPLICATION_JSON));

        var editions = client.editions("group-id");
        var tracks = client.tracks("group-id", "remaster-release");

        assertThat(editions).extracting(MusicCatalogGateway.Edition::releaseMbid)
                .containsExactly("original-release", "remaster-release", "undated-release");
        assertThat(editions).extracting(MusicCatalogGateway.Edition::recommended)
                .containsExactly(true, false, false);
        assertThat(tracks).containsExactly(new MusicCatalogGateway.Track("remaster-track", "Actual Remaster Track", 1));
        server.verify();
    }

    @Test
    void rejectsTracksFromAReleaseOutsideTheRequestedReleaseGroupBeforeRequestingIt() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release/foreign-release?inc=release-groups&fmt=json"))
                .andRespond(withSuccess("""
                        {"id":"foreign-release","title":"Other Album","release-group":{"id":"other-group"}}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.tracks("group-id", "foreign-release"))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RELEASE_NOT_IN_GROUP");
        server.verify();
    }

    @Test
    void usesTheRecommendedEditionForDefaultTrackLookup() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("""
                        {"release-count":2,"releases":[
                          {"id":"remaster-release","title":"Album","date":"2025-01-01","status":"Official"},
                          {"id":"original-release","title":"Album","date":"2015-01-01","status":"Official"}
                        ]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release/original-release?inc=recordings%2Bmedia&fmt=json"))
                .andRespond(withSuccess("""
                        {"media":[{"tracks":[{"position":1,"recording":{"id":"original-track","title":"Original Track"}}]}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.tracks("group-id"))
                .containsExactly(new MusicCatalogGateway.Track("original-track", "Original Track", 1));
        server.verify();
    }

    @Test
    void returnsOnlyRecordingsFromTheRequestedReleaseGroup() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=release-group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withSuccess("{" + "\"release-count\":1,\"releases\":[{\"id\":\"release-id\"}]}" , MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release/release-id?inc=recordings%2Bmedia&fmt=json"))
                .andRespond(withSuccess("""
                        {"media":[{"tracks":[{"position":1,"recording":{"id":"recording-1","title":"Actual Track"}}]}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.tracks("release-group-id"))
                .containsExactly(new MusicCatalogGateway.Track("recording-1", "Actual Track", 1));
        server.verify();
    }

    @Test
    void fallsBackToRecordingSearchWhenTheReleaseGroupLookupIsRejected() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = client(builder);
        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=release-group-id&limit=20&offset=0&fmt=json"))
                .andRespond(withBadRequest());
        server.expect(requestTo("https://musicbrainz.org/ws/2/recording?query=rgid%3Arelease-group-id&fmt=json&limit=100"))
                .andRespond(withSuccess("""
                        {"recordings":[{"id":"recording-2","title":"Recovered Track"},{"id":"recording-3","title":"Second Track"}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.tracks("release-group-id")).containsExactly(
                new MusicCatalogGateway.Track("recording-2", "Recovered Track", 1),
                new MusicCatalogGateway.Track("recording-3", "Second Track", 2));
        server.verify();
    }

    private static MusicBrainzClient client(RestClient.Builder builder) {
        return new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz(
                "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
    }
}
