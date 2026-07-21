package com.sadrm.repository;

import com.sadrm.model.UploadedFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UploadedFileRepository extends JpaRepository<UploadedFile, String> {

    @Query(value = "SELECT * FROM uploaded_files WHERE tenant_id = :tenantId AND file_content_hash = :fileContentHash LIMIT 1",
            nativeQuery = true)
    Optional<UploadedFile> findByTenantIdAndFileContentHash(@Param("tenantId") String tenantId,
                                                            @Param("fileContentHash") String fileContentHash);

    /**
     * Inserts a new row only if no row already exists for (tenant_id, file_content_hash).
     * Returns 1 if inserted, 0 if a duplicate was already present (ON CONFLICT DO NOTHING).
     * Safe for concurrent callers — the unique constraint serializes conflicting inserts at DB level.
     */
    @Modifying
    @Query(value = "INSERT INTO uploaded_files " +
            "(id, tenant_id, file_content_hash, hash_algorithm, file_name, file_size_bytes, " +
            " batch_id, record_id, s3_key, upload_status, created_at, updated_at) " +
            "VALUES (:id, :tenantId, :fileContentHash, :hashAlgorithm, :fileName, :fileSizeBytes, " +
            " :batchId, :recordId, :s3Key, :uploadStatus, NOW(), NOW()) " +
            "ON CONFLICT (tenant_id, file_content_hash) DO NOTHING",
            nativeQuery = true)
    int insertIfAbsent(@Param("id") String id,
                       @Param("tenantId") String tenantId,
                       @Param("fileContentHash") String fileContentHash,
                       @Param("hashAlgorithm") String hashAlgorithm,
                       @Param("fileName") String fileName,
                       @Param("fileSizeBytes") long fileSizeBytes,
                       @Param("batchId") String batchId,
                       @Param("recordId") String recordId,
                       @Param("s3Key") String s3Key,
                       @Param("uploadStatus") String uploadStatus);

    /**
     * Marks the row FAILED only if it is currently PROCESSING.
     * Called from async PDF processing when conversion fails, so the file can be retried.
     */
    @Modifying
    @Query(value = "UPDATE uploaded_files SET upload_status = 'FAILED', updated_at = NOW() " +
            "WHERE tenant_id = :tenantId AND file_content_hash = :fileContentHash AND upload_status = 'PROCESSING'",
            nativeQuery = true)
    void markFailedIfProcessing(@Param("tenantId") String tenantId,
                                @Param("fileContentHash") String fileContentHash);
}
