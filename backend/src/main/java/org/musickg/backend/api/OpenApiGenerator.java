package org.musickg.backend.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.SwaggerParseResult;
import org.musickg.backend.MusicKgApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;

public final class OpenApiGenerator {
    private OpenApiGenerator() {}

    public static void main(String[] arguments) throws Exception {
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(MusicKgApplication.class)
                .web(WebApplicationType.SERVLET)
                .properties(
                        "server.port=0",
                        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration")
                .run(arguments)) {
            int port = ((WebServerApplicationContext) context).getWebServer().getPort();
            String document = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/v3/api-docs")).GET().build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString()).body();
            if (!document.contains("\"openapi\":\"3.1.0\"")) throw new IllegalStateException("OPENAPI_3_1_REQUIRED");
            SwaggerParseResult validation = new OpenAPIV3Parser().readContents(document, null, null);
            if (validation.getOpenAPI() == null || validation.getMessages() != null && !validation.getMessages().isEmpty()) {
                throw new IllegalStateException("OPENAPI_VALIDATION_FAILED: " + validation.getMessages());
            }
            Path destination = Path.of("build", "openapi", "openapi.json");
            Files.createDirectories(destination.getParent());
            Files.writeString(destination, document);
        }
    }
}
