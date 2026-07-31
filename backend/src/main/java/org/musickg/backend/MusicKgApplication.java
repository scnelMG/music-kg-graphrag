package org.musickg.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;

@SpringBootApplication
@OpenAPIDefinition(info = @Info(title = "Music KG Fixture-safe API", version = "v1"))
public class MusicKgApplication {
    public static void main(String[] args) {
        SpringApplication.run(MusicKgApplication.class, args);
    }
}
