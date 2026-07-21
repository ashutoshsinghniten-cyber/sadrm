package com.sadrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "archived_records")
public class ArchivedRecord {

    @Id
    @Column(name = "id", nullable = false)
    private String id;

    @Column(name = "data", nullable = false, columnDefinition = "jsonb")
    private String data;

    @Column(name = "archived_at", nullable = false, updatable = false)
    private OffsetDateTime archivedAt;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @Column(name = "last_modified_by")
    private String lastModifiedBy;

    @Column(name = "flagged", nullable = false)
    private boolean flagged;

    @Column(name = "flag_reason")
    private String flagReason;

    @Column(name = "flagged_by")
    private String flaggedBy;

    @Column(name = "flagged_at")
    private OffsetDateTime flaggedAt;

    public ArchivedRecord() {
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getData() { return data; }
    public void setData(String data) { this.data = data; }

    public OffsetDateTime getArchivedAt() { return archivedAt; }
    public void setArchivedAt(OffsetDateTime archivedAt) { this.archivedAt = archivedAt; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }

    public String getLastModifiedBy() { return lastModifiedBy; }
    public void setLastModifiedBy(String lastModifiedBy) { this.lastModifiedBy = lastModifiedBy; }

    public boolean isFlagged() { return flagged; }
    public void setFlagged(boolean flagged) { this.flagged = flagged; }

    public String getFlagReason() { return flagReason; }
    public void setFlagReason(String flagReason) { this.flagReason = flagReason; }

    public String getFlaggedBy() { return flaggedBy; }
    public void setFlaggedBy(String flaggedBy) { this.flaggedBy = flaggedBy; }

    public OffsetDateTime getFlaggedAt() { return flaggedAt; }
    public void setFlaggedAt(OffsetDateTime flaggedAt) { this.flaggedAt = flaggedAt; }
}
