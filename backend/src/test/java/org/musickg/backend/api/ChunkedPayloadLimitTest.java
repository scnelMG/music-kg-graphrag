package org.musickg.backend.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "music-kg.api.mode=fixture",
        "music-kg.api.bff-shared-secret=test-bff-secret"
})
class ChunkedPayloadLimitTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @LocalServerPort
    private int port;

    @Test
    void rejectsPayloadOverLimitWhenTransferIsChunkedWithoutContentLength() throws Exception {
        String body = "{\"questionClass\":\"RECOMMENDATION_EXPLANATION\",\"question\":\"" + "x".repeat(4097) + "\"}";
        HttpURLConnection connection = (HttpURLConnection) URI.create("http://127.0.0.1:" + port + "/api/v1/graphrag")
                .toURL().openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("X-Music-Kg-Bff-Secret", "test-bff-secret");
        connection.setDoOutput(true);
        connection.setChunkedStreamingMode(256);
        connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));

        assertEquals(413, connection.getResponseCode());
        InputStream errorStream = connection.getErrorStream();
        JsonNode response = JSON.readTree(errorStream);
        assertEquals("PAYLOAD_TOO_LARGE", response.get("code").asText());
        assertEquals(connection.getHeaderField("X-Request-Id"), response.get("requestId").asText());
    }
}
