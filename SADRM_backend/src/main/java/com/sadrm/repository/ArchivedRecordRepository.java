package com.sadrm.repository;

import com.sadrm.model.ArchivedRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;

@Repository
public interface ArchivedRecordRepository extends JpaRepository<ArchivedRecord, String> {

    @Query(value = "SELECT * FROM archived_records WHERE tenant_id = :tenantId ORDER BY archived_at DESC, id DESC",
            countQuery = "SELECT COUNT(*) FROM archived_records WHERE tenant_id = :tenantId",
            nativeQuery = true)
    Page<ArchivedRecord> findByTenantIdOrderByArchivedAtDesc(@Param("tenantId") String tenantId, Pageable pageable);

    // Superadmin cross-tenant view
    @Query(value = "SELECT * FROM archived_records ORDER BY archived_at DESC, id DESC",
            countQuery = "SELECT COUNT(*) FROM archived_records",
            nativeQuery = true)
    Page<ArchivedRecord> findAllOrderByArchivedAtDesc(Pageable pageable);

    @Modifying
    @Query(value =
        "INSERT INTO archived_records (id, tenant_id, data, updated_at, last_modified_by, flagged, flag_reason, flagged_by, flagged_at) " +
        "VALUES (:id, :tenantId, CAST(:data AS jsonb), NOW(), :modifiedBy, :flagged, :flagReason, :flaggedBy, :flaggedAt) " +
        "ON CONFLICT (id) DO UPDATE SET " +
        "  data = EXCLUDED.data || jsonb_build_object(" +
        "    'modificationHistory'," +
        "    COALESCE(archived_records.data->'modificationHistory', '[]'::jsonb) ||" +
        "    COALESCE(EXCLUDED.data->'modificationHistory', '[]'::jsonb)" +
        "  )," +
        "  updated_at       = NOW()," +
        "  last_modified_by = EXCLUDED.last_modified_by," +
        "  flagged          = EXCLUDED.flagged," +
        "  flag_reason      = EXCLUDED.flag_reason," +
        "  flagged_by       = EXCLUDED.flagged_by," +
        "  flagged_at       = EXCLUDED.flagged_at",
        nativeQuery = true)
    void upsertRecord(@Param("id") String id,
                      @Param("tenantId") String tenantId,
                      @Param("data") String data,
                      @Param("modifiedBy") String modifiedBy,
                      @Param("flagged") boolean flagged,
                      @Param("flagReason") String flagReason,
                      @Param("flaggedBy") String flaggedBy,
                      @Param("flaggedAt") OffsetDateTime flaggedAt);

    @Modifying
    @Query(value = "DELETE FROM archived_records WHERE tenant_id = :tenantId", nativeQuery = true)
    void deleteAllByTenantId(@Param("tenantId") String tenantId);

    @Modifying
    @Query(value =
        "UPDATE archived_records SET " +
        "  flagged     = :flagged, " +
        "  flag_reason = :reason, " +
        "  flagged_by  = :flaggedBy, " +
        "  flagged_at  = :flaggedAt " +
        "WHERE id = :id",
        nativeQuery = true)
    void updateFlag(@Param("id") String id,
                    @Param("flagged") boolean flagged,
                    @Param("reason") String reason,
                    @Param("flaggedBy") String flaggedBy,
                    @Param("flaggedAt") OffsetDateTime flaggedAt);
}
