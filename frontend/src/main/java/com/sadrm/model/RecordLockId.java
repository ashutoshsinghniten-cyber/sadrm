package com.sadrm.model;

import java.io.Serializable;
import java.util.Objects;

public class RecordLockId implements Serializable {

    private String tenantId;
    private String batchId;
    private String recordId;

    public RecordLockId() {
    }

    public RecordLockId(String tenantId, String batchId, String recordId) {
        this.tenantId = tenantId;
        this.batchId  = batchId;
        this.recordId = recordId;
    }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }

    public String getRecordId() { return recordId; }
    public void setRecordId(String recordId) { this.recordId = recordId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RecordLockId that)) return false;
        return Objects.equals(tenantId, that.tenantId)
                && Objects.equals(batchId, that.batchId)
                && Objects.equals(recordId, that.recordId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(tenantId, batchId, recordId);
    }
}
