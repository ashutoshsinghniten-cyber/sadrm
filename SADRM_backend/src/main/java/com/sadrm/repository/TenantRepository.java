package com.sadrm.repository;

import com.sadrm.model.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, String> {

    List<Tenant> findAllByDeletedFalseOrderByCreatedAtDesc();

    Optional<Tenant> findByIdAndDeletedFalse(String id);

    Optional<Tenant> findBySlug(String slug);

    boolean existsBySlug(String slug);

    /** Used for slug uniqueness check when updating (exclude self). */
    boolean existsBySlugAndIdNotAndDeletedFalse(String slug, String id);

    /** Used for slug uniqueness check on create. */
    boolean existsBySlugAndDeletedFalse(String slug);

    /** Used during login to verify a tenantKey corresponds to an active, non-deleted tenant. */
    boolean existsByIdAndDeletedFalseAndActiveTrue(String id);
}
