package com.sadrm.repository;

import com.sadrm.model.RecordLock;
import com.sadrm.model.RecordLockId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface RecordLockRepository extends JpaRepository<RecordLock, RecordLockId> {

    @Query("SELECT r FROM RecordLock r WHERE r.tenantId = :tenantId AND r.batchId = :batchId AND r.expiresAt > :now")
    List<RecordLock> findActiveByTenantIdAndBatchId(@Param("tenantId") String tenantId,
                                                     @Param("batchId") String batchId,
                                                     @Param("now") OffsetDateTime now);

    @Query("SELECT r FROM RecordLock r WHERE r.tenantId = :tenantId AND r.batchId = :batchId AND r.recordId = :recordId AND r.expiresAt > :now")
    Optional<RecordLock> findActiveLock(@Param("tenantId") String tenantId,
                                        @Param("batchId") String batchId,
                                        @Param("recordId") String recordId,
                                        @Param("now") OffsetDateTime now);

    @Modifying
    @Query(value = "INSERT INTO record_locks (tenant_id, batch_id, record_id, locked_by, locked_at, expires_at) " +
            "VALUES (:tenantId, :batchId, :recordId, :lockedBy, NOW(), NOW() + INTERVAL '10 minutes') " +
            "ON CONFLICT (tenant_id, batch_id, record_id) DO UPDATE " +
            "SET locked_by = :lockedBy, locked_at = NOW(), expires_at = NOW() + INTERVAL '10 minutes'",
            nativeQuery = true)
    void upsertLock(@Param("tenantId") String tenantId,
                    @Param("batchId") String batchId,
                    @Param("recordId") String recordId,
                    @Param("lockedBy") String lockedBy);

    @Modifying
    @Query("DELETE FROM RecordLock r WHERE r.tenantId = :tenantId AND r.batchId = :batchId AND r.recordId = :recordId")
    void deleteByTenantIdAndBatchIdAndRecordId(@Param("tenantId") String tenantId,
                                               @Param("batchId") String batchId,
                                               @Param("recordId") String recordId);

    @Modifying
    @Query("DELETE FROM RecordLock r WHERE r.expiresAt <= :now")
    int deleteExpiredLocks(@Param("now") OffsetDateTime now);
}
