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
    private final BatchPageService batchPageService;

    @PersistenceContext
    private EntityManager entityManager;

    public ArchivedRecordService(ArchivedRecordRepository repository,
                                 WorkflowSnapshotService snapshotService,
                                 ObjectMapper objectMapper,
                                 CacheService cacheService,
                                 BatchPageService batchPageService) {
        this.repository       = repository;
        this.snapshotService  = snapshotService;
        this.objectMapper     = objectMapper;
        this.cacheService     = cacheService;
        this.batchPageService = batchPageService;
    }

    /**
     * Backward-compatible overload — no search or sort params.
     * Delegated to by internal callers that don't need search.
     */
    public Map<String, Object> getAll(int offset, int limit) {
        return getAll(offset, limit, null, null, null, false);
    }

    /**
     * Full search overload: server-side text search (q), bank ILIKE filter, and sort order.
     *
     * @param q       Free-text substring to match against the full JSONB blob (data::text ILIKE).
     * @param bank    Comma-separated bank name substrings (ILIKE each). Null/blank = no bank filter.
     * @param sortBy  recent | amount-desc | amount-asc | donor-asc  (default: recent)
     */
    public Map<String, Object> getAll(int offset, int limit, String q, String bank, String sortBy) {
        return getAll(offset, limit, q, bank, sortBy, false);
    }

    /**
     * @param flaggedOnly  When true, restricts results to flagged=TRUE records only
     *                     (backs the Repository screen's "Flagged" filter tab).
     */
    public Map<String, Object> getAll(int offset, int limit, String q, String bank, String sortBy, boolean flaggedOnly) {
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
                + ":flagged=" + flaggedOnly
                + ":limit=" + safeLimit
                + ":offset=" + safeOffset;

        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) {
            try {
                return objectMapper.readValue(cached.get(), Map.class);
            } catch (Exception ignored) {}
        }

        // ── WHERE clause ──────────────────────────────────────────────────────────
        List<String> bankList = new ArrayList<>();
        String whereStr = buildWhereClause(tenantId, qKey, bankKey, flaggedOnly, bankList);

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

    /**
     * Builds the shared WHERE clause used by getAll()/getCount(). bankListOut is populated
     * with the parsed per-name bank filters so the caller can bind them via bindSearchParams.
     */
    private String buildWhereClause(String tenantId, String qKey, String bankKey, boolean flaggedOnly, List<String> bankListOut) {
        StringBuilder whereSb = new StringBuilder("WHERE 1=1");
        if (tenantId != null) {
            whereSb.append(" AND tenant_id = :tenantId");
        }
        if (!qKey.isEmpty()) {
            // Full-blob ILIKE — fast enough for moderate data; Phase 4 adds a GIN index.
            whereSb.append(" AND data::text ILIKE :q");
        }
        if (flaggedOnly) {
            whereSb.append(" AND flagged = TRUE");
        }

        // Bank: comma-separated normalized names; build per-name ILIKE OR conditions.
        if (!bankKey.isEmpty()) {
            for (String b : bankKey.split(",")) {
                String t = b.trim();
                if (!t.isEmpty()) bankListOut.add(t);
            }
            if (!bankListOut.isEmpty()) {
                whereSb.append(" AND (");
                for (int i = 0; i < bankListOut.size(); i++) {
                    if (i > 0) whereSb.append(" OR ");
                    whereSb.append("data->'fields'->>'bank' ILIKE :bank").append(i);
                }
                whereSb.append(")");
            }
        }
        return whereSb.toString();
    }

    /**
     * COUNT-only lookup — not capped by getAll()'s 100/500 page-size limit. Backs the
     * dashboard's "total archived records" tile so it shows the real total, not the
     * size of whatever page happened to be fetched.
     */
    public long getCount(String q, String bank) {
        return getCount(q, bank, false);
    }

    public long getCount(String q, String bank, boolean flaggedOnly) {
        String tenantId = TenantContext.getTenantId();
        String qKey    = (q    != null && !q.isBlank())    ? q.trim()    : "";
        String bankKey = (bank != null && !bank.isBlank()) ? bank.trim() : "";

        String cacheKey = tenantCachePrefix()
                + "archived:count:q=" + qKey
                + ":bank=" + bankKey
                + ":flagged=" + flaggedOnly;

        Optional<String> cached = cacheService.get(cacheKey);
        if (cached.isPresent()) {
            try { return Long.parseLong(cached.get()); } catch (Exception ignored) {}
        }

        List<String> bankList = new ArrayList<>();
        String whereStr = buildWhereClause(tenantId, qKey, bankKey, flaggedOnly, bankList);

        Query countQuery = entityManager.createNativeQuery("SELECT COUNT(*) FROM archived_records " + whereStr);
        bindSearchParams(countQuery, tenantId, qKey, bankList);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        try {
            cacheService.set(cacheKey, String.valueOf(total), ARCHIVED_RECORD_CACHE_TTL);
        } catch (Exception ignored) {}
        return total;
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

        OffsetDateTime nowTs = OffsetDateTime.now();

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

            // Carry a flag set earlier in the pipeline (HITL/QC) through to the archived
            // record's own flagged/flag_reason/flagged_by/flagged_at columns — those columns,
            // not the JSONB blob, are the source of truth for the Repository's flagged filter.
            boolean flagged = Boolean.TRUE.equals(item.get("flagged"));
            String flagReason = flagged ? asString(item.get("flagReason")) : null;
            String flaggedBy  = flagged ? asString(item.get("flaggedBy"))  : null;
            OffsetDateTime flaggedAt = null;
            if (flagged) {
                String rawFlaggedAt = asString(item.get("flaggedAt"));
                if (rawFlaggedAt != null) {
                    try {
                        flaggedAt = OffsetDateTime.parse(rawFlaggedAt);
                    } catch (Exception ignored) {
                        flaggedAt = nowTs;
                    }
                } else {
                    flaggedAt = nowTs;
                }
            }

            Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
            String snapshotPayload = toJson(payload);
            repository.upsertRecord(id, resolvedTenantId, snapshotPayload, actor, flagged, flagReason, flaggedBy, flaggedAt);
            runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, snapshotPayload));
        }

        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        result.put("mode", allowReplace ? "replace" : "upsert");
        return result;
    }

    private static String asString(Object value) {
        return value == null ? null : String.valueOf(value);
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
            data.put("flagged", record.isFlagged());
            if (record.getFlagReason() != null) data.put("flagReason", record.getFlagReason());
            if (record.getFlaggedBy() != null)  data.put("flaggedBy",  record.getFlaggedBy());
            if (record.getFlaggedAt() != null)  data.put("flaggedAt",  record.getFlaggedAt().toString());
            return data;
        } catch (Exception e) {
            Map<String, Object> fallback = new HashMap<>();
            fallback.put("id", id);
            return fallback;
        }
    }

    /**
     * Flags (or unflags) an archived record. Updates the real DB columns (flagged,
     * flag_reason, flagged_by, flagged_at) via a direct UPDATE, then mirrors the same
     * state into the JSONB data blob and appends a modificationHistory entry so the
     * flag shows up consistently whether read via the column or the blob.
     */
    @Transactional
    public Map<String, Object> setFlag(String id, boolean flagged, String reason) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        OffsetDateTime nowTs = OffsetDateTime.now();
        String now   = nowTs.toString();
        String actor = currentUser();

        ArchivedRecord existing = repository.findById(id).orElse(null);
        if (existing == null) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record not found: " + id);
        }
        if (tenantId != null && !tenantId.equals(existing.getTenantId())) {
            throw new AppException(HttpStatus.FORBIDDEN, "Access denied to archived record: " + id);
        }

        // ── DB columns — the source of truth for filtering/counting ───────────────
        repository.updateFlag(id, flagged, flagged ? reason : null, flagged ? actor : null, flagged ? nowTs : null);

        // ── Mirror into the JSONB blob so the frontend sees it in the record payload ──
        Map<String, Object> data;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(existing.getData(), Map.class);
            data = new HashMap<>(parsed);
        } catch (Exception e) {
            data = new HashMap<>();
            data.put("id", id);
        }

        data.put("flagged", flagged);
        data.put("flagReason", flagged ? reason : null);
        data.put("flaggedBy", flagged ? actor : null);
        data.put("flaggedAt", flagged ? now : null);

        Map<String, Object> histEntry = new HashMap<>();
        histEntry.put("at",     now);
        histEntry.put("by",     actor);
        histEntry.put("action", flagged ? "flagged" : "unflagged");
        histEntry.put("reason", reason);
        appendModificationHistory(data, histEntry);
        data.put("lastModifiedAt", now);
        data.put("lastModifiedBy", actor);

        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
        String payload = toJson(data);
        repository.upsertRecord(id, resolvedTenantId, payload, actor,
            flagged, flagged ? reason : null, flagged ? actor : null, flagged ? nowTs : null);
        runAfterCommit(() -> snapshotService.persistPreparedAsync(snapshotInfo, payload));
        cacheService.deleteByPattern(tenantCachePrefix() + "archived:*");

        Map<String, Object> result = new HashMap<>();
        result.put("ok",      true);
        result.put("id",      id);
        result.put("flagged", flagged);
        result.put("reason",  reason);
        result.put("modifiedBy", actor);
        result.put("modifiedAt", now);
        return result;
    }

    /**
     * Flagged-record detail for the Repository "Flagged" tab. Wraps getById(), 404s if
     * the record isn't actually flagged, and inlines presigned page/PDF URLs by resolving
     * the record's batchId/recordId and delegating to BatchPageService — the same source
     * the normal batch-based record viewer uses.
     */
    public Map<String, Object> getFlaggedDetail(String id) {
        Map<String, Object> record = getById(id);
        if (record == null) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record not found: " + id);
        }
        if (!Boolean.TRUE.equals(record.get("flagged"))) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record is not flagged: " + id);
        }

        Object batchIdObj  = record.get("batchId");
        Object recordIdObj = record.get("recordId");
        if (batchIdObj instanceof String && recordIdObj instanceof String) {
            try {
                Map<String, Object> pagesWithUrls = batchPageService.getPages((String) batchIdObj, (String) recordIdObj);
                record.put("pages", pagesWithUrls.get("pages"));
            } catch (Exception e) {
                // Page/S3 resolution failing shouldn't block viewing the record's metadata —
                // the frontend just won't have live PDF URLs for this response.
            }
        }
        return record;
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

        // Patch bodies don't always include flag fields — preserve the record's existing
        // flag state unless the caller explicitly sent one, so an unrelated field edit
        // can't silently clear a flag set earlier via setFlag()/bulkUpsert().
        ArchivedRecord existing = repository.findById(id).orElse(null);
        boolean flagged = body.containsKey("flagged")
            ? Boolean.TRUE.equals(body.get("flagged"))
            : (existing != null && existing.isFlagged());
        String flagReason = flagged
            ? (body.containsKey("flagReason") ? asString(body.get("flagReason")) : (existing != null ? existing.getFlagReason() : null))
            : null;
        String flaggedBy = flagged
            ? (body.containsKey("flaggedBy") ? asString(body.get("flaggedBy")) : (existing != null ? existing.getFlaggedBy() : null))
            : null;
        OffsetDateTime flaggedAt = flagged
            ? (existing != null ? existing.getFlaggedAt() : null)
            : null;

        Map<String, Object> snapshotInfo = snapshotService.createSnapshotInfo("archived-records", id);
        String snapshotPayload = toJson(data);
        repository.upsertRecord(id, resolvedTenantId, snapshotPayload, actor, flagged, flagReason, flaggedBy, flaggedAt);
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
