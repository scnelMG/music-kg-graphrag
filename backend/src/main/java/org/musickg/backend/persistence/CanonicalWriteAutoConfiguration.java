package org.musickg.backend.persistence;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;

@AutoConfiguration(after = JdbcTemplateAutoConfiguration.class)
@ConditionalOnBean(JdbcTemplate.class)
public class CanonicalWriteAutoConfiguration {
    @Bean
    CanonicalWriteService canonicalWriteService(JdbcTemplate jdbc) {
        return new CanonicalWriteService(jdbc);
    }
}
