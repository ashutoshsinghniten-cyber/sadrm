package com.sadrm.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.time.Duration;

@Service
public class S3Service {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    @Value("${app.aws.s3-bucket}")
    private String bucket;

    public S3Service(S3Client s3Client, S3Presigner s3Presigner) {
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
    }

    public void upload(String key, byte[] data, String contentType) {
        upload(key, data, contentType, null);
    }

    public void upload(String key, byte[] data, String contentType, String contentEncoding) {
        PutObjectRequest.Builder requestBuilder = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .contentLength((long) data.length);

        if (contentEncoding != null && !contentEncoding.isBlank()) {
            requestBuilder.contentEncoding(contentEncoding);
        }

        s3Client.putObject(requestBuilder.build(), RequestBody.fromBytes(data));
    }

    public void uploadWithRetry(String key, byte[] data, String contentType, int attempts) {
        uploadWithRetry(key, data, contentType, null, attempts);
    }

    public void uploadWithRetry(String key, byte[] data, String contentType, String contentEncoding, int attempts) {
        Exception lastError = null;
        for (int i = 0; i < attempts; i++) {
            try {
                upload(key, data, contentType, contentEncoding);
                return;
            } catch (Exception e) {
                lastError = e;
                if (i < attempts - 1) {
                    try {
                        Thread.sleep(250L * (i + 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        if (lastError != null) {
            throw new RuntimeException("S3 upload failed after " + attempts + " attempts.", lastError);
        }
    }

    public String getPresignedUrl(String key, int expirySeconds) {
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(expirySeconds))
                .getObjectRequest(r -> r.bucket(bucket).key(key).build())
                .build();
        PresignedGetObjectRequest presigned = s3Presigner.presignGetObject(presignRequest);
        return presigned.url().toString();
    }
}
