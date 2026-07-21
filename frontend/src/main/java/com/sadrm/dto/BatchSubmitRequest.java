package com.sadrm.dto;

import java.util.List;

public class BatchSubmitRequest {

    private List<BatchExtractionItem> records;

    public BatchSubmitRequest() {
    }

    public List<BatchExtractionItem> getRecords() {
        return records;
    }

    public void setRecords(List<BatchExtractionItem> records) {
        this.records = records;
    }
}
