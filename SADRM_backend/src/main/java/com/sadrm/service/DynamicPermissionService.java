package com.sadrm.service;

import com.sadrm.repository.RolePermissionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Loads permissions for a given roleId from the database.
 * Results are cached in Redis (TTL = 5 min) to avoid a DB call on every request.
 *
 * Used exclusively by JwtAuthFilter to build the GrantedAuthority list
 * for the current request's Authentication object.
 */
@Service
public class DynamicPermissionService {

    private static final Logger log = LoggerFactory.getLogger(DynamicPermissionService.class);
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);
    private static final String CACHE_PREFIX = "rbac:perms:role:";

    /** Backward-compat mapping: old role text → system role_id */
    private static final java.util.Map<String, String> ROLE_NAME_TO_ID = java.util.Map.of(
            "superadmin", "role_superadmin",
            "admin",      "role_admin",
            "client",     "role_client",
            "user",       "role_user"
    );

    private final RolePermissionRepository rolePermissionRepository;
    private final CacheService cacheService;

    public DynamicPermissionService(RolePermissionRepository rolePermissionRepository,
                                    CacheService cacheService) {
        this.rolePermissionRepository = rolePermissionRepository;
        this.cacheService             = cacheService;
    }

    /**
     * Returns Spring Security GrantedAuthority list for a roleId.
     * Falls back gracefully if roleId is null or invalid.
     */
    public List<GrantedAuthority> getAuthorities(String roleId) {
        Set<String> codes = getPermissionCodes(roleId);
        return codes.stream()
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());
    }

    /**
     * Returns the set of permission CODE strings for a roleId.
     * Checks Redis cache before hitting the database.
     */
    public Set<String> getPermissionCodes(String roleId) {
        if (roleId == null || roleId.isBlank()) return Collections.emptySet();

        String cacheKey = CACHE_PREFIX + roleId;

        // Try cache first
        return cacheService.get(cacheKey)
                .map(this::deserialize)
                .orElseGet(() -> loadAndCache(roleId, cacheKey));
    }

    /**
     * Resolves a role ID when the JWT only carries the old-style role text.
     * Backward compat for tokens generated before the RBAC upgrade.
     */
    public String resolveRoleId(String roleId, String roleName) {
        if (roleId != null && !roleId.isBlank()) return roleId;
        if (roleName == null) return null;
        return ROLE_NAME_TO_ID.getOrDefault(roleName.toLowerCase(), "role_user");
    }

    /** Evicts the permission cache for a role (call after assigning/removing permissions). */
    public void evict(String roleId) {
        if (roleId != null) {
            cacheService.delete(CACHE_PREFIX + roleId);
            log.debug("Evicted permission cache for roleId={}", roleId);
        }
    }

    private Set<String> loadAndCache(String roleId, String cacheKey) {
        try {
            Set<String> codes = rolePermissionRepository.findPermissionCodesByRoleId(roleId);
            if (!codes.isEmpty()) {
                cacheService.set(cacheKey, serialize(codes), CACHE_TTL);
            }
            return codes;
        } catch (Exception e) {
            log.error("Failed to load permissions for roleId={}: {}", roleId, e.getMessage());
            return Collections.emptySet();
        }
    }

    private String serialize(Set<String> codes) {
        return String.join(",", codes);
    }

    private Set<String> deserialize(String raw) {
        if (raw == null || raw.isBlank()) return Collections.emptySet();
        return Arrays.stream(raw.split(","))
                .filter(s -> !s.isBlank())
                .collect(Collectors.toSet());
    }
}
