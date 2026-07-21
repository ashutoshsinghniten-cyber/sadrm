package com.sadrm.dto;

public class BatchSummaryDto {

    private String id;
    private String status;
    private int totalRecords;
    private String updatedAt;

    public BatchSummaryDto() {}

    public BatchSummaryDto(String id, String status, int totalRecords, String updatedAt) {
        this.id           = id;
        this.status       = status;
        this.totalRecords = totalRecords;
        this.updatedAt    = updatedAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getTotalRecords() { return totalRecords; }
    public void setTotalRecords(int totalRecords) { this.totalRecords = totalRecords; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
