package com.sadrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sadrm.repository.BatchPageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class BatchPageProcessingService {

    private static final Logger log = LoggerFactory.getLogger(BatchPageProcessingService.class);

    private final BatchPageRepository repository;

    private final S3Service s3Service;
    private final WebPConversionService webPConversionService;
    private final WorkflowSnapshotService snapshotService;
    private final UploadedFileService uploadedFileService;
    private final ObjectMapper objectMapper;

    public BatchPageProcessingService(BatchPageRepository repository,
                                      S3Service s3Service,
                                      WebPConversionService webPConversionService,
                                      WorkflowSnapshotService snapshotService,
                                      UploadedFileService uploadedFileService,
                                      ObjectMapper objectMapper) {
        this.repository          = repository;
        this.s3Service           = s3Service;
        this.webPConversionService = webPConversionService;
        this.snapshotService     = snapshotService;
        this.uploadedFileService = uploadedFileService;
        this.objectMapper        = objectMapper;
    }

    @Async("webpExecutor")
    @Transactional
    public CompletableFuture<Void> processPdfPreview(String tenantId,
                                                      String batchId,
                                                      String recordId,
                                                      String originalFilename,
                                                      String originalS3Key,
                                                      byte[] pdfBytes,
                                                      String fileContentHash) {
        try {
            s3Service.uploadWithRetry(originalS3Key, pdfBytes, "application/pdf", 2);

            List<WebPConversionService.RenderedPreviewPage> pages =
                    webPConversionService.convertPdfToWebP(pdfBytes, originalFilename);

            String safeTenantId = safeSegment(tenantId);
            String safeBatchId  = safeSegment(batchId);
            String safeRecordId = safeSegment(recordId);

            for (WebPConversionService.RenderedPreviewPage page : pages) {
                String pageKey = "batch-pages/" + safeTenantId + "/" + safeBatchId + "/" + safeRecordId + "/preview/" + page.filename();
                s3Service.uploadWithRetry(pageKey, page.bytes(), page.contentType(), 2);
                repository.upsertPageMetadata(
                        tenantId,
                        batchId,
                        recordId,
                        page.filename(),
                        pageKey,
                        page.pageNumber(),
                        page.contentType(),
                        originalFilename,
                        originalS3Key,
                        (double) page.quality(),
                        page.width(),
                        page.height(),
                        (long) page.bytes().length,
                        "READY"
                );
            }

            Map<String, Object> manifest = new HashMap<>();
            manifest.put("batchId",          batchId);
            manifest.put("recordId",         recordId);
            manifest.put("tenantId",         tenantId);
            manifest.put("originalFilename", originalFilename);
            manifest.put("originalS3Key",    originalS3Key);
            manifest.put("previewType",      WebPConversionService.WEBP_CONTENT_TYPE);
            manifest.put("pageCount",        pages.size());
            manifest.put("status",           "READY");
            Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo(
                    "batch-page-manifests", batchId + "_" + recordId + "_" + originalFilename);
            snapshotService.persistPreparedAsync(snapshotInfo, objectMapper.writeValueAsString(manifest));
        } catch (Exception e) {
            log.error("PDF to WebP processing failed for tenantId={}, batchId={}, recordId={}, filename={}: {}",
                    tenantId, batchId, recordId, originalFilename, e.getMessage(), e);
            repository.markPagesFailed(tenantId, batchId, recordId, originalFilename);
            // Phase 9/10: Mark uploaded_files FAILED so the file can be retried on next upload.
            // Uses REQUIRES_NEW so this commit is independent of any transaction rollback here.
            if (fileContentHash != null && !fileContentHash.isBlank()) {
                uploadedFileService.markFailedIfProcessing(tenantId, fileContentHash, originalFilename);
            }
        }
        return CompletableFuture.completedFuture(null);
    }

    private String safeSegment(String value) {
        if (value == null) return "unknown";
        String clean = value.replaceAll("[^a-zA-Z0-9._=-]+", "_")
                            .replaceAll("^_+|_+$", "");
        if (clean.isBlank()) clean = "unknown";
        return clean.substring(0, Math.min(clean.length(), 180));
    }
}
