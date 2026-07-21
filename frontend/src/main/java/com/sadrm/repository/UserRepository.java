package com.sadrm.repository;

import com.sadrm.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, String> {

    Optional<User> findByUsername(String username);

    Optional<User> findByUsernameAndTenantId(String username, String tenantId);

    boolean existsByUsername(String username);

    boolean existsByUsernameAndTenantId(String username, String tenantId);

    List<User> findAllByTenantId(String tenantId);

    /** Paginated version — use this for all user-facing list APIs. */
    Page<User> findAllByTenantId(String tenantId, Pageable pageable);

    @Modifying
    @Query("UPDATE User u SET u.active = false WHERE u.username = :username AND u.tenantId = :tenantId")
    int revokeByUsernameAndTenantId(@Param("username") String username, @Param("tenantId") String tenantId);

    @Modifying
    @Query("UPDATE User u SET u.active = true WHERE u.username = :username AND u.tenantId = :tenantId")
    int activateByUsernameAndTenantId(@Param("username") String username, @Param("tenantId") String tenantId);

    @Modifying
    @Query("UPDATE User u SET u.role = :role WHERE u.username = :username AND u.tenantId = :tenantId")
    int updateRoleByUsernameAndTenantId(@Param("username") String username,
                                        @Param("role") String role,
                                        @Param("tenantId") String tenantId);

    // Superadmin-level operations (no tenant filter — used by DataInitializer and superadmin flows)
    @Modifying
    @Query("UPDATE User u SET u.active = false WHERE u.username = :username")
    int revokeByUsername(@Param("username") String username);

    @Modifying
    @Query("UPDATE User u SET u.active = true WHERE u.username = :username")
    int activateByUsername(@Param("username") String username);

    @Modifying
    @Query("UPDATE User u SET u.role = :role WHERE u.username = :username")
    int updateRoleByUsername(@Param("username") String username, @Param("role") String role);
}
