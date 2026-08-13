package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MusicBrainzClientTest {
    @Test
    void rejectsAnOverloadedLocalRateLimitQueueInsteadOfBlockingTheRequestThread() throws Exception {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
        Field nextRequestAtNanos = MusicBrainzClient.class.getDeclaredField("nextRequestAtNanos");
        nextRequestAtNanos.setAccessible(true);
        nextRequestAtNanos.setLong(client, System.nanoTime() + 10_000_000_000L);

        assertThatThrownBy(() -> client.search("Overloaded"))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RATE_LIMITED");
    }

    @Test
    void omitsCoverUrlWhenMusicBrainzDoesNotConfirmFrontArtwork() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22No+Front+Art%22+OR+artist%3A%22No+Front+Art%22&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[{"id":"f9b61a7e-0c86-4cc7-b94e-48d3b643c554","title":"No Front Art","primary-type":"Album","artist-credit":[{"name":"Artist"}],"cover-art-archive":{"artwork":false,"front":false}}]}
                        """, MediaType.APPLICATION_JSON));

        var albums = client.search("No Front Art");

        assertThat(albums).containsExactly(new MusicCatalogGateway.Album("f9b61a7e-0c86-4cc7-b94e-48d3b643c554", "No Front Art", "Artist", "", ""));
        server.verify();
    }

    @Test
    void mapsMalformedMusicBrainzPayloadsToTheTypedCatalogBoundary() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22Malformed%22+OR+artist%3A%22Malformed%22&fmt=json&limit=10"))
                .andRespond(withSuccess("not-json", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.search("Malformed"))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
        server.verify();
    }

    @Test
    void searchesRealReleaseGroupsWithConfiguredContactableUserAgent() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=artist%3A%22Miles+Davis%22+AND+releasegroup%3A%22Kind+of+Blue%22&fmt=json&limit=10"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("User-Agent", "music-kg/1.0 (https://example.test)"))
                .andRespond(withSuccess("""
                        {"release-groups":[{"id":"f9b61a7e-0c86-4cc7-b94e-48d3b643c554","title":"Kind of Blue","first-release-date":"1959-08-17","primary-type":"Album","artist-credit":[{"name":"Miles Davis"}],"cover-art-archive":{"artwork":true,"front":true}}]}
                        """, MediaType.APPLICATION_JSON));

        var albums = client.search("Kind of Blue", "Miles Davis");

        assertThat(albums).containsExactly(new MusicCatalogGateway.Album("f9b61a7e-0c86-4cc7-b94e-48d3b643c554", "Kind of Blue", "Miles Davis", "1959-08-17", "https:" + "//coverartarchive.org/release-group/f9b61a7e-0c86-4cc7-b94e-48d3b643c554/front-250"));
        server.verify();
    }

    @Test
    void returnsOnlyAlbumAndEpReleaseGroupsForThePersonalArchive() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22Archive%22+OR+artist%3A%22Archive%22&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[
                          {"id":"album-id","title":"Album","primary-type":"Album","artist-credit":[{"name":"Artist"}]},
                          {"id":"ep-id","title":"EP","primary-type":"EP","artist-credit":[{"name":"Artist"}]},
                          {"id":"single-id","title":"Single","primary-type":"Single","artist-credit":[{"name":"Artist"}]},
                          {"id":"live-id","title":"Live","primary-type":"Live","artist-credit":[{"name":"Artist"}]}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.search("Archive")).extracting(MusicCatalogGateway.Album::releaseGroupMbid)
                .containsExactly("album-id", "ep-id");
        server.verify();
    }

    @Test
    void returnsOnlyRecordingsFromTheRequestedReleaseGroup() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group/release-group-id?inc=releases&fmt=json"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"releases":[{"id":"release-id"}]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release/release-id?inc=recordings%2Bmedia&fmt=json"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"media":[{"tracks":[{"position":1,"recording":{"id":"recording-1","title":"Actual Track"}}]}]}
                        """, MediaType.APPLICATION_JSON));

        var tracks = client.tracks("release-group-id");

        assertThat(tracks).containsExactly(new MusicCatalogGateway.Track("recording-1", "Actual Track", 1));
        server.verify();
    }

    @Test
    void fallsBackToRecordingSearchWhenTheReleaseGroupLookupIsRejected() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group/release-group-id?inc=releases&fmt=json"))
                .andRespond(withBadRequest());
        server.expect(requestTo("https://musicbrainz.org/ws/2/recording?query=rgid%3Arelease-group-id&fmt=json&limit=100"))
                .andRespond(withSuccess("""
                        {"recordings":[{"id":"recording-2","title":"Recovered Track"},{"id":"recording-3","title":"Second Track"}]}
                        """, MediaType.APPLICATION_JSON));

        var tracks = client.tracks("release-group-id");

        assertThat(tracks).containsExactly(
                new MusicCatalogGateway.Track("recording-2", "Recovered Track", 1),
                new MusicCatalogGateway.Track("recording-3", "Second Track", 2));
        server.verify();
    }

    @Test
    void readsMusicBrainzGenreTagsFromTheRecordedReleaseGroupBeforeSearchingByTag() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group/release-group-id?inc=tags+genres&fmt=json"))
                .andRespond(withSuccess("""
                        {"genres":[{"name":"dream pop"}],"tags":[{"name":"shoegaze"},{"name":"dream pop"}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.tags("release-group-id")).containsExactly("dream pop", "shoegaze");
        server.verify();
    }
}
