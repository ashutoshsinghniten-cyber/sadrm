package com.sadrm.repository;

import com.sadrm.model.BatchPage;
import com.sadrm.model.BatchPageId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BatchPageRepository extends JpaRepository<BatchPage, BatchPageId> {

    @Query(value = "SELECT * FROM batch_pages WHERE tenant_id = :tenantId AND batch_id = :batchId AND record_id = :recordId AND filename = :filename",
            nativeQuery = true)
    Optional<BatchPage> findByTenantIdAndBatchIdAndRecordIdAndFilename(@Param("tenantId") String tenantId,
                                                                        @Param("batchId") String batchId,
                                                                        @Param("recordId") String recordId,
                                                                        @Param("filename") String filename);

    @Query(value = "SELECT * FROM batch_pages WHERE tenant_id = :tenantId AND batch_id = :batchId AND record_id = :recordId AND original_filename = :originalFilename ORDER BY page_number ASC LIMIT 1",
            nativeQuery = true)
    Optional<BatchPage> findByTenantIdAndBatchIdAndRecordIdAndOriginalFilename(@Param("tenantId") String tenantId,
                                                                                @Param("batchId") String batchId,
                                                                                @Param("recordId") String recordId,
                                                                                @Param("originalFilename") String originalFilename);

    @Query(value = "SELECT * FROM batch_pages WHERE tenant_id = :tenantId AND batch_id = :batchId AND record_id = :recordId ORDER BY page_number ASC, filename ASC",
            nativeQuery = true)
    List<BatchPage> findByTenantIdAndBatchIdAndRecordIdOrdered(@Param("tenantId") String tenantId,
                                                                @Param("batchId") String batchId,
                                                                @Param("recordId") String recordId);

    @Modifying
    @Query(value = "INSERT INTO batch_pages " +
            "(tenant_id, batch_id, record_id, filename, file_base64, s3_key, page_number, mime_type, original_filename, " +
            " original_s3_key, quality, width, height, size_bytes, status) " +
            "VALUES (:tenantId, :batchId, :recordId, :filename, '', :s3Key, :pageNumber, :mimeType, :originalFilename, " +
            " :originalS3Key, :quality, :width, :height, :sizeBytes, :status) " +
            "ON CONFLICT (tenant_id, batch_id, record_id, filename) DO UPDATE SET " +
            "s3_key = :s3Key, page_number = :pageNumber, mime_type = :mimeType, " +
            "original_filename = :originalFilename, original_s3_key = :originalS3Key, quality = :quality, " +
            "width = :width, height = :height, size_bytes = :sizeBytes, status = :status",
            nativeQuery = true)
    void upsertPageMetadata(@Param("tenantId") String tenantId,
                            @Param("batchId") String batchId,
                            @Param("recordId") String recordId,
                            @Param("filename") String filename,
                            @Param("s3Key") String s3Key,
                            @Param("pageNumber") int pageNumber,
                            @Param("mimeType") String mimeType,
                            @Param("originalFilename") String originalFilename,
                            @Param("originalS3Key") String originalS3Key,
                            @Param("quality") Double quality,
                            @Param("width") Integer width,
                            @Param("height") Integer height,
                            @Param("sizeBytes") Long sizeBytes,
                            @Param("status") String status);

    /**
     * Like upsertPageMetadata but also stores the SHA-256 file_content_hash.
     * Used for new uploads and duplicate re-registrations so the audit trail is populated.
     * The existing upsertPageMetadata() is left unchanged for backward compatibility
     * with BatchPageProcessingService (WebP preview pages do not carry the original hash).
     */
    @Modifying
    @Query(value = "INSERT INTO batch_pages " +
            "(tenant_id, batch_id, record_id, filename, file_base64, s3_key, page_number, mime_type, original_filename, " +
            " original_s3_key, quality, width, height, size_bytes, status, file_content_hash) " +
            "VALUES (:tenantId, :batchId, :recordId, :filename, '', :s3Key, :pageNumber, :mimeType, :originalFilename, " +
            " :originalS3Key, :quality, :width, :height, :sizeBytes, :status, :fileContentHash) " +
            "ON CONFLICT (tenant_id, batch_id, record_id, filename) DO UPDATE SET " +
            "s3_key = :s3Key, page_number = :pageNumber, mime_type = :mimeType, " +
            "original_filename = :originalFilename, original_s3_key = :originalS3Key, quality = :quality, " +
            "width = :width, height = :height, size_bytes = :sizeBytes, status = :status, " +
            "file_content_hash = :fileContentHash",
            nativeQuery = true)
    void upsertPageMetadataWithHash(@Param("tenantId") String tenantId,
                                    @Param("batchId") String batchId,
                                    @Param("recordId") String recordId,
                                    @Param("filename") String filename,
                                    @Param("s3Key") String s3Key,
                                    @Param("pageNumber") int pageNumber,
                                    @Param("mimeType") String mimeType,
                                    @Param("originalFilename") String originalFilename,
                                    @Param("originalS3Key") String originalS3Key,
                                    @Param("quality") Double quality,
                                    @Param("width") Integer width,
                                    @Param("height") Integer height,
                                    @Param("sizeBytes") Long sizeBytes,
                                    @Param("status") String status,
                                    @Param("fileContentHash") String fileContentHash);

    @Modifying
    @Query(value = "UPDATE batch_pages SET status = 'FAILED' " +
            "WHERE tenant_id = :tenantId AND batch_id = :batchId AND record_id = :recordId AND original_filename = :originalFilename",
            nativeQuery = true)
    void markPagesFailed(@Param("tenantId") String tenantId,
                         @Param("batchId") String batchId,
                         @Param("recordId") String recordId,
                         @Param("originalFilename") String originalFilename);
}
