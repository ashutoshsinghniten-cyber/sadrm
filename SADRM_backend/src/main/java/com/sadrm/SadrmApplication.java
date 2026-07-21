package com.sadrm;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SadrmApplication {

    public static void main(String[] args) {
        SpringApplication.run(SadrmApplication.class, args);
    }
}
