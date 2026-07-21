package com.sadrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sadrm.exception.AppException;
import com.sadrm.model.ArchivedRecord;
import com.sadrm.repository.ArchivedRecordRepository;
import com.sadrm.security.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ArchivedRecordService {

    private static final Duration ARCHIVED_RECORD_CACHE_TTL = Duration.ofSeconds(60);

    private final ArchivedRecordRepository repository;
    private final WorkflowSnapshotService snapshotService;
    private final ObjectMapper objectMapper;
    private final CacheService cacheService;

    @PersistenceContext
    private EntityManager entityManager;

    public ArchivedRecordService(ArchivedRecordRepository repository,
                                 WorkflowSnapshotService snapshotService,
                                 ObjectMapper objectMapper,
                                 CacheService cacheService) {
        this.repository      = repository;
        this.snapshotService = snapshotService;
        this.objectMapper    = objectMapper;
        this.cacheService    = cacheService;
    }

    /**
     * Backward-compatible overload — no search or sort params.
     * Delegated to by internal callers that don't need search.
     */
    public Map<String, Object> getAll(int offset, int limit) {
        return getAll(offset, limit, null, null, null);
    }

    /**
     * Full search overload: server-side text search (q), bank ILIKE filter, and sort order.
     *
     * @param q       Free-text substring to match against the full JSONB blob (data::text ILIKE).
     * @param bank    Comma-separated bank name substrings (ILIKE each). Null/blank = no bank filter.
     * @param sortBy  recent | amount-desc | amount-asc | donor-asc  (default: recent)
     */
    public Map<String, Object> getAll(int offset, int limit, String q, String bank, String sortBy) {
        String tenantId  = TenantContext.getTenantId();
        int safeOffset   = Math.max(0, offset);
        int safeLimit    = (limit <= 0) ? 100 : Math.min(500, limit);

        String qKey      = (q    != null && !q.isBlank())    ? q.trim()    : "";
        String bankKey   = (bank != null && !bank.isBlank()) ? bank.trim() : "";
        String sortKey   = (sortBy != null && !sortBy.isBlank()) ? sortBy.trim() : "recent";

        String cacheKey = tenantCachePrefix()
                + "archived:search:q=" + qKey
                + ":bank=" + bankKey
                + ":sort=" + sortKey
                + ":limit=" + safeLimit
                + ":offset=" + safeOffset;

        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) {
            try {
                return objectMapper.readValue(cached.get(), Map.class);
            } catch (Exception ignored) {}
        }

        // ── WHERE clause ──────────────────────────────────────────────────────────
        StringBuilder whereSb = new StringBuilder("WHERE 1=1");
        if (tenantId != null) {
            whereSb.append(" AND tenant_id = :tenantId");
        }
        if (!qKey.isEmpty()) {
            // Full-blob ILIKE — fast enough for moderate data; Phase 4 adds a GIN index.
            whereSb.append(" AND data::text ILIKE :q");
        }

        // Bank: comma-separated normalized names; build per-name ILIKE OR conditions.
        List<String> bankList = new ArrayList<>();
        if (!bankKey.isEmpty()) {
            for (String b : bankKey.split(",")) {
                String t = b.trim();
                if (!t.isEmpty()) bankList.add(t);
            }
            if (!bankList.isEmpty()) {
                whereSb.append(" AND (");
                for (int i = 0; i < bankList.size(); i++) {
                    if (i > 0) whereSb.append(" OR ");
                    whereSb.append("data->'fields'->>'bank' ILIKE :bank").append(i);
                }
                whereSb.append(")");
            }
        }
        String whereStr = whereSb.toString();

        // ── ORDER BY ──────────────────────────────────────────────────────────────
        String orderBy;
        switch (sortKey) {
            case "amount-desc":
                orderBy = "ORDER BY (CASE WHEN (data->'fields'->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' "
                        + "THEN CAST(data->'fields'->>'amount' AS NUMERIC) ELSE 0 END) DESC, archived_at DESC";
                break;
            case "amount-asc":
                orderBy = "ORDER BY (CASE WHEN (data->'fields'->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' "
                        + "THEN CAST(data->'fields'->>'amount' AS NUMERIC) ELSE 0 END) ASC, archived_at DESC";
                break;
            case "donor-asc":
                orderBy = "ORDER BY LOWER(COALESCE(data->'fields'->>'donorName', '')) ASC, archived_at DESC";
                break;
            default: // "recent"
                orderBy = "ORDER BY archived_at DESC, id DESC";
        }

        // ── COUNT ─────────────────────────────────────────────────────────────────
        Query countQuery = entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM archived_records " + whereStr);
        bindSearchParams(countQuery, tenantId, qKey, bankList);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        // ── DATA ──────────────────────────────────────────────────────────────────
        @SuppressWarnings("unchecked")
        Query dataQuery = entityManager.createNativeQuery(
                "SELECT * FROM archived_records " + whereStr + " " + orderBy + " LIMIT :lim OFFSET :off",
                ArchivedRecord.class);
        bindSearchParams(dataQuery, tenantId, qKey, bankList);
        dataQuery.setParameter("lim", safeLimit);
        dataQuery.setParameter("off", safeOffset);

        @SuppressWarnings("unchecked")
        List<ArchivedRecord> rows = dataQuery.getResultList();

        List<Map<String, Object>> records = new ArrayList<>();
        for (ArchivedRecord r : rows) {
            try {
                records.add(objectMapper.readValue(r.getData(), Map.class));
            } catch (Exception ignored) {
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("id", r.getId());
                records.add(fallback);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("records", records);
        result.put("total",   total);
        result.put("offset",  safeOffset);
        result.put("limit",   safeLimit);
        cacheJson(cacheKey, result, ARCHIVED_RECORD_CACHE_TTL);
        return result;
    }

    private void bindSearchParams(Query query, String tenantId, String q, List<String> banks) {
        if (tenantId != null) query.setParameter("tenantId", tenantId);
        if (!q.isEmpty())     query.setParameter("q", "%" + q + "%");
        for (int i = 0; i < banks.size(); i++) {
            query.setParameter("bank" + i, "%" + banks.get(i) + "%");
        }
    }

    @Transactional
    public Map<String, Object> bulkUpsert(List<Map<String, Object>> items, boolean allowReplace) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        String actor = currentUser();
        String now   = OffsetDateTime.now().toString();

        if (allowReplace) {
            if (tenantId != null) {
                repository.deleteAllByTenantId(tenantId);
            } else {
                repository.deleteAll();
            }
        }

        for (Map<String, Object> item : items) {
            String id = String.valueOf(item.get("id"));

            // Attach a single-entry modificationHistory so the upsert SQL can append it
            // to any existing history stored in the DB for this record.
            Map<String, Object> entry = new HashMap<>();
            entry.put("at",     now);
            entry.put("by",     actor);
            entry.put("action", "archived");

            Map<String, Object> payload = new HashMap<>(item);
            payload.put("lastModifiedAt", now);
            payload.put("lastModifiedBy", actor);
            payload.put("modificationHistory", List.of(entry));

            Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
            String snapshotPayload = toJson(payload);
            repository.upsertRecord(id, resolvedTenantId, snapshotPayload, actor);
            runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, snapshotPayload));
        }

        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("mode", allowReplace ? "replace" : "upsert");
        return result;
    }

    public Map<String, Object> getById(String id) {
        String tenantId = TenantContext.getTenantId();
        ArchivedRecord record = repository.findById(id).orElse(null);
        if (record == null) return null;
        // Tenant isolation: non-superadmin callers must own the record.
        if (tenantId != null && !tenantId.equals(record.getTenantId())) return null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = objectMapper.readValue(record.getData(), Map.class);
            // Expose DB-level columns alongside JSONB data
            if (record.getUpdatedAt() != null)     data.put("updatedAt",       record.getUpdatedAt().toString());
            if (record.getLastModifiedBy() != null) data.put("lastModifiedBy", record.getLastModifiedBy());
            return data;
        } catch (Exception e) {
            Map<String, Object> fallback = new HashMap<>();
            fallback.put("id", id);
            return fallback;
        }
    }

    /**
     * Marks an archived record as sent back for rework by merging sentBack metadata
     * and updating qcReview.status without clobbering existing history.
     */
    @Transactional
    public Map<String, Object> sendBack(String id, String destination, String reason) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        String now   = OffsetDateTime.now().toString();
        String actor = currentUser();

        ArchivedRecord existing = repository.findById(id).orElse(null);
        Map<String, Object> data;
        if (existing != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(existing.getData(), Map.class);
                data = new HashMap<>(parsed);
            } catch (Exception e) {
                data = new HashMap<>();
                data.put("id", id);
            }
        } else {
            data = new HashMap<>();
            data.put("id", id);
        }

        // sentBack marker
        Map<String, Object> sentBack = new HashMap<>();
        sentBack.put("destination", destination);
        sentBack.put("reason", reason);
        sentBack.put("at", now);
        sentBack.put("by", actor);
        data.put("sentBack", sentBack);

        // qcReview — preserve existing history array
        @SuppressWarnings("unchecked")
        Map<String, Object> existingQcReview = data.get("qcReview") instanceof Map
                ? new HashMap<>((Map<String, Object>) data.get("qcReview"))
                : new HashMap<>();
        Object history = existingQcReview.get("history");
        existingQcReview.put("status", "sent-back");
        existingQcReview.put("destination", destination);
        existingQcReview.put("reason", reason);
        existingQcReview.put("reviewedAt", now);
        existingQcReview.put("reviewer", actor);
        if (history != null) existingQcReview.put("history", history);
        data.put("qcReview", existingQcReview);

        // modificationHistory entry
        Map<String, Object> histEntry = new HashMap<>();
        histEntry.put("at",     now);
        histEntry.put("by",     actor);
        histEntry.put("action", "sent-back");
        histEntry.put("destination", destination);
        histEntry.put("reason", reason);
        appendModificationHistory(data, histEntry);
        data.put("lastModifiedAt", now);
        data.put("lastModifiedBy", actor);

        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
        String payload = toJson(data);
        repository.upsertRecord(id, resolvedTenantId, payload, actor);
        runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, payload));
        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("id", id);
        result.put("destination", destination);
        result.put("modifiedBy", actor);
        result.put("modifiedAt", now);
        return result;
    }

    /**
     * Marks only a specific page within an archived record as sent back for rework.
     * The archived record itself and all other pages remain unchanged.
     * The overall qcReview.status of the record is NOT modified — only the targeted
     * page object receives a sentBack marker.
     */
    @Transactional
    public Map<String, Object> sendBackPage(String id, String filename, String destination, String reason) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        String now   = OffsetDateTime.now().toString();
        String actor = currentUser();

        // ── Load and validate the archived record ─────────────────────────────────
        ArchivedRecord existing = repository.findById(id).orElse(null);
        if (existing == null) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record not found: " + id);
        }
        if (tenantId != null && !tenantId.equals(existing.getTenantId())) {
            throw new AppException(HttpStatus.FORBIDDEN, "Access denied to archived record: " + id);
        }

        Map<String, Object> data;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(existing.getData(), Map.class);
            data = new HashMap<>(parsed);
        } catch (Exception e) {
            throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse archived record data.");
        }

        // ── Locate the target page by filename ────────────────────────────────────
        Object pagesObj = data.get("pages");
        if (!(pagesObj instanceof List)) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Archived record has no pages.");
        }

        @SuppressWarnings("unchecked")
        List<Object> originalPages = (List<Object>) pagesObj;
        List<Object> updatedPages = new ArrayList<>(originalPages.size());
        boolean found = false;

        for (Object pageObj : originalPages) {
            if (!(pageObj instanceof Map)) {
                updatedPages.add(pageObj);
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> page = new HashMap<>((Map<String, Object>) pageObj);
            String pageFilename = page.get("filename") instanceof String ? (String) page.get("filename") : "";
            String pageName     = page.get("name")     instanceof String ? (String) page.get("name")     : "";

            if (filename.equals(pageFilename) || filename.equals(pageName)) {
                // Mark only this page — preserve all other page fields untouched.
                Map<String, Object> sentBackMarker = new HashMap<>();
                sentBackMarker.put("destination", destination);
                sentBackMarker.put("reason",      reason);
                sentBackMarker.put("at",          now);
                sentBackMarker.put("by",          actor);
                page.put("sentBack", sentBackMarker);
                updatedPages.add(page);
                found = true;
            } else {
                updatedPages.add(page);
            }
        }

        if (!found) {
            throw new AppException(HttpStatus.NOT_FOUND,
                    "Page '" + filename + "' not found in archived record: " + id);
        }

        // ── Persist updated pages array back into the record data ─────────────────
        data.put("pages", updatedPages);

        // ── Append a page-level entry to modificationHistory ──────────────────────
        Map<String, Object> histEntry = new HashMap<>();
        histEntry.put("at",          now);
        histEntry.put("by",          actor);
        histEntry.put("action",      "page-sent-back");
        histEntry.put("filename",    filename);
        histEntry.put("destination", destination);
        histEntry.put("reason",      reason);
        appendModificationHistory(data, histEntry);
        data.put("lastModifiedAt", now);
        data.put("lastModifiedBy", actor);

        // ── Save and invalidate cache (same pattern as sendBack) ──────────────────
        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
        String payload = toJson(data);
        repository.upsertRecord(id, resolvedTenantId, payload, actor);
        runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, payload));
        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok",          true);
        result.put("id",          id);
        result.put("filename",    filename);
        result.put("destination", destination);
        result.put("modifiedBy",  actor);
        result.put("modifiedAt",  now);
        return result;
    }

    @Transactional
    public Map<String, Object> delete(String id) {
        String tenantId = TenantContext.getTenantId();
        String actor    = currentUser();
        String now      = OffsetDateTime.now().toString();

        ArchivedRecord existing = repository.findById(id).orElse(null);
        if (existing == null) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record not found: " + id);
        }
        if (tenantId != null && !tenantId.equals(existing.getTenantId())) {
            throw new AppException(HttpStatus.FORBIDDEN, "Access denied to archived record: " + id);
        }

        repository.deleteById(id);
        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok",        true);
        result.put("id",        id);
        result.put("deletedBy", actor);
        result.put("deletedAt", now);
        return result;
    }

    @Transactional
    public Map<String, Object> patch(String id, Map<String, Object> body) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        String now   = OffsetDateTime.now().toString();
        String actor = currentUser();

        Map<String, Object> data = new HashMap<>(body);
        data.put("id", id);
        data.put("lastModifiedAt", now);
        data.put("lastModifiedBy", actor);

        Map<String, Object> histEntry = new HashMap<>();
        histEntry.put("at",     now);
        histEntry.put("by",     actor);
        histEntry.put("action", "patched");
        data.put("modificationHistory", List.of(histEntry));

        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
        String snapshotPayload = toJson(data);
        repository.upsertRecord(id, resolvedTenantId, snapshotPayload, actor);
        runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, snapshotPayload));

        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("id", id);
        result.put("modifiedBy", actor);
        result.put("modifiedAt", now);
        result.put("s3Snapshot", snapshotInfo);
        return result;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal())) {
            return auth.getName();
        }
        return "system";
    }

    @SuppressWarnings("unchecked")
    private void appendModificationHistory(Map<String, Object> data, Map<String, Object> entry) {
        Object existing = data.get("modificationHistory");
        List<Object> history = new ArrayList<>();
        if (existing instanceof List) history.addAll((List<Object>) existing);
        history.add(entry);
        data.put("modificationHistory", history);
    }

    private String tenantCachePrefix() {
        String tenantId = TenantContext.getTenantId();
        return tenantId != null ? tenantId + ":" : "global:";
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

    private void cacheJson(String key, Object value, Duration ttl) {
        try {
            cacheService.set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (Exception ignored) {}
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            throw new RuntimeException("JSON serialization failed.", e);
        }
    }
}
