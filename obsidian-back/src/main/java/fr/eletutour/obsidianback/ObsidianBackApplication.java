package fr.eletutour.obsidianback;

import fr.eletutour.obsidianback.configuration.ObsidianProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(ObsidianProperties.class)
public class ObsidianBackApplication {

    public static void main(String[] args) {
        SpringApplication.run(ObsidianBackApplication.class, args);
    }

}
