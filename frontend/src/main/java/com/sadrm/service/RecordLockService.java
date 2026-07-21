package com.sadrm.service;

import com.sadrm.exception.AppException;
import com.sadrm.model.RecordLock;
import com.sadrm.repository.RecordLockRepository;
import com.sadrm.security.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class RecordLockService {

    private final RecordLockRepository repository;

    public RecordLockService(RecordLockRepository repository) {
        this.repository = repository;
    }

    public List<Map<String, Object>> getActiveLocks(String batchId) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        List<RecordLock> locks = repository.findActiveByTenantIdAndBatchId(resolvedTenantId, batchId, OffsetDateTime.now());
        List<Map<String, Object>> result = new ArrayList<>();
        for (RecordLock lock : locks) {
            Map<String, Object> item = new HashMap<>();
            item.put("record_id",  lock.getRecordId());
            item.put("locked_by",  lock.getLockedBy());
            item.put("locked_at",  lock.getLockedAt());
            item.put("expires_at", lock.getExpiresAt());
            result.add(item);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> acquireLock(String batchId, String recordId, String lockedBy) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";

        Optional<RecordLock> existing = repository.findActiveLock(resolvedTenantId, batchId, recordId, OffsetDateTime.now());

        if (existing.isPresent() && !existing.get().getLockedBy().equals(lockedBy)) {
            throw new AppException(HttpStatus.CONFLICT,
                    "Record is currently being reviewed by another operator.");
        }

        repository.upsertLock(resolvedTenantId, batchId, recordId, lockedBy);

        Map<String, Object> result = new HashMap<>();
        result.put("ok",       true);
        result.put("batchId",  batchId);
        result.put("recordId", recordId);
        result.put("lockedBy", lockedBy);
        return result;
    }

    @Transactional
    public void releaseLock(String batchId, String recordId) {
        String tenantId = TenantContext.getTenantId();
        String resolvedTenantId = tenantId != null ? tenantId : "tenant_default";
        repository.deleteByTenantIdAndBatchIdAndRecordId(resolvedTenantId, batchId, recordId);
    }

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void cleanupExpiredLocks() {
        repository.deleteExpiredLocks(OffsetDateTime.now());
    }
}
