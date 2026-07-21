package com.sadrm.repository;

import com.sadrm.model.Batch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BatchRepository extends JpaRepository<Batch, String> {

    // ── Tenant-scoped queries ─────────────────────────────────────────────────

    @Query(value = "SELECT * FROM batches WHERE tenant_id = :tenantId ORDER BY updated_at DESC", nativeQuery = true)
    List<Batch> findAllByTenantIdOrderByUpdatedAtDesc(@Param("tenantId") String tenantId);

    @Query(value = "SELECT * FROM batches WHERE tenant_id = :tenantId AND data->>'status' = :status ORDER BY updated_at DESC", nativeQuery = true)
    List<Batch> findByTenantIdAndStatusOrderByUpdatedAtDesc(@Param("tenantId") String tenantId,
                                                             @Param("status") String status);

    @Query(value = "SELECT * FROM batches WHERE tenant_id = :tenantId ORDER BY updated_at DESC LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<Batch> findAllByTenantIdPaged(@Param("tenantId") String tenantId,
                                        @Param("limit") int limit,
                                        @Param("offset") int offset);

    @Query(value = "SELECT * FROM batches WHERE tenant_id = :tenantId AND data->>'status' = :status ORDER BY updated_at DESC LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<Batch> findByTenantIdAndStatusPaged(@Param("tenantId") String tenantId,
                                              @Param("status") String status,
                                              @Param("limit") int limit,
                                              @Param("offset") int offset);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches WHERE tenant_id = :tenantId ORDER BY updated_at DESC",
            nativeQuery = true)
    List<Object[]> findSummaryByTenantId(@Param("tenantId") String tenantId);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches WHERE tenant_id = :tenantId ORDER BY updated_at DESC LIMIT :limit OFFSET :offset",
            nativeQuery = true)
    List<Object[]> findSummaryByTenantIdPaged(@Param("tenantId") String tenantId,
                                               @Param("limit") int limit,
                                               @Param("offset") int offset);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches WHERE tenant_id = :tenantId AND data->>'status' = :status ORDER BY updated_at DESC",
            nativeQuery = true)
    List<Object[]> findSummaryByTenantIdAndStatus(@Param("tenantId") String tenantId,
                                                   @Param("status") String status);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches WHERE tenant_id = :tenantId AND data->>'status' = :status ORDER BY updated_at DESC LIMIT :limit OFFSET :offset",
            nativeQuery = true)
    List<Object[]> findSummaryByTenantIdAndStatusPaged(@Param("tenantId") String tenantId,
                                                        @Param("status") String status,
                                                        @Param("limit") int limit,
                                                        @Param("offset") int offset);

    @Modifying
    @Query(value = "DELETE FROM batches WHERE tenant_id = :tenantId", nativeQuery = true)
    void deleteAllByTenantId(@Param("tenantId") String tenantId);

    @Modifying
    @Query(value = "INSERT INTO batches (id, tenant_id, data, updated_at) " +
            "VALUES (:id, :tenantId, CAST(:data AS jsonb), NOW()) " +
            "ON CONFLICT (id) DO UPDATE SET data = CAST(:data AS jsonb), updated_at = NOW()",
            nativeQuery = true)
    void upsertBatch(@Param("id") String id,
                     @Param("tenantId") String tenantId,
                     @Param("data") String data);

    // ── Superadmin cross-tenant queries ───────────────────────────────────────

    @Query(value = "SELECT * FROM batches ORDER BY updated_at DESC", nativeQuery = true)
    List<Batch> findAllOrderByUpdatedAtDesc();

    @Query(value = "SELECT * FROM batches WHERE data->>'status' = :status ORDER BY updated_at DESC", nativeQuery = true)
    List<Batch> findByStatusOrderByUpdatedAtDesc(@Param("status") String status);

    @Query(value = "SELECT * FROM batches ORDER BY updated_at DESC LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<Batch> findAllOrderByUpdatedAtDescPaged(@Param("limit") int limit, @Param("offset") int offset);

    @Query(value = "SELECT * FROM batches WHERE data->>'status' = :status ORDER BY updated_at DESC LIMIT :limit OFFSET :offset", nativeQuery = true)
    List<Batch> findByStatusOrderByUpdatedAtDescPaged(@Param("status") String status,
                                                       @Param("limit") int limit,
                                                       @Param("offset") int offset);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches ORDER BY updated_at DESC",
            nativeQuery = true)
    List<Object[]> findSummaryAll();

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches ORDER BY updated_at DESC LIMIT :limit OFFSET :offset",
            nativeQuery = true)
    List<Object[]> findSummaryAllPaged(@Param("limit") int limit, @Param("offset") int offset);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches WHERE data->>'status' = :status ORDER BY updated_at DESC",
            nativeQuery = true)
    List<Object[]> findSummaryByStatus(@Param("status") String status);

    @Query(value = "SELECT id, data->>'status' AS status, " +
            "CASE WHEN (data->>'pages') ~ '^[0-9]+$' THEN (data->>'pages')::int ELSE 0 END AS pages, " +
            "COALESCE(jsonb_array_length(COALESCE(data->'records', '[]'::jsonb)), 0) AS record_count, " +
            "updated_at FROM batches WHERE data->>'status' = :status ORDER BY updated_at DESC LIMIT :limit OFFSET :offset",
            nativeQuery = true)
    List<Object[]> findSummaryByStatusPaged(@Param("status") String status,
                                             @Param("limit") int limit,
                                             @Param("offset") int offset);
}
