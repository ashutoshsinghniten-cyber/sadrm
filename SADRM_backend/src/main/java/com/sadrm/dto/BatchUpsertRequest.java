package com.sadrm.dto;

import java.util.List;
import java.util.Map;

public class BatchUpsertRequest {

    private List<Map<String, Object>> batches;

    public BatchUpsertRequest() {}

    public List<Map<String, Object>> getBatches() { return batches; }
    public void setBatches(List<Map<String, Object>> batches) { this.batches = batches; }
}
