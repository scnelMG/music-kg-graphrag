package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ITunesCatalogClientTest {
    @Test
    void returnsKoreanStoreAlbumsWithTheirCollectionIdentity() {
        var builder = RestClient.builder().baseUrl("https://itunes.apple.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new ITunesCatalogClient(builder.build(), new ObjectMapper());
        server.expect(requestTo("https://itunes.apple.com/search?term=%EA%B7%B9%EB%8F%99&country=KR&media=music&entity=album&limit=10"))
                .andRespond(withSuccess("""
                        {"resultCount":1,"results":[{
                          "wrapperType":"collection","collectionType":"Album","collectionId":123456789,
                          "collectionName":"새 음반","artistName":"극동아시아타이거즈",
                          "releaseDate":"2025-04-11T07:00:00Z",
                          "artworkUrl100":"https://is1-ssl.mzstatic.com/image/thumb/Music/v4/artwork/100x100bb.jpg",
                          "collectionViewUrl":"https://music.apple.com/kr/album/new-album/123456789",
                          "trackCount":8
                        }]}
                        """, MediaType.APPLICATION_JSON));

        var albums = client.search("극동");

        assertThat(albums).singleElement().satisfies(album -> {
            assertThat(album.catalogSource()).isEqualTo(MusicCatalogGateway.CatalogSource.ITUNES);
            assertThat(album.catalogId()).isEqualTo("123456789");
            assertThat(album.releaseGroupMbid()).isBlank();
            assertThat(album.title()).isEqualTo("새 음반");
            assertThat(album.artist()).isEqualTo("극동아시아타이거즈");
            assertThat(album.firstReleaseDate()).isEqualTo("2025-04-11");
            assertThat(album.catalogUrl()).isEqualTo("https://music.apple.com/kr/album/new-album/123456789");
        });
        server.verify();
    }

    @Test
    void returnsOnlyTracksFromTheSelectedCollectionLookup() {
        var builder = RestClient.builder().baseUrl("https://itunes.apple.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new ITunesCatalogClient(builder.build(), new ObjectMapper());
        server.expect(requestTo("https://itunes.apple.com/lookup?id=123456789&entity=song&country=KR"))
                .andRespond(withSuccess("""
                        {"resultCount":3,"results":[
                          {"wrapperType":"collection","collectionId":123456789},
                          {"wrapperType":"track","kind":"song","collectionId":123456789,"trackId":987654321,"trackName":"첫 곡","trackNumber":1},
                          {"wrapperType":"track","kind":"song","collectionId":987654321,"trackId":222222222,"trackName":"다른 음반 곡","trackNumber":1}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        var tracks = client.tracks("123456789");

        assertThat(tracks).containsExactly(new MusicCatalogGateway.Track("itunes:987654321", "첫 곡", 1));
        server.verify();
    }

    @Test
    void fallsBackToUnitedStatesStoreWhenKoreanLookupHasNoTracks() {
        var builder = RestClient.builder().baseUrl("https://itunes.apple.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new ITunesCatalogClient(builder.build(), new ObjectMapper());
        server.expect(requestTo("https://itunes.apple.com/lookup?id=399211729&entity=song&country=KR"))
                .andRespond(withSuccess("""
                        {"resultCount":1,"results":[
                          {"wrapperType":"collection","collectionId":399211729}
                        ]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://itunes.apple.com/lookup?id=399211729&entity=song&country=US"))
                .andRespond(withSuccess("""
                        {"resultCount":2,"results":[
                          {"wrapperType":"collection","collectionId":399211729},
                          {"wrapperType":"track","kind":"song","collectionId":399211729,"trackId":399211739,"trackName":"Alison","trackNumber":1}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        var tracks = client.tracks("399211729");

        assertThat(tracks).containsExactly(new MusicCatalogGateway.Track("itunes:399211739", "Alison", 1));
        server.verify();
    }

    @Test
    void resolvesTheExactCollectionBeforeAnOwnerCanSaveIt() {
        var builder = RestClient.builder().baseUrl("https://itunes.apple.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new ITunesCatalogClient(builder.build(), new ObjectMapper());
        server.expect(requestTo("https://itunes.apple.com/lookup?id=123456789&country=KR"))
                .andRespond(withSuccess("""
                        {"resultCount":1,"results":[{
                          "wrapperType":"collection","collectionType":"Album","collectionId":123456789,
                          "collectionName":"정확한 음반","artistName":"정확한 가수",
                          "releaseDate":"2025-04-11T07:00:00Z",
                          "artworkUrl100":"https://is1-ssl.mzstatic.com/image/thumb/Music/v4/artwork/100x100bb.jpg",
                          "collectionViewUrl":"https://music.apple.com/kr/album/exact/123456789"
                        }]}
                        """, MediaType.APPLICATION_JSON));

        var album = client.album("123456789");

        assertThat(album.title()).isEqualTo("정확한 음반");
        assertThat(album.artist()).isEqualTo("정확한 가수");
        server.verify();
    }
}
