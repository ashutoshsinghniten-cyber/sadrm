package com.sadrm.model;

import java.io.Serializable;
import java.util.Objects;

public class BatchPageId implements Serializable {

    private String tenantId;
    private String batchId;
    private String recordId;
    private String filename;

    public BatchPageId() {
    }

    public BatchPageId(String tenantId, String batchId, String recordId, String filename) {
        this.tenantId = tenantId;
        this.batchId  = batchId;
        this.recordId = recordId;
        this.filename = filename;
    }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }

    public String getRecordId() { return recordId; }
    public void setRecordId(String recordId) { this.recordId = recordId; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof BatchPageId that)) return false;
        return Objects.equals(tenantId, that.tenantId)
                && Objects.equals(batchId, that.batchId)
                && Objects.equals(recordId, that.recordId)
                && Objects.equals(filename, that.filename);
    }

    @Override
    public int hashCode() {
        return Objects.hash(tenantId, batchId, recordId, filename);
    }
}
