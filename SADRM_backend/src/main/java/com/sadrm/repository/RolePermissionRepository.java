package com.sadrm.repository;

import com.sadrm.model.RolePermission;
import com.sadrm.model.RolePermissionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Set;

@Repository
public interface RolePermissionRepository extends JpaRepository<RolePermission, RolePermissionId> {

    /** Returns permission CODE strings for a role — used by auth filter (cached in Redis). */
    @Query("SELECT p.code FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = :roleId")
    Set<String> findPermissionCodesByRoleId(@Param("roleId") String roleId);

    /** Returns full permission details for a role — used in Role management API responses. */
    @Query("SELECT p FROM RolePermission rp JOIN Permission p ON rp.permissionId = p.id WHERE rp.roleId = :roleId ORDER BY p.category ASC, p.code ASC")
    List<Object> findPermissionsForRole(@Param("roleId") String roleId);

    List<RolePermission> findByRoleId(String roleId);

    @Modifying
    @Query("DELETE FROM RolePermission rp WHERE rp.roleId = :roleId")
    void deleteAllByRoleId(@Param("roleId") String roleId);

    @Modifying
    @Query("DELETE FROM RolePermission rp WHERE rp.roleId = :roleId AND rp.permissionId = :permissionId")
    void deleteByRoleIdAndPermissionId(@Param("roleId") String roleId, @Param("permissionId") String permissionId);

    boolean existsByRoleId(String roleId);
}
