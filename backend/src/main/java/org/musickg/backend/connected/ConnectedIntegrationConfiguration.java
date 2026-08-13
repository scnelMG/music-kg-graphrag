package org.musickg.backend.connected;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.time.Duration;
import org.musickg.backend.catalog.MusicBrainzClient;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.musickg.backend.config.GroundedLlmProperties;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@ConditionalOnProperty(prefix = "music-kg.connected", name = "mode", havingValue = "connected")
class ConnectedIntegrationConfiguration {
    @Bean
    MusicCatalogGateway musicCatalogGateway(RestClient.Builder builder, ObjectMapper objectMapper,
                                            ConnectedServiceProperties properties) {
        return new MusicBrainzClient(externalClient(builder), objectMapper, properties.musicBrainz());
    }

    @Bean
    PersonalMusicRecordGateway personalMusicRecordGateway(RestClient.Builder builder, ObjectMapper objectMapper,
                                                           ConnectedServiceProperties properties) {
        return new NotionClient(externalClient(builder), objectMapper, properties.notion());
    }

    @Bean
    PersonalGraphProjectionGateway personalGraphProjectionGateway(RestClient.Builder builder, ObjectMapper objectMapper,
                                                                   ConnectedServiceProperties properties) {
        return new GraphDbPersonalGraphProjectionGateway(
                externalClient(builder).mutate().baseUrl(properties.graphDb().endpoint()).build(), objectMapper,
                properties.graphDb().queryEndpoint());
    }

    @Bean
    GroundedExplanationGenerator groundedExplanationGenerator(RestClient.Builder builder, ObjectMapper objectMapper,
                                                               GroundedLlmProperties properties) {
        if (!properties.configured()) return GroundedExplanationGenerator.disabled();
        return new OpenAiCompatibleGroundedExplanationGenerator(
                externalClient(builder).mutate().baseUrl(properties.baseUrl()).build(), objectMapper,
                properties.apiKey(), properties.model());
    }

    @Bean
    ConnectedMusicService connectedMusicService(MusicCatalogGateway catalog, PersonalMusicRecordGateway records,
                                                PersonalGraphProjectionGateway graph,
                                                GroundedExplanationGenerator explanationGenerator) {
        return new ConnectedMusicService(catalog, records, graph, java.time.Clock.systemUTC(), explanationGenerator);
    }

    private static RestClient externalClient(RestClient.Builder builder) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(5));
        return builder.clone().requestFactory(requestFactory).build();
    }
}
