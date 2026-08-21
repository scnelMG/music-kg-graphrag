package org.musickg.backend.catalog;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;

final class MusicBrainzPayloadParser {
    private final ObjectMapper objectMapper;

    MusicBrainzPayloadParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    List<MusicCatalogGateway.Album> albums(String response, Function<String, String> coverUrl) {
        try {
            JsonNode groups = objectMapper.readTree(response).path("release-groups");
            if (!groups.isArray()) throw contractError();
            List<MusicCatalogGateway.Album> albums = new ArrayList<>();
            for (JsonNode group : groups) {
                String primaryType = group.path("primary-type").asText();
                if (!primaryType.equals("Album") && !primaryType.equals("EP")) continue;
                String releaseGroupMbid = group.path("id").asText();
                String title = group.path("title").asText();
                List<String> artistCredits = artistCredits(group.path("artist-credit"));
                String artist = String.join(", ", artistCredits);
                if (blank(releaseGroupMbid) || blank(title) || blank(artist)) continue;
                albums.add(new MusicCatalogGateway.Album(
                        releaseGroupMbid,
                        title,
                        artist,
                        group.path("first-release-date").asText(""),
                        coverUrl.apply(releaseGroupMbid),
                        artistCredits,
                        primaryType,
                        group.path("score").asInt()));
            }
            albums.sort(Comparator.comparingInt(MusicCatalogGateway.Album::searchScore).reversed()
                    .thenComparing(MusicCatalogGateway.Album::title)
                    .thenComparing(MusicCatalogGateway.Album::releaseGroupMbid));
            return List.copyOf(albums);
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw contractError(exception);
        }
    }

    EditionPage editionPage(String releaseGroupMbid, String response) {
        try {
            JsonNode body = objectMapper.readTree(response);
            JsonNode releases = body.path("releases");
            JsonNode releaseCount = body.get("release-count");
            if (!releases.isArray()
                    || releaseCount == null
                    || !releaseCount.isIntegralNumber()
                    || !releaseCount.canConvertToInt()
                    || releaseCount.asInt() < 0) throw contractError();
            List<MusicCatalogGateway.Edition> values = new ArrayList<>();
            for (JsonNode release : releases) {
                String releaseMbid = release.path("id").asText();
                if (blank(releaseMbid)) throw contractError();
                values.add(new MusicCatalogGateway.Edition(
                        releaseMbid,
                        releaseGroupMbid,
                        release.path("title").asText(""),
                        release.path("date").asText(""),
                        release.path("country").asText(""),
                        release.path("status").asText(""),
                        release.path("disambiguation").asText(""),
                        false));
            }
            return new EditionPage(releaseCount.asInt(), releases.size(), List.copyOf(values));
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw contractError(exception);
        }
    }

    MusicCatalogGateway.Edition edition(String expectedReleaseGroupMbid, String response) {
        try {
            JsonNode release = objectMapper.readTree(response);
            String releaseMbid = release.path("id").asText();
            String releaseGroupMbid = release.path("release-group").path("id").asText();
            if (blank(releaseMbid) || blank(releaseGroupMbid)) throw contractError();
            if (!releaseGroupMbid.equals(expectedReleaseGroupMbid)) {
                throw MusicBrainzClient.CatalogAccessException.releaseNotInGroup();
            }
            return new MusicCatalogGateway.Edition(
                    releaseMbid,
                    releaseGroupMbid,
                    release.path("title").asText(""),
                    release.path("date").asText(""),
                    release.path("country").asText(""),
                    release.path("status").asText(""),
                    release.path("disambiguation").asText(""),
                    false);
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw contractError(exception);
        }
    }

    List<MusicCatalogGateway.Edition> rankEditions(List<MusicCatalogGateway.Edition> editions) {
        List<MusicCatalogGateway.Edition> values = new ArrayList<>(editions);
        values.sort(Comparator.comparing((MusicCatalogGateway.Edition edition) -> !validReleaseDate(edition.releaseDate()))
                    .thenComparing(edition -> validReleaseDate(edition.releaseDate()) ? edition.releaseDate() : "")
                    .thenComparing(edition -> !"Official".equalsIgnoreCase(edition.status()))
                    .thenComparing(MusicCatalogGateway.Edition::releaseMbid));
        List<MusicCatalogGateway.Edition> ordered = new ArrayList<>();
        for (int index = 0; index < values.size(); index++) {
            MusicCatalogGateway.Edition edition = values.get(index);
            ordered.add(new MusicCatalogGateway.Edition(
                    edition.releaseMbid(), edition.releaseGroupMbid(), edition.title(), edition.releaseDate(),
                    edition.country(), edition.status(), edition.disambiguation(), index == 0));
        }
        return List.copyOf(ordered);
    }

    List<MusicCatalogGateway.Track> tracks(String response) {
        try {
            JsonNode release = objectMapper.readTree(response);
            List<MusicCatalogGateway.Track> tracks = new ArrayList<>();
            for (JsonNode medium : release.path("media")) {
                for (JsonNode track : medium.path("tracks")) {
                    String recordingMbid = track.path("recording").path("id").asText();
                    String title = track.path("recording").path("title").asText(track.path("title").asText());
                    int position = track.path("position").asInt();
                    if (!blank(recordingMbid) && !blank(title) && position > 0) {
                        tracks.add(new MusicCatalogGateway.Track(recordingMbid, title, position));
                    }
                }
            }
            return List.copyOf(tracks);
        } catch (JsonProcessingException exception) {
            throw contractError(exception);
        }
    }

    List<MusicCatalogGateway.Track> recordingSearch(String response) {
        try {
            JsonNode recordings = objectMapper.readTree(response).path("recordings");
            if (!recordings.isArray()) throw contractError();
            List<MusicCatalogGateway.Track> tracks = new ArrayList<>();
            for (JsonNode recording : recordings) {
                String recordingMbid = recording.path("id").asText();
                String title = recording.path("title").asText();
                if (!blank(recordingMbid) && !blank(title)) {
                    tracks.add(new MusicCatalogGateway.Track(recordingMbid, title, tracks.size() + 1));
                }
            }
            return List.copyOf(tracks);
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw contractError(exception);
        }
    }

    List<String> tags(String response) {
        try {
            JsonNode body = objectMapper.readTree(response);
            java.util.LinkedHashSet<String> values = new java.util.LinkedHashSet<>();
            collectTags(values, body.path("genres"));
            collectTags(values, body.path("tags"));
            return List.copyOf(values.stream().limit(3).toList());
        } catch (JsonProcessingException exception) {
            throw contractError(exception);
        }
    }

    private static List<String> artistCredits(JsonNode credits) {
        if (!credits.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode credit : credits) {
            String name = credit.path("name").asText();
            if (!blank(name)) values.add(name);
        }
        return List.copyOf(values);
    }

    private static void collectTags(java.util.LinkedHashSet<String> values, JsonNode tags) {
        if (!tags.isArray()) return;
        for (JsonNode tag : tags) {
            String name = tag.path("name").asText().trim();
            if (!name.isBlank()) values.add(name);
        }
    }

    private static boolean validReleaseDate(String value) {
        if (blank(value)) return false;
        try {
            if (value.matches("\\d{4}")) {
                Year.parse(value);
            } else if (value.matches("\\d{4}-\\d{2}")) {
                YearMonth.parse(value);
            } else if (value.matches("\\d{4}-\\d{2}-\\d{2}")) {
                LocalDate.parse(value);
            } else {
                return false;
            }
            return true;
        } catch (DateTimeParseException exception) {
            return false;
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static MusicBrainzClient.CatalogAccessException contractError() {
        return contractError(null);
    }

    private static MusicBrainzClient.CatalogAccessException contractError(Throwable cause) {
        return new MusicBrainzClient.CatalogAccessException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", false, cause);
    }

    record EditionPage(int releaseCount, int returnedCount, List<MusicCatalogGateway.Edition> editions) {}
}
