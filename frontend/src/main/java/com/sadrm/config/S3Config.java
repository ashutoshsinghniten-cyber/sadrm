package com.sadrm.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

@Configuration
public class S3Config {

    @Value("${app.aws.region}")
    private String region;

    @Value("${app.aws.access-key:}")
    private String accessKey;

    @Value("${app.aws.secret-key:}")
    private String secretKey;

    // Internal endpoint: used by S3Client for backend→MinIO operations (e.g. http://minio:9000 in Docker).
    @Value("${app.aws.endpoint-url:}")
    private String endpointUrl;

    // Public endpoint: baked into pre-signed URLs that the browser fetches directly.
    // Must be browser-accessible (e.g. http://localhost:9000), not the Docker-internal hostname.
    // Falls back to endpointUrl if not set (works fine when running outside Docker).
    @Value("${app.aws.public-endpoint-url:}")
    private String publicEndpointUrl;

    @Bean
    public S3Client s3Client() {
        var builder = S3Client.builder()
                .region(Region.of(region));

        // Credentials: static (MinIO/dev) ya IAM role (production)
        if (hasStaticCredentials()) {
            builder.credentialsProvider(
                    StaticCredentialsProvider.create(
                            AwsBasicCredentials.create(accessKey, secretKey)
                    )
            );
        } else {
            builder.credentialsProvider(DefaultCredentialsProvider.create());
        }

        // Local MinIO endpoint override
        if (hasEndpointOverride()) {
            builder.endpointOverride(URI.create(endpointUrl));
            // MinIO ke liye path-style URLs zaroori hain (virtual-hosted style nahi chalti locally)
            builder.serviceConfiguration(
                    S3Configuration.builder().pathStyleAccessEnabled(true).build()
            );
        }

        return builder.build();
    }

    @Bean
    public S3Presigner s3Presigner() {
        var builder = S3Presigner.builder()
                .region(Region.of(region));

        if (hasStaticCredentials()) {
            builder.credentialsProvider(
                    StaticCredentialsProvider.create(
                            AwsBasicCredentials.create(accessKey, secretKey)
                    )
            );
        } else {
            builder.credentialsProvider(DefaultCredentialsProvider.create());
        }

        // Use public endpoint for presigned URLs so the browser can resolve the hostname.
        // In Docker: endpointUrl = http://minio:9000 (internal), publicEndpointUrl = http://localhost:9000 (browser).
        // Outside Docker: publicEndpointUrl is blank, falls back to endpointUrl.
        String presignerEndpoint = (publicEndpointUrl != null && !publicEndpointUrl.isBlank())
                ? publicEndpointUrl
                : endpointUrl;

        if (presignerEndpoint != null && !presignerEndpoint.isBlank()) {
            builder.endpointOverride(URI.create(presignerEndpoint));
            builder.serviceConfiguration(
                    S3Configuration.builder().pathStyleAccessEnabled(true).build()
            );
        }

        return builder.build();
    }

    private boolean hasStaticCredentials() {
        return accessKey != null && !accessKey.isBlank()
                && secretKey != null && !secretKey.isBlank();
    }

    private boolean hasEndpointOverride() {
        return endpointUrl != null && !endpointUrl.isBlank();
    }
}
