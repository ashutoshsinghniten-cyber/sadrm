package com.sadrm.repository;

import com.sadrm.model.ArchivedRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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
        "INSERT INTO archived_records (id, tenant_id, data, updated_at, last_modified_by) " +
        "VALUES (:id, :tenantId, CAST(:data AS jsonb), NOW(), :modifiedBy) " +
        "ON CONFLICT (id) DO UPDATE SET " +
        "  data = EXCLUDED.data || jsonb_build_object(" +
        "    'modificationHistory'," +
        "    COALESCE(archived_records.data->'modificationHistory', '[]'::jsonb) ||" +
        "    COALESCE(EXCLUDED.data->'modificationHistory', '[]'::jsonb)" +
        "  )," +
        "  updated_at       = NOW()," +
        "  last_modified_by = EXCLUDED.last_modified_by",
        nativeQuery = true)
    void upsertRecord(@Param("id") String id,
                      @Param("tenantId") String tenantId,
                      @Param("data") String data,
                      @Param("modifiedBy") String modifiedBy);

    @Modifying
    @Query(value = "DELETE FROM archived_records WHERE tenant_id = :tenantId", nativeQuery = true)
    void deleteAllByTenantId(@Param("tenantId") String tenantId);
}
