package org.musickg.backend.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "music-kg.api.mode=fixture"
})
@AutoConfigureMockMvc
class UnsupportedQuestionClassTest {
    @Autowired
    private MockMvc mvc;

    @Test
    void rejectsUnsupportedQuestionClassWithoutQueryExecution() throws Exception {
        String payload = "{\"questionClass\":\"FREE_TEXT\",\"question\":\"SELECT * WHERE {?s ?p ?o}\"}";
        mvc.perform(post("/api/v1/graphrag").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_QUESTION_CLASS"));
    }
}
