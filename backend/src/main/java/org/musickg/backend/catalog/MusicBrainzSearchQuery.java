package org.musickg.backend.catalog;

final class MusicBrainzSearchQuery {
    private MusicBrainzSearchQuery() {}

    static String albumAndArtist(String albumTitle, String artist) {
        return "artist:\"" + escapeTerm(artist) + "\" AND releasegroup:\"" + escapeTerm(albumTitle) + "\"";
    }

    static String freeText(String query) {
        String term = escapeTerm(query);
        String exact = "releasegroup:\"" + term + "\" OR artist:\"" + term + "\"";
        return isHangulSingleTerm(query) ? exact + " OR releasegroup:" + term + "* OR artist:" + term + "*" : exact;
    }

    static String artist(String artist) {
        return "artist:\"" + escapeTerm(artist) + "\"";
    }

    static String tag(String tag) {
        return "tag:\"" + escapeTerm(tag) + "\"";
    }

    private static boolean isHangulSingleTerm(String value) {
        return value.codePoints().allMatch(Character::isLetterOrDigit)
                && value.codePoints().anyMatch(codePoint -> Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.HANGUL);
    }

    private static String escapeTerm(String value) {
        StringBuilder escaped = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if ("+-!(){}[]^\"~*?:\\/".indexOf(character) >= 0) escaped.append('\\');
            escaped.append(character);
        }
        return escaped.toString();
    }
}
