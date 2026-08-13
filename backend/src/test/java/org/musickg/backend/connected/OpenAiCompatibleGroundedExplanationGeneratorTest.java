package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenAiCompatibleGroundedExplanationGeneratorTest {
    @Test
    void generatesAnAnswerThatCitesOnlySuppliedEvidenceLabels() {
        var builder = RestClient.builder().baseUrl("https://llm.example/v1");
        var server = MockRestServiceServer.bindTo(builder).build();
        var generator = new OpenAiCompatibleGroundedExplanationGenerator(builder.build(), new ObjectMapper(), "test-key", "test-model");
        var context = new GroundedExplanationGenerator.Context("왜 이 앨범을 추천하나요?", List.of(
                new GroundedExplanationGenerator.Evidence("E1", "Recorded Album", "Artist A", "RECORDED_BY", "Loved · Favourite track: Track A")));
        server.expect(requestTo("https://llm.example/v1/chat/completions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-key"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\\\"label\\\":\\\"E1\\\"")))
                .andRespond(withSuccess("""
                        {"choices":[{"message":{"content":"{\\"answer\\":\\"기록한 앨범의 최애곡과 감상에 연결됩니다.\\",\\"evidenceLabels\\":[\\"E1\\"]}"}}]}
                        """, MediaType.APPLICATION_JSON));

        var result = generator.generate(context);

        assertThat(result.answer()).isEqualTo("기록한 앨범의 최애곡과 감상에 연결됩니다.");
        assertThat(result.evidenceLabels()).containsExactly("E1");
        server.verify();
    }

    @Test
    void rejectsACitationThatWasNotRetrieved() {
        var builder = RestClient.builder().baseUrl("https://llm.example/v1");
        var server = MockRestServiceServer.bindTo(builder).build();
        var generator = new OpenAiCompatibleGroundedExplanationGenerator(builder.build(), new ObjectMapper(), "test-key", "test-model");
        var context = new GroundedExplanationGenerator.Context("왜 이 앨범을 추천하나요?", List.of(
                new GroundedExplanationGenerator.Evidence("E1", "Recorded Album", "Artist A", "RECORDED_BY", "Loved")));
        server.expect(requestTo("https://llm.example/v1/chat/completions"))
                .andRespond(withSuccess("""
                        {"choices":[{"message":{"content":"{\\"answer\\":\\"근거 없는 설명입니다.\\",\\"evidenceLabels\\":[\\"E999\\"]}"}}]}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> generator.generate(context))
                .isInstanceOf(GroundedExplanationGenerator.GenerationException.class)
                .hasMessage("LLM_RESPONSE_UNGROUNDED");
        server.verify();
    }
}
