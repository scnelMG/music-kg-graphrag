package org.musickg.backend.config;

import java.net.URI;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("music-kg.connected")
public record ConnectedServiceProperties(Mode mode, Notion notion, MusicBrainz musicBrainz, GraphDb graphDb) {
    public ConnectedServiceProperties {
        mode = mode == null ? Mode.FIXTURE : mode;
        notion = notion == null ? new Notion("", "", new Notion.Fields("", "", "", "", "", "", "", "")) : notion;
        musicBrainz = musicBrainz == null ? new MusicBrainz("", "https://musicbrainz.org/ws/2", 1, "https://coverartarchive.org") : musicBrainz;
        graphDb = graphDb == null ? new GraphDb("", "music-kg-personal") : graphDb;
    }

    public void validate() {
        if (mode != Mode.CONNECTED) return;
        if (placeholder(notion.apiKey()) || placeholder(notion.dataSourceId()) || !notion.fields().complete()) {
            throw new IllegalStateException("CONNECTED_NOTION_CONFIGURATION_REQUIRED");
        }
        if (notion.fields().youtubeMappingPartiallyConfigured()) {
            throw new IllegalStateException("CONNECTED_YOUTUBE_NOTION_CONFIGURATION_INVALID");
        }
        if (placeholder(musicBrainz.userAgent())) {
            throw new IllegalStateException("CONNECTED_MUSICBRAINZ_USER_AGENT_REQUIRED");
        }
        if (musicBrainz.requestsPerSecond() != 1) throw new IllegalStateException("MUSICBRAINZ_RATE_LIMIT_CONFIGURATION_INVALID");
        if (!graphDb.valid()) throw new IllegalStateException("CONNECTED_GRAPHDB_CONFIGURATION_REQUIRED");
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
                             String favouriteTrack, String owned, String releaseGroupMbid, String releaseMbid,
                             String youtubeRecordingMbid, String youtubeVideoId, String youtubeVideoTitle,
                             String youtubeChannelTitle) {
            @ConstructorBinding
            public Fields {}

            public Fields(String albumTitle, String artist, String cover, String sentiment,
                          String favouriteTrack, String owned, String releaseGroupMbid, String releaseMbid) {
                this(albumTitle, artist, cover, sentiment, favouriteTrack, owned, releaseGroupMbid, releaseMbid,
                        "", "", "", "");
            }

            boolean complete() {
                return !placeholder(albumTitle) && !placeholder(artist) && !placeholder(cover)
                        && !placeholder(sentiment) && !placeholder(favouriteTrack) && !placeholder(owned)
                        && !placeholder(releaseGroupMbid) && !placeholder(releaseMbid);
            }

            public boolean youtubeMappingConfigured() {
                return !placeholder(youtubeRecordingMbid) && !placeholder(youtubeVideoId)
                        && !placeholder(youtubeVideoTitle) && !placeholder(youtubeChannelTitle);
            }

            boolean youtubeMappingPartiallyConfigured() {
                boolean any = !blank(youtubeRecordingMbid) || !blank(youtubeVideoId)
                        || !blank(youtubeVideoTitle) || !blank(youtubeChannelTitle);
                return any && !youtubeMappingConfigured();
            }
        }
    }

    public record MusicBrainz(String userAgent, String baseUrl, int requestsPerSecond, String coverArtArchiveBaseUrl) {}

    public record GraphDb(String baseUrl, String repository) {
        public String endpoint() {
            return baseUrl.endsWith("/") ? baseUrl + "repositories/" + repository + "/"
                    : baseUrl + "/repositories/" + repository + "/";
        }

        public String queryEndpoint() {
            return endpoint().substring(0, endpoint().length() - 1);
        }

        boolean valid() {
            if (placeholder(baseUrl) || placeholder(repository) || !repository.matches("[A-Za-z0-9_-]+")) return false;
            try {
                String scheme = URI.create(baseUrl).getScheme();
                return "http".equals(scheme) || "https".equals(scheme);
            } catch (IllegalArgumentException exception) {
                return false;
            }
        }
    }
}
