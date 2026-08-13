package org.musickg.backend.connected;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

public final class OpenAiCompatibleGroundedExplanationGenerator implements GroundedExplanationGenerator {
    private static final String SYSTEM_PROMPT = """
            당신은 개인 음악 기록을 요약하는 도우미입니다. 제공된 evidence만 사용해 한국어로 두 문장 이하의 설명을 작성하세요.
            추천을 새로 만들거나 순위를 바꾸지 마세요. 외부 지식, 장르 추측, 페이지 ID, URL, 점수는 쓰지 마세요.
            JSON 객체만 반환하세요: {\"answer\":\"...\",\"evidenceLabels\":[\"E1\"]}. evidenceLabels는 제공된 label만 사용하세요.
            """;
    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String model;

    public OpenAiCompatibleGroundedExplanationGenerator(RestClient client, ObjectMapper objectMapper, String apiKey, String model) {
        this.client = client;
        this.objectMapper = objectMapper;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public Generated generate(Context context) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "model", model,
                    "temperature", 0,
                    "response_format", Map.of("type", "json_object"),
                    "messages", List.of(
                            Map.of("role", "system", "content", SYSTEM_PROMPT),
                            Map.of("role", "user", "content", objectMapper.writeValueAsString(Map.of(
                                    "question", context.question(), "evidence", context.evidence()))))));
            String response = client.post().uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(body).retrieve().body(String.class);
            return parse(response == null ? "" : response, context.labels());
        } catch (RestClientResponseException | ResourceAccessException exception) {
            throw new GenerationException("LLM_UNAVAILABLE", exception);
        } catch (JsonProcessingException exception) {
            throw new GenerationException("LLM_RESPONSE_INVALID", exception);
        }
    }

    private Generated parse(String response, java.util.Set<String> allowedLabels) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(response);
        String content = root.path("choices").path(0).path("message").path("content").asText();
        JsonNode output = objectMapper.readTree(content);
        String answer = output.path("answer").asText().trim();
        JsonNode labels = output.path("evidenceLabels");
        if (!labels.isArray()) throw new GenerationException("LLM_RESPONSE_INVALID");
        List<String> values = new ArrayList<>();
        for (JsonNode label : labels) values.add(label.asText());
        Generated generated;
        try {
            generated = new Generated(answer, values);
        } catch (IllegalArgumentException exception) {
            throw new GenerationException("LLM_RESPONSE_INVALID", exception);
        }
        if (!allowedLabels.containsAll(generated.evidenceLabels())) {
            throw new GenerationException("LLM_RESPONSE_UNGROUNDED");
        }
        return generated;
    }
}
