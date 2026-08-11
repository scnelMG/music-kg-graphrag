package org.musickg.backend.config;

import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("music-kg.connected")
public record ConnectedServiceProperties(Mode mode, Notion notion, MusicBrainz musicBrainz) {
    public ConnectedServiceProperties {
        mode = mode == null ? Mode.FIXTURE : mode;
        notion = notion == null ? new Notion("", "", new Notion.Fields("", "", "", "", "", "", "")) : notion;
        musicBrainz = musicBrainz == null ? new MusicBrainz("", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org") : musicBrainz;
    }

    public void validate() {
        if (mode != Mode.CONNECTED) return;
        if (placeholder(notion.apiKey()) || placeholder(notion.dataSourceId()) || !notion.fields().complete()) {
            throw new IllegalStateException("CONNECTED_NOTION_CONFIGURATION_REQUIRED");
        }
        if (placeholder(musicBrainz.userAgent())) {
            throw new IllegalStateException("CONNECTED_MUSICBRAINZ_USER_AGENT_REQUIRED");
        }
        if (musicBrainz.requestsPerSecond() != 1) throw new IllegalStateException("MUSICBRAINZ_RATE_LIMIT_CONFIGURATION_INVALID");
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean placeholder(String value) {
        return blank(value) || value.toLowerCase(Locale.ROOT).contains("replace-with");
    }

    public enum Mode { FIXTURE, CONNECTED }

    public record Notion(String apiKey, String dataSourceId, Fields fields) {
        public record Fields(String albumTitle, String artist, String cover, String sentiment,
                             String favouriteTrack, String owned, String releaseGroupMbid) {
            boolean complete() {
                return !placeholder(albumTitle) && !placeholder(artist) && !placeholder(cover)
                        && !placeholder(sentiment) && !placeholder(favouriteTrack) && !placeholder(owned)
                        && !placeholder(releaseGroupMbid);
            }
        }
    }

    public record MusicBrainz(String userAgent, String baseUrl, int requestsPerSecond, String coverArtArchiveBaseUrl) {}
}
