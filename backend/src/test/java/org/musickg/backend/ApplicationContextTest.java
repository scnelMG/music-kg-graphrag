package org.musickg.backend;

import org.junit.jupiter.api.Test;
import org.musickg.backend.persistence.CanonicalWriteService;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "music-kg.connected.mode=fixture"
})
class ApplicationContextTest {
    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void loadsFixtureOnlyApplicationContextWithoutCanonicalWriteService() {
        assertThat(applicationContext.getBeanProvider(CanonicalWriteService.class).getIfAvailable()).isNull();
    }
}
