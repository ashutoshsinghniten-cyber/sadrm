package com.sadrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "record_locks")
@IdClass(RecordLockId.class)
public class RecordLock {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Id
    @Column(name = "batch_id", nullable = false)
    private String batchId;

    @Id
    @Column(name = "record_id", nullable = false)
    private String recordId;

    @Column(name = "locked_by", nullable = false)
    private String lockedBy;

    @Column(name = "locked_at", nullable = false)
    private OffsetDateTime lockedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    public RecordLock() {
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

    public String getLockedBy() {
        return lockedBy;
    }

    public void setLockedBy(String lockedBy) {
        this.lockedBy = lockedBy;
    }

    public OffsetDateTime getLockedAt() {
        return lockedAt;
    }

    public void setLockedAt(OffsetDateTime lockedAt) {
        this.lockedAt = lockedAt;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }
}
