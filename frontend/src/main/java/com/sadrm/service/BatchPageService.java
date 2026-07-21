package com.sadrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sadrm.exception.AppException;
import com.sadrm.model.BatchPage;
import com.sadrm.model.UploadedFile;
import com.sadrm.repository.BatchPageRepository;
import com.sadrm.security.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BatchPageService {

    private static final Duration PRESIGNED_URL_CACHE_TTL    = Duration.ofSeconds(3000);
    private static final int      PRESIGNED_URL_EXPIRY_SECONDS = 3600;

    private final BatchPageRepository repository;
    private final S3Service s3Service;
    private final WorkflowSnapshotService snapshotService;
    private final BatchPageProcessingService processingService;
    private final WebPConversionService webPConversionService;
    private final CacheService cacheService;
    private final UploadedFileService uploadedFileService;
    private final ObjectMapper objectMapper;

    @Value("${app.preview.webp.enabled:true}")
    private boolean webpPreviewEnabled;

    // Included in the Redis cache key so that changing the public endpoint URL
    // (e.g. from minio:9000 to localhost:9000) automatically invalidates old cached URLs.
    @Value("${app.aws.public-endpoint-url:}")
    private String publicEndpointUrl;

    public BatchPageService(BatchPageRepository repository,
                            S3Service s3Service,
                            WorkflowSnapshotService snapshotService,
                            BatchPageProcessingService processingService,
                            WebPConversionService webPConversionService,
                            CacheService cacheService,
                            UploadedFileService uploadedFileService,
                            ObjectMapper objectMapper) {
        this.repository            = repository;
        this.s3Service             = s3Service;
        this.snapshotService       = snapshotService;
        this.processingService     = processingService;
        this.webPConversionService = webPConversionService;
        this.cacheService          = cacheService;
        this.uploadedFileService   = uploadedFileService;
        this.objectMapper          = objectMapper;
    }

    public Map<String, Object> getPage(String batchId, String recordId, String filename) {
        String tenantId = resolvedTenantId();
        // Archived records store the original PDF filename; batch_pages stores the WebP preview filename.
        // Fall back to original_filename lookup so the Repository can fetch pages by their original name.
        BatchPage page = repository.findByTenantIdAndBatchIdAndRecordIdAndFilename(tenantId, batchId, recordId, filename)
                .or(() -> repository.findByTenantIdAndBatchIdAndRecordIdAndOriginalFilename(tenantId, batchId, recordId, filename))
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Page not found."));
        return toPageResponse(page, true);
    }

    public Map<String, Object> getPages(String batchId, String recordId) {
        String tenantId = resolvedTenantId();
        List<BatchPage> pages = repository.findByTenantIdAndBatchIdAndRecordIdOrdered(tenantId, batchId, recordId);
        List<Map<String, Object>> items = new ArrayList<>();
        for (BatchPage page : pages) {
            items.add(toPageResponse(page, true));
        }

        Map<String, Object> result = new HashMap<>();
        result.put("batchId", batchId);
        result.put("recordId", recordId);
        result.put("pages", items);
        result.put("count", items.size());
        return result;
    }

    @Transactional
    public Map<String, Object> uploadPageFile(String batchId, String recordId,
                                              String filename, MultipartFile file) {
        String resolvedFilename = filename != null && !filename.isBlank()
                ? filename
                : file.getOriginalFilename();
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        try {
            return uploadBytes(batchId, recordId, resolvedFilename, contentType, file.getBytes());
        } catch (IOException e) {
            throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read uploaded file.");
        }
    }

    // Phase 4: SHA-256 helpers
    private String calculateFileContentHash(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Cannot hash an empty file.");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return bytesToHex(digest.digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed by the Java spec — this branch is unreachable in practice
            throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, "SHA-256 algorithm unavailable.");
        }
    }

    private String bytesToHex(byte[] digest) {
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private Map<String, Object> uploadBytes(String batchId,
                                            String recordId,
                                            String filename,
                                            String contentType,
                                            byte[] bytes) {
        String tenantId     = resolvedTenantId();
        String safeTenantId = safeSegment(tenantId);
        String safeBatchId  = safeSegment(batchId);
        String safeRecordId = safeSegment(recordId);
        String safeFilename = safeSegment(filename);

        // Phase 5: Calculate SHA-256 hash and check for existing non-failed upload
        String fileContentHash = calculateFileContentHash(bytes);
        long   fileSizeBytes   = bytes.length;

        Optional<UploadedFile> existingOpt = uploadedFileService.findNonFailedByHash(tenantId, fileContentHash);
        if (existingOpt.isPresent()) {
            return buildDuplicateResponse(existingOpt.get(), fileContentHash, tenantId, batchId, recordId,
                    safeFilename, contentType, fileSizeBytes);
        }

        // Phase 5: PDF + WebP path
        if (webpPreviewEnabled && isPdf(contentType, safeFilename)) {
            String originalS3Key        = "batch-pages/" + safeTenantId + "/" + safeBatchId + "/" + safeRecordId + "/original/" + safeFilename;
            String firstPreviewFilename = webPConversionService.previewFilename(safeFilename, 1);

            repository.upsertPageMetadataWithHash(
                    tenantId, batchId, recordId,
                    firstPreviewFilename, null, 1,
                    WebPConversionService.WEBP_CONTENT_TYPE,
                    safeFilename, originalS3Key,
                    null, null, null, null,
                    "PROCESSING",
                    fileContentHash
            );

            // Record in uploaded_files within this transaction (status=PROCESSING).
            // If the async PDF processing fails, processPdfPreview() will mark it FAILED
            // so the file can be retried on the next upload attempt.
            boolean inserted = uploadedFileService.recordIfAbsent(
                    tenantId, fileContentHash, safeFilename,
                    fileSizeBytes, batchId, recordId, originalS3Key, "PROCESSING");

            // Concurrent duplicate: another thread committed the same hash just now
            if (!inserted) {
                Optional<UploadedFile> concurrentDup = uploadedFileService.findNonFailedByHash(tenantId, fileContentHash);
                if (concurrentDup.isPresent()) {
                    return buildDuplicateResponse(concurrentDup.get(), fileContentHash, tenantId, batchId, recordId,
                            safeFilename, contentType, fileSizeBytes);
                }
            }

            String capturedHash = fileContentHash;
            runAfterCommit(() -> processingService.processPdfPreview(
                    tenantId, batchId, recordId, safeFilename, originalS3Key, bytes, capturedHash));

            Map<String, Object> result = new HashMap<>();
            result.put("ok",                  true);
            result.put("status",              "PROCESSING");
            result.put("previewType",         WebPConversionService.WEBP_CONTENT_TYPE);
            result.put("originalFilename",    safeFilename);
            result.put("originalS3Key",       originalS3Key);
            result.put("firstPreviewFilename", firstPreviewFilename);
            result.put("fileContentHash",     fileContentHash);
            result.put("message",             "PDF accepted. WebP previews are being generated in the background.");
            return result;
        }

        // Phase 5: Non-PDF path
        // Compute the S3 key before uploading so it can be stored in uploaded_files atomically.
        String s3Key = "batch-pages/" + safeTenantId + "/" + safeBatchId + "/" + safeRecordId + "/" + safeFilename;

        // Record in uploaded_files BEFORE the S3 upload, within this transaction.
        // This prevents a concurrent caller from uploading the same bytes to S3 a second time:
        // the unique constraint blocks the second INSERT until this transaction commits,
        // after which the second caller gets 0 rows and detects the duplicate.
        // If S3 or upsertPageMetadata fails, the transaction rolls back, removing this row too.
        boolean inserted = uploadedFileService.recordIfAbsent(
                tenantId, fileContentHash, safeFilename,
                fileSizeBytes, batchId, recordId, s3Key, "UPLOADED");

        if (!inserted) {
            // Concurrent duplicate committed while we were checking
            Optional<UploadedFile> concurrentDup = uploadedFileService.findNonFailedByHash(tenantId, fileContentHash);
            if (concurrentDup.isPresent()) {
                return buildDuplicateResponse(concurrentDup.get(), fileContentHash, tenantId, batchId, recordId,
                        safeFilename, contentType, fileSizeBytes);
            }
        }

        s3Service.uploadWithRetry(s3Key, bytes, contentType, 2);
        repository.upsertPageMetadataWithHash(
                tenantId, batchId, recordId, safeFilename,
                s3Key, 1, contentType, safeFilename, s3Key,
                null, null, null, fileSizeBytes,
                "READY",
                fileContentHash
        );

        Map<String, Object> manifest = new HashMap<>();
        manifest.put("batchId",  batchId);
        manifest.put("recordId", recordId);
        manifest.put("filename", safeFilename);
        manifest.put("s3Key",    s3Key);
        manifest.put("mimeType", contentType);
        manifest.put("status",   "READY");
        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo(
                "batch-page-manifests", batchId + "_" + recordId + "_" + safeFilename);
        String snapshotPayload = toJson(manifest);
        runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, snapshotPayload));

        Map<String, Object> result = new HashMap<>();
        result.put("ok",             true);
        result.put("status",         "READY");
        result.put("s3Key",          s3Key);
        result.put("filename",       safeFilename);
        result.put("mimeType",       contentType);
        result.put("fileContentHash", fileContentHash);
        result.put("s3Snapshot",     snapshotInfo);
        return result;
    }

    /**
     * Phase 6: Builds the HTTP 200 duplicate response.
     * Returns 200 (not 4xx) so that pgUploadBatchPage() in the frontend does not throw
     * and the batch creation flow continues normally.
     * For non-PDF duplicates, a batch_pages row is created pointing to the existing S3 key
     * so the page can be served from the new batch context.
     */
    private Map<String, Object> buildDuplicateResponse(UploadedFile dup,
                                                        String fileContentHash,
                                                        String tenantId,
                                                        String batchId,
                                                        String recordId,
                                                        String safeFilename,
                                                        String contentType,
                                                        long fileSizeBytes) {
        String existingS3Key = dup.getS3Key();
        boolean isPdfFile    = webpPreviewEnabled && isPdf(contentType, safeFilename);

        // For non-PDF files with a known S3 key, register a batch_pages row for the new
        // batchId pointing to the existing S3 object so it can be fetched after page reload.
        if (!isPdfFile && existingS3Key != null && !existingS3Key.isBlank()) {
            repository.upsertPageMetadataWithHash(
                    tenantId, batchId, recordId, safeFilename,
                    existingS3Key, 1, contentType, safeFilename, existingS3Key,
                    null, null, null, fileSizeBytes,
                    "READY",
                    fileContentHash
            );
        }

        Map<String, Object> result = new HashMap<>();
        result.put("ok",              false);
        result.put("duplicate",       true);
        result.put("shouldBlockExtraction", true);
        result.put("status",          "DUPLICATE_FILE");
        result.put("message",         "This file has already been uploaded for this tenant.");
        result.put("fileContentHash", fileContentHash);
        result.put("existingBatchId",  dup.getBatchId());
        result.put("existingRecordId", dup.getRecordId());
        result.put("existingFileName", dup.getFileName());
        result.put("existingS3Key",    existingS3Key);
        return result;
    }

    private Map<String, Object> toPageResponse(BatchPage page, boolean includePresignedUrl) {
        Map<String, Object> result = new HashMap<>();
        result.put("filename",         page.getFilename());
        result.put("pageNumber",       page.getPageNumber());
        result.put("mimeType",         page.getMimeType());
        result.put("originalFilename", page.getOriginalFilename());
        result.put("status",           page.getStatus());
        result.put("width",            page.getWidth());
        result.put("height",           page.getHeight());
        result.put("sizeBytes",        page.getSizeBytes());
        result.put("quality",          page.getQuality());

        if (page.getS3Key() != null && !page.getS3Key().isBlank()) {
            result.put("s3Key", page.getS3Key());
            if (includePresignedUrl && "READY".equalsIgnoreCase(page.getStatus())) {
                result.put("url", getCachedPresignedUrl(page.getS3Key()));
            }
        }
        if (page.getOriginalS3Key() != null && !page.getOriginalS3Key().isBlank()) {
            result.put("originalS3Key", page.getOriginalS3Key());
            // Generate originalUrl for READY and FAILED: the original PDF is uploaded to S3
            // as the first step of processPdfPreview, before WebP conversion. If conversion
            // fails (FAILED), the original PDF is still in S3 and can be served directly.
            if (includePresignedUrl && ("READY".equalsIgnoreCase(page.getStatus())
                    || "FAILED".equalsIgnoreCase(page.getStatus()))) {
                result.put("originalUrl", getCachedPresignedUrl(page.getOriginalS3Key()));
            }
        }
        return result;
    }

    private String getCachedPresignedUrl(String s3Key) {
        // Tag the cache key with the public endpoint so that switching endpoints
        // (e.g. minio:9000 → localhost:9000) never serves a stale URL from a previous config.
        String endpointTag = (publicEndpointUrl != null && !publicEndpointUrl.isBlank())
                ? publicEndpointUrl.replaceAll("[^a-zA-Z0-9]", "_")
                : "default";
        String cacheKey = "presigned:" + endpointTag + ":" + s3Key;
        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) return cached.get();
        String url = s3Service.getPresignedUrl(s3Key, PRESIGNED_URL_EXPIRY_SECONDS);
        cacheService.set(cacheKey, url, PRESIGNED_URL_CACHE_TTL);
        return url;
    }

    private String resolvedTenantId() {
        String tenantId = TenantContext.getTenantId();
        return tenantId != null ? tenantId : "tenant_default";
    }

    private void runAfterCommit(Runnable runnable) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { runnable.run(); }
            });
        } else {
            runnable.run();
        }
    }

    private boolean isPdf(String contentType, String filename) {
        String type = contentType == null ? "" : contentType.toLowerCase();
        String name = filename == null ? "" : filename.toLowerCase();
        return type.contains("pdf") || name.endsWith(".pdf");
    }

    private String safeSegment(String value) {
        if (value == null) return "unknown";
        String clean = value.replaceAll("[^a-zA-Z0-9._=-]+", "_")
                            .replaceAll("^_+|_+$", "");
        if (clean.isBlank()) clean = "unknown";
        return clean.substring(0, Math.min(clean.length(), 180));
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
