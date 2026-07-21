package com.sadrm.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("sadrm-async-");
        executor.initialize();
        return executor;
    }

    // CPU-bound WebP rendering is capped at 2×vCPU to prevent thread saturation.
    // PDF rasterisation + WebP encoding are pure CPU work; more threads than cores
    // adds context-switch overhead and slows throughput rather than improving it.
    // Queue depth 500 absorbs burst imports without dropping requests.
    @Bean(name = "webpExecutor")
    public Executor webpExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("sadrm-webp-");
        executor.initialize();
        return executor;
    }
}
