package com.sadrm.repository;

import com.sadrm.model.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, String> {

    /** System roles (tenant_id IS NULL) + tenant's own custom roles, excluding soft-deleted. */
    @Query("SELECT r FROM Role r WHERE (r.tenantId = :tenantId OR r.tenantId IS NULL) AND r.deleted = false ORDER BY r.system DESC, r.name ASC")
    List<Role> findAvailableForTenant(@Param("tenantId") String tenantId);

    /** All system-template roles (tenant_id IS NULL). */
    @Query("SELECT r FROM Role r WHERE r.tenantId IS NULL AND r.deleted = false ORDER BY r.name ASC")
    List<Role> findSystemRoles();

    /** Only tenant's own custom roles. */
    @Query("SELECT r FROM Role r WHERE r.tenantId = :tenantId AND r.deleted = false ORDER BY r.name ASC")
    List<Role> findCustomRolesForTenant(@Param("tenantId") String tenantId);

    /** All roles (superadmin view). */
    @Query("SELECT r FROM Role r WHERE r.deleted = false ORDER BY r.tenantId NULLS FIRST, r.name ASC")
    List<Role> findAllActive();

    Optional<Role> findByIdAndDeletedFalse(String id);

    boolean existsByNameAndTenantIdAndDeletedFalse(String name, String tenantId);

    boolean existsByNameAndTenantIdIsNullAndDeletedFalse(String name);
}
