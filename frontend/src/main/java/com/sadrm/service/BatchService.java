package com.sadrm.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sadrm.exception.AppException;
import com.sadrm.model.Batch;
import com.sadrm.repository.BatchRepository;
import com.sadrm.security.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class BatchService {

    private static final Logger log = LoggerFactory.getLogger(BatchService.class);

    private final BatchRepository batchRepository;
    private static final Duration BATCH_LIST_CACHE_TTL = Duration.ofSeconds(30);
    private static final Duration BATCH_CACHE_TTL      = Duration.ofSeconds(60);

    private final WorkflowSnapshotService snapshotService;
    private final SseService sseService;
    private final ObjectMapper objectMapper;
    private final CacheService cacheService;

    public BatchService(BatchRepository batchRepository,
                        WorkflowSnapshotService snapshotService,
                        SseService sseService,
                        ObjectMapper objectMapper,
                        CacheService cacheService) {
        this.batchRepository = batchRepository;
        this.snapshotService  = snapshotService;
        this.sseService       = sseService;
        this.objectMapper     = objectMapper;
        this.cacheService     = cacheService;
    }

    // ── READ ─────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getAll(String statusFilter) {
        return getAll(statusFilter, null, null);
    }

    public List<Map<String, Object>> getAll(String statusFilter, Integer limit, Integer offset) {
        String tenantId  = TenantContext.getTenantId();
        int safeOffset   = sanitizeOffset(offset);
        int safeLimit    = sanitizeLimit(limit);
        String cacheKey  = tenantCachePrefix() + "batches:list:status=" + normalizeStatus(statusFilter)
                + ":limit=" + safeLimit
                + ":offset=" + safeOffset;

        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) {
            try {
                return objectMapper.readValue(cached.get(), List.class);
            } catch (Exception ignored) {
            }
        }

        // Always use the paginated repository path — no unbounded SELECT allowed.
        List<Batch> rows;
        if (tenantId != null) {
            rows = statusFilter != null
                    ? batchRepository.findByTenantIdAndStatusPaged(tenantId, statusFilter, safeLimit, safeOffset)
                    : batchRepository.findAllByTenantIdPaged(tenantId, safeLimit, safeOffset);
        } else {
            // superadmin — cross-tenant
            rows = statusFilter != null
                    ? batchRepository.findByStatusOrderByUpdatedAtDescPaged(statusFilter, safeLimit, safeOffset)
                    : batchRepository.findAllOrderByUpdatedAtDescPaged(safeLimit, safeOffset);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Batch b : rows) {
            try {
                Map<String, Object> item = objectMapper.readValue(b.getData(), Map.class);
                item.put("_serverUpdatedAt", b.getUpdatedAt());
                result.add(item);
            } catch (Exception e) {
                log.warn("Failed to parse batch data: id='{}'", b.getId());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("id", b.getId());
                fallback.put("_serverUpdatedAt", b.getUpdatedAt());
                result.add(fallback);
            }
        }
        cacheJson(cacheKey, result, BATCH_LIST_CACHE_TTL);
        return result;
    }

    public List<Map<String, Object>> getSummary(String statusFilter) {
        return getSummary(statusFilter, null, null);
    }

    public List<Map<String, Object>> getSummary(String statusFilter, Integer limit, Integer offset) {
        String tenantId  = TenantContext.getTenantId();
        int safeOffset   = sanitizeOffset(offset);
        int safeLimit    = sanitizeLimit(limit);
        String cacheKey  = tenantCachePrefix() + "batches:summary:status=" + normalizeStatus(statusFilter)
                + ":limit=" + safeLimit
                + ":offset=" + safeOffset;

        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) {
            try {
                return objectMapper.readValue(cached.get(), List.class);
            } catch (Exception ignored) {
            }
        }

        // Always use the paginated repository path — no unbounded SELECT allowed.
        List<Object[]> rows;
        if (tenantId != null) {
            rows = statusFilter != null
                    ? batchRepository.findSummaryByTenantIdAndStatusPaged(tenantId, statusFilter, safeLimit, safeOffset)
                    : batchRepository.findSummaryByTenantIdPaged(tenantId, safeLimit, safeOffset);
        } else {
            // superadmin — cross-tenant
            rows = statusFilter != null
                    ? batchRepository.findSummaryByStatusPaged(statusFilter, safeLimit, safeOffset)
                    : batchRepository.findSummaryAllPaged(safeLimit, safeOffset);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Object[] row : rows) {
            Map<String, Object> item = new HashMap<>();
            item.put("id",          row[0]);
            item.put("status",      row[1]);
            item.put("pages",       row[2] != null ? ((Number) row[2]).intValue() : 0);
            item.put("recordCount", row[3] != null ? ((Number) row[3]).intValue() : 0);
            item.put("updatedAt",   row[4]);
            item.put("_summary",    true);
            result.add(item);
        }
        cacheJson(cacheKey, result, BATCH_LIST_CACHE_TTL);
        return result;
    }

    public Map<String, Object> getById(String batchId) {
        String cacheKey = tenantCachePrefix() + "batch:" + batchId;
        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) {
            try {
                return objectMapper.readValue(cached.get(), Map.class);
            } catch (Exception ignored) {
            }
        }

        Batch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Batch not found."));

        // Tenant-scoped access check
        String tenantId = TenantContext.getTenantId();
        if (tenantId != null && !tenantId.equals(batch.getTenantId())) {
            throw new AppException(HttpStatus.NOT_FOUND, "Batch not found.");
        }

        try {
            Map<String, Object> item = objectMapper.readValue(batch.getData(), Map.class);
            item.put("_serverUpdatedAt", batch.getUpdatedAt());
            cacheJson(cacheKey, item, BATCH_CACHE_TTL);
            return item;
        } catch (Exception e) {
            throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not parse batch data.");
        }
    }

    // ── WRITE ─────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> bulkUpsert(List<Map<String, Object>> items, boolean allowReplace) {
        String tenantId = TenantContext.getTenantId();
        if (allowReplace) {
            if (tenantId != null) {
                batchRepository.deleteAllByTenantId(tenantId);
            } else {
                batchRepository.deleteAll();
            }
        }

        List<Map<String, Object>> snapshotErrors = new ArrayList<>();
        for (Map<String, Object> item : items) {
            String id = String.valueOf(item.get("id"));
            Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("batches", id);
            Map<String, Object> toStore = stripBinaryFields(item);
            toStore.put("_s3WorkflowSnapshot", snapshotInfo);

            String snapshotPayload = toJson(item);
            batchRepository.upsertBatch(id, tenantId != null ? tenantId : "tenant_default", toJson(toStore));
            runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, snapshotPayload));
            invalidateBatchCaches(id, tenantId);
        }

        log.info("Bulk upsert: count={}, mode={}, tenant='{}'", items.size(), allowReplace ? "replace" : "upsert", tenantId);
        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("mode", allowReplace ? "replace" : "upsert");
        result.put("snapshotErrors", snapshotErrors);
        return result;
    }

    @Transactional
    public Map<String, Object> patch(String batchId, Map<String, Object> body) {
        Optional<Batch> existing = batchRepository.findById(batchId);

        // Tenant-scoped access check
        String tenantId = TenantContext.getTenantId();
        if (existing.isPresent() && tenantId != null && !tenantId.equals(existing.get().getTenantId())) {
            throw new AppException(HttpStatus.NOT_FOUND, "Batch not found.");
        }

        boolean mergedStaleUpdate = false;
        Map<String, Object> incomingData = new HashMap<>(body);
        incomingData.remove("_serverUpdatedAt");
        incomingData.put("id", batchId);

        if (existing.isPresent() && body.containsKey("_serverUpdatedAt")) {
            try {
                long clientTs = parseTimestamp(body.get("_serverUpdatedAt"));
                long dbTs     = existing.get().getUpdatedAt().toInstant().toEpochMilli();
                if (dbTs - clientTs > 1000) {
                    mergedStaleUpdate = true;
                    Map<String, Object> existingData = objectMapper.readValue(
                            existing.get().getData(), Map.class);
                    incomingData = mergeBatchWorkflowData(existingData, incomingData);
                }
            } catch (Exception ignored) {
            }
        }

        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("batches", batchId);
        Map<String, Object> toStore = stripBinaryFields(incomingData);
        toStore.put("_s3WorkflowSnapshot", snapshotInfo);

        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        String snapshotPayload  = toJson(incomingData);
        batchRepository.upsertBatch(batchId, resolvedTenantId, toJson(toStore));
        OffsetDateTime updatedAt = batchRepository.findById(batchId)
                .map(Batch::getUpdatedAt)
                .orElse(OffsetDateTime.now());
        runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, snapshotPayload));

        invalidateBatchCaches(batchId, tenantId);
        sseService.broadcastBatchUpdate(batchId, tenantId);

        log.info("Batch patched: id='{}', tenant='{}', mergedStale={}", batchId, tenantId, mergedStaleUpdate);
        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("id", batchId);
        result.put("updatedAt", updatedAt);
        result.put("mergedStaleUpdate", mergedStaleUpdate);
        result.put("s3Snapshot", snapshotInfo);
        return result;
    }

    // ── MERGE LOGIC ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> mergeBatchWorkflowData(Map<String, Object> existing,
                                                        Map<String, Object> incoming) {
        try {
            ObjectNode existingNode = (ObjectNode) objectMapper.readTree(toJson(existing));
            ObjectNode incomingNode = (ObjectNode) objectMapper.readTree(toJson(incoming));

            ObjectNode merged = existingNode.deepCopy();
            incomingNode.fields().forEachRemaining(e -> {
                if (!e.getKey().equals("records")) merged.set(e.getKey(), e.getValue());
            });

            String idVal = incomingNode.has("id") ? incomingNode.get("id").asText()
                         : existingNode.has("id")  ? existingNode.get("id").asText()
                         : null;
            if (idVal != null) merged.put("id", idVal);

            boolean existHasRecords = existingNode.has("records") && existingNode.get("records").isArray();
            boolean incomHasRecords = incomingNode.has("records") && incomingNode.get("records").isArray();
            if (existHasRecords || incomHasRecords) {
                ArrayNode exArr = existHasRecords ? (ArrayNode) existingNode.get("records") : objectMapper.createArrayNode();
                ArrayNode inArr = incomHasRecords ? (ArrayNode) incomingNode.get("records") : objectMapper.createArrayNode();
                merged.set("records", mergeRecordsForBatch(exArr, inArr));
            }

            return objectMapper.convertValue(merged, Map.class);
        } catch (Exception e) {
            return incoming;
        }
    }

    private ArrayNode mergeRecordsForBatch(ArrayNode existing, ArrayNode incoming) {
        LinkedHashMap<String, ObjectNode> merged = new LinkedHashMap<>();
        int i = 0;
        for (JsonNode item : existing) merged.put(entityMergeKey(item, i++), (ObjectNode) item);
        int j = 0;
        for (JsonNode item : incoming) {
            String key = entityMergeKey(item, j++);
            ObjectNode prev = merged.get(key);
            merged.put(key, prev != null ? mergePagesForRecord(prev, (ObjectNode) item) : (ObjectNode) item);
        }
        ArrayNode result = objectMapper.createArrayNode();
        merged.values().forEach(result::add);
        return result;
    }

    private ObjectNode mergePagesForRecord(ObjectNode existing, ObjectNode incoming) {
        boolean existHasPages = existing.has("pages") && existing.get("pages").isArray();
        boolean incomHasPages = incoming.has("pages") && incoming.get("pages").isArray();

        if (!existHasPages || !incomHasPages) {
            ObjectNode merged = existing.deepCopy();
            incoming.fields().forEachRemaining(e -> merged.set(e.getKey(), e.getValue()));
            return merged;
        }

        LinkedHashMap<String, ObjectNode> mergedPages = new LinkedHashMap<>();
        int i = 0;
        for (JsonNode p : (ArrayNode) existing.get("pages")) mergedPages.put(entityMergeKey(p, i++), (ObjectNode) p);
        int j = 0;
        for (JsonNode p : (ArrayNode) incoming.get("pages")) {
            String key = entityMergeKey(p, j++);
            ObjectNode prev = mergedPages.get(key);
            if (prev != null) {
                ObjectNode mergedPage = prev.deepCopy();
                p.fields().forEachRemaining(e -> mergedPage.set(e.getKey(), e.getValue()));
                mergedPages.put(key, mergedPage);
            } else {
                mergedPages.put(key, (ObjectNode) p);
            }
        }

        ObjectNode result = existing.deepCopy();
        incoming.fields().forEachRemaining(e -> { if (!e.getKey().equals("pages")) result.set(e.getKey(), e.getValue()); });
        ArrayNode pagesArr = objectMapper.createArrayNode();
        mergedPages.values().forEach(pagesArr::add);
        result.set("pages", pagesArr);
        return result;
    }

    private String entityMergeKey(JsonNode item, int index) {
        if (item == null || !item.isObject()) return "__index_" + index;
        for (String field : new String[]{"recordId", "id", "pageId", "pageNumber", "fileName", "filename", "name"}) {
            if (item.has(field) && !item.get(field).isNull()) return item.get(field).asText();
        }
        return "__index_" + index;
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    private String tenantCachePrefix() {
        String tenantId = TenantContext.getTenantId();
        return tenantId != null ? tenantId + ":" : "global:";
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> stripBinaryFields(Map<String, Object> map) {
        try {
            return objectMapper.convertValue(stripBinaryNode(objectMapper.readTree(toJson(map))), Map.class);
        } catch (Exception e) {
            return map;
        }
    }

    private JsonNode stripBinaryNode(JsonNode node) {
        if (node.isArray()) {
            ArrayNode arr = objectMapper.createArrayNode();
            for (JsonNode item : node) arr.add(stripBinaryNode(item));
            return arr;
        }
        if (node.isObject()) {
            ObjectNode obj = objectMapper.createObjectNode();
            node.fields().forEachRemaining(entry -> {
                if (!entry.getKey().equals("file") && !entry.getKey().equals("fileBase64")) {
                    obj.set(entry.getKey(), stripBinaryNode(entry.getValue()));
                }
            });
            return obj;
        }
        return node;
    }

    private void cacheJson(String key, Object value, Duration ttl) {
        try {
            cacheService.set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (Exception ignored) {
        }
    }

    private void invalidateBatchCaches(String batchId, String tenantId) {
        String prefix = tenantId != null ? tenantId + ":" : "global:";
        cacheService.delete(prefix + "batch:" + batchId);
        cacheService.deleteByPattern(prefix + "batches:list:*");
        cacheService.deleteByPattern(prefix + "batches:summary:*");
    }

    private void runAfterCommit(Runnable runnable) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { runnable.run(); }
            });
        } else {
            runnable.run();
        }
    }

    private String normalizeStatus(String status) {
        return status == null || status.isBlank() ? "all" : status;
    }

    private int sanitizeOffset(Integer offset) {
        return Math.max(0, offset == null ? 0 : offset);
    }

    /** Always returns a positive limit. null / 0 / negative → default 100. Hard cap 500. */
    private int sanitizeLimit(Integer limit) {
        if (limit == null || limit <= 0) return 100;
        return Math.min(500, limit);
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            throw new RuntimeException("JSON serialization failed.", e);
        }
    }

    private long parseTimestamp(Object ts) {
        if (ts instanceof Number n) return n.longValue();
        if (ts instanceof String s) return OffsetDateTime.parse(s).toInstant().toEpochMilli();
        return 0L;
    }
}
