package com.sadrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "batch_pages")
@IdClass(BatchPageId.class)
public class BatchPage {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Id
    @Column(name = "batch_id", nullable = false)
    private String batchId;

    @Id
    @Column(name = "record_id", nullable = false)
    private String recordId;

    @Id
    @Column(name = "filename", nullable = false)
    private String filename;

    @Column(name = "file_base64", nullable = false, columnDefinition = "TEXT")
    private String fileBase64;

    @Column(name = "s3_key")
    private String s3Key;

    @Column(name = "page_number", nullable = false)
    private Integer pageNumber = 1;

    @Column(name = "mime_type")
    private String mimeType;

    @Column(name = "original_filename")
    private String originalFilename;

    @Column(name = "original_s3_key")
    private String originalS3Key;

    @Column(name = "quality")
    private Double quality;

    @Column(name = "width")
    private Integer width;

    @Column(name = "height")
    private Integer height;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "status", nullable = false)
    private String status = "READY";

    @Column(name = "file_content_hash")
    private String fileContentHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public BatchPage() {
    }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getBatchId() {
        return batchId;
    }

    public void setBatchId(String batchId) {
        this.batchId = batchId;
    }

    public String getRecordId() {
        return recordId;
    }

    public void setRecordId(String recordId) {
        this.recordId = recordId;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getFileBase64() {
        return fileBase64;
    }

    public void setFileBase64(String fileBase64) {
        this.fileBase64 = fileBase64;
    }

    public String getS3Key() {
        return s3Key;
    }

    public void setS3Key(String s3Key) {
        this.s3Key = s3Key;
    }

    public Integer getPageNumber() {
        return pageNumber;
    }

    public void setPageNumber(Integer pageNumber) {
        this.pageNumber = pageNumber;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public void setOriginalFilename(String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public String getOriginalS3Key() {
        return originalS3Key;
    }

    public void setOriginalS3Key(String originalS3Key) {
        this.originalS3Key = originalS3Key;
    }

    public Double getQuality() {
        return quality;
    }

    public void setQuality(Double quality) {
        this.quality = quality;
    }

    public Integer getWidth() {
        return width;
    }

    public void setWidth(Integer width) {
        this.width = width;
    }

    public Integer getHeight() {
        return height;
    }

    public void setHeight(Integer height) {
        this.height = height;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(Long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getFileContentHash() { return fileContentHash; }
    public void setFileContentHash(String fileContentHash) { this.fileContentHash = fileContentHash; }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
