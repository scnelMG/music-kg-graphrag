package org.musickg.backend.config;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.musickg.backend.MusicKgApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;

class ConnectedServicePropertiesTest {
    @Test
    void rejectsConnectedModeWithoutRequiredServerSideCredentials() {
        var properties = new ConnectedServiceProperties(
                ConnectedServiceProperties.Mode.CONNECTED,
                new ConnectedServiceProperties.Notion("", "", fields()),
                new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        assertThatThrownBy(properties::validate)
                .hasMessage("CONNECTED_NOTION_CONFIGURATION_REQUIRED");
    }

    @Test
    void rejectsConnectedModeWhenNotionValuesStillContainExamplePlaceholders() {
        var properties = new ConnectedServiceProperties(
                ConnectedServiceProperties.Mode.CONNECTED,
                new ConnectedServiceProperties.Notion("replace-with-notion-integration-token", "replace-with-data-source-id", asciiFields()),
                new ConnectedServiceProperties.MusicBrainz("music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org"));

        assertThatThrownBy(properties::validate)
                .hasMessage("CONNECTED_NOTION_CONFIGURATION_REQUIRED");
    }

    @Test
    void applicationFailsClosedWhenConnectedModeIsMissingNotionCredentials() {
        assertThatThrownBy(() -> new SpringApplicationBuilder(MusicKgApplication.class)
                .web(WebApplicationType.NONE)
                .properties("spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration")
                .run("--music-kg.connected.mode=connected"))
                .hasRootCauseMessage("CONNECTED_NOTION_CONFIGURATION_REQUIRED");
    }

    @Test
    void connectedProfileStartsWithoutTheLegacyJdbcRuntime() {
        try (var context = new SpringApplicationBuilder(MusicKgApplication.class)
                .web(WebApplicationType.NONE)
                .run(
                        "--spring.profiles.active=connected",
                        "--music-kg.api.bff-shared-secret=connected-test-secret",
                        "--music-kg.connected.mode=connected",
                        "--music-kg.connected.notion.api-key=notion-test-token",
                        "--music-kg.connected.notion.data-source-id=data-source-id",
                        "--music-kg.connected.notion.fields.album-title=album",
                        "--music-kg.connected.notion.fields.artist=artist",
                        "--music-kg.connected.notion.fields.cover=cover",
                        "--music-kg.connected.notion.fields.sentiment=sentiment",
                        "--music-kg.connected.notion.fields.favourite-track=track",
                        "--music-kg.connected.notion.fields.owned=owned",
                        "--music-kg.connected.notion.fields.release-group-mbid=mbid",
                        "--music-kg.connected.music-brainz.user-agent=music-kg/1.0 (https://example.test)")) {
            assertThatThrownBy(() -> context.getBean("dataSource"))
                    .hasMessageContaining("No bean named 'dataSource'");
        }
    }

    private static ConnectedServiceProperties.Notion.Fields fields() {
        return new ConnectedServiceProperties.Notion.Fields(
                "앨범명", "가수", "앨범커버", "개인 감상평", "개인 최애곡", "앨범 보유", "MusicBrainz MBID");
    }

    private static ConnectedServiceProperties.Notion.Fields asciiFields() {
        return new ConnectedServiceProperties.Notion.Fields("album", "artist", "cover", "sentiment", "track", "owned", "mbid");
    }
}
