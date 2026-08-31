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
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MusicBrainzClientTest {
    @Test
    void boundsDistinctPublicSearchQueriesInTheAlbumCache() throws Exception {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz(
                "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1_000_000, "https://coverartarchive.org"));
        server.expect(ExpectedCount.manyTimes(), request -> { })
                .andRespond(withSuccess("{\"release-groups\":[]}", MediaType.APPLICATION_JSON));

        for (int index = 0; index <= MusicBrainzCache.MAX_ENTRIES; index++) {
            client.search("distinct-query-" + index);
        }

        Field albumCache = MusicBrainzClient.class.getDeclaredField("albumCache");
        albumCache.setAccessible(true);
        assertThat((Map<?, ?>) albumCache.get(client)).hasSizeLessThanOrEqualTo(MusicBrainzCache.MAX_ENTRIES);
        server.verify();
    }

    @Test
    void returnsTheCoverArtArchiveUrlWhenMusicBrainzReportsNoFrontArtwork() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22No+Front+Art%22+OR+artist%3A%22No+Front+Art%22&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[{"id":"f9b61a7e-0c86-4cc7-b94e-48d3b643c554","title":"No Front Art","primary-type":"Album","artist-credit":[{"name":"Artist"}],"cover-art-archive":{"artwork":false,"front":false}}]}
                        """, MediaType.APPLICATION_JSON));

        var albums = client.search("No Front Art");

        assertThat(albums).containsExactly(new MusicCatalogGateway.Album(
                "f9b61a7e-0c86-4cc7-b94e-48d3b643c554",
                "No Front Art",
                "Artist",
                "",
                "https://coverartarchive.org/release-group/f9b61a7e-0c86-4cc7-b94e-48d3b643c554/front-250"));
        server.verify();
    }

    @Test
    void returnsTheCoverArtArchiveUrlWhenSearchOmitsCoverArtworkMetadata() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz(
                "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22Metadata+Omitted%22+OR+artist%3A%22Metadata+Omitted%22&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[{"id":"f9b61a7e-0c86-4cc7-b94e-48d3b643c554","title":"Metadata Omitted","primary-type":"Album","artist-credit":[{"name":"Artist"}]}]}
                        """, MediaType.APPLICATION_JSON));

        var albums = client.search("Metadata Omitted");

        assertThat(albums).singleElement().extracting(MusicCatalogGateway.Album::coverUrl)
                .isEqualTo("https://coverartarchive.org/release-group/f9b61a7e-0c86-4cc7-b94e-48d3b643c554/front-250");
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
    void exposesAlbumAndEpMetadataAndRanksHigherScoredMatchesFirst() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22%EC%88%98%EC%9E%94%22+OR+artist%3A%22%EC%88%98%EC%9E%94%22+OR+releasegroup%3A%EC%88%98%EC%9E%94*+OR+artist%3A%EC%88%98%EC%9E%94*&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[
                          {"id":"fuzzy-ep","title":"Somewhere Else","score":61,"primary-type":"EP","artist-credit":[{"name":"김사월"}]},
                          {"id":"exact-album","title":"수잔","score":100,"primary-type":"Album","artist-credit":[{"name":"김사월"}]},
                          {"id":"single","title":"수잔","score":100,"primary-type":"Single","artist-credit":[{"name":"김사월"}]}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        var albums = client.search("수잔");

        assertThat(albums).extracting(MusicCatalogGateway.Album::releaseGroupMbid)
                .containsExactly("exact-album", "fuzzy-ep");
        assertThat(albums).extracting(MusicCatalogGateway.Album::primaryType)
                .containsExactly("Album", "EP");
        assertThat(albums).extracting(MusicCatalogGateway.Album::searchScore)
                .containsExactly(100, 61);
        server.verify();
    }

    @Test
    void ranksTheEarlierCanonicalReleaseAheadOfALaterSameTitleTie() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz(
                "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));
        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22Kind+of+Blue%22+OR+artist%3A%22Kind+of+Blue%22&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[
                          {"id":"jp-same-title","title":"Kind of Blue","score":100,"first-release-date":"2020-01-01","primary-type":"Album","artist-credit":[{"name":"Japanese Artist"}]},
                          {"id":"miles-canonical","title":"Kind of Blue","score":100,"first-release-date":"1959-08-17","primary-type":"Album","artist-credit":[{"name":"Miles Davis"}]}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.search("Kind of Blue")).extracting(MusicCatalogGateway.Album::artist)
                .containsExactly("Miles Davis", "Japanese Artist");
        server.verify();
    }

    @Test
    void findsKoreanArtistNamesFromAUserEnteredPrefix() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz(
                "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A%22%EA%B7%B9%EB%8F%99%22+OR+artist%3A%22%EA%B7%B9%EB%8F%99%22+OR+releasegroup%3A%EA%B7%B9%EB%8F%99*+OR+artist%3A%EA%B7%B9%EB%8F%99*&fmt=json&limit=10"))
                .andRespond(withSuccess("""
                        {"release-groups":[{"id":"korean-prefix-album","title":"모기","score":100,"primary-type":"Album","artist-credit":[{"name":"극동아시아타이거즈"}]}]}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.search("극동")).extracting(MusicCatalogGateway.Album::artist)
                .containsExactly("극동아시아타이거즈");
        server.verify();
    }

    @Test
    void fallsBackToRecordingSearchWhenTheReleaseGroupLookupIsRejected() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new MusicBrainzClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        server.expect(requestTo("https://musicbrainz.org/ws/2/release?release-group=release-group-id&limit=20&offset=0&fmt=json"))
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
