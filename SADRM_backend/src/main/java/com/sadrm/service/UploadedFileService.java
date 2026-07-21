package com.sadrm.service;

import com.sadrm.model.UploadedFile;
import com.sadrm.repository.UploadedFileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class UploadedFileService {

    private final UploadedFileRepository repository;

    public UploadedFileService(UploadedFileRepository repository) {
        this.repository = repository;
    }

    /**
     * Returns the existing uploaded_files row for this tenant + content hash + filename,
     * but only if its upload_status is not FAILED (FAILED uploads may be retried).
     * Filename is part of the match so that two different files which merely happen to
     * share identical byte content (e.g. a reused blank/boilerplate page) are not
     * treated as duplicates of each other — only a genuine re-upload of the same
     * named file is.
     */
    public Optional<UploadedFile> findNonFailedByHash(String tenantId, String fileContentHash, String fileName) {
        return repository.findByTenantIdAndFileContentHashAndFileName(tenantId, fileContentHash, fileName)
                .filter(f -> !"FAILED".equalsIgnoreCase(f.getUploadStatus()));
    }

    /**
     * Attempts to record a new uploaded file entry.
     * Uses ON CONFLICT DO NOTHING — safe for concurrent callers.
     * Returns true if a new row was inserted (this caller "won" the race),
     * false if a duplicate already existed in the DB.
     * Must be called within the outer @Transactional scope so the insert
     * is rolled back together with batch_pages on S3 failure.
     */
    @Transactional
    public boolean recordIfAbsent(String tenantId, String fileContentHash, String fileName,
                                  long fileSizeBytes, String batchId, String recordId,
                                  String s3Key, String uploadStatus) {
        int rows = repository.insertIfAbsent(
                UUID.randomUUID().toString(),
                tenantId,
                fileContentHash,
                "SHA-256",
                fileName,
                fileSizeBytes,
                batchId,
                recordId,
                s3Key,
                uploadStatus
        );
        return rows > 0;
    }

    /**
     * Marks the uploaded_files row FAILED if it is currently PROCESSING.
     * Runs in its own transaction (REQUIRES_NEW) so it commits even if called
     * from within a failing async transaction in BatchPageProcessingService.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailedIfProcessing(String tenantId, String fileContentHash, String fileName) {
        repository.markFailedIfProcessing(tenantId, fileContentHash, fileName);
    }
}
