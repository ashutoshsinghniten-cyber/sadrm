package com.sadrm.dto;

public class LockResponse {

    private boolean ok;
    private String batchId;
    private String recordId;
    private String lockedBy;
    private String lockedAt;
    private String expiresAt;

    public LockResponse() {}

    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }

    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }

    public String getRecordId() { return recordId; }
    public void setRecordId(String recordId) { this.recordId = recordId; }

    public String getLockedBy() { return lockedBy; }
    public void setLockedBy(String lockedBy) { this.lockedBy = lockedBy; }

    public String getLockedAt() { return lockedAt; }
    public void setLockedAt(String lockedAt) { this.lockedAt = lockedAt; }

    public String getExpiresAt() { return expiresAt; }
    public void setExpiresAt(String expiresAt) { this.expiresAt = expiresAt; }
}
