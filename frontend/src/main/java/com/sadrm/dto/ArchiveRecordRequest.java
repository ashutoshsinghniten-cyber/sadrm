package com.sadrm.dto;

import java.util.List;
import java.util.Map;

public class ArchiveRecordRequest {

    private List<Map<String, Object>> records;

    public ArchiveRecordRequest() {}

    public List<Map<String, Object>> getRecords() { return records; }
    public void setRecords(List<Map<String, Object>> records) { this.records = records; }
}
