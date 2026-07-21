package com.sadrm.service;

import com.sadrm.dto.AdminUserDto;
import com.sadrm.dto.CreateAdminUserRequest;
import com.sadrm.dto.LoginResponse;
import com.sadrm.dto.RegisterRequest;
import com.sadrm.exception.AppException;
import com.sadrm.model.Role;
import com.sadrm.model.Tenant;
import com.sadrm.model.User;
import com.sadrm.repository.RoleRepository;
import com.sadrm.repository.TenantRepository;
import com.sadrm.repository.UserRepository;
import com.sadrm.security.JwtUtil;
import com.sadrm.security.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.nio.charset.StandardCharsets;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final int PBKDF2_ITERATIONS = 100_000;
    private static final int PBKDF2_KEY_LENGTH  = 256;

    /** Maps role text to system role_id for users without explicit roleId. */
    private static final Map<String, String> ROLE_NAME_TO_ID = Map.of(
            "superadmin", "role_superadmin",
            "admin",      "role_admin",
            "client",     "role_client",
            "user",       "role_user"
    );

    private final UserRepository          userRepository;
    private final RoleRepository          roleRepository;
    private final TenantRepository        tenantRepository;
    private final JwtUtil                 jwtUtil;
    private final DynamicPermissionService dynamicPermissionService;

    public AuthService(UserRepository userRepository,
                       RoleRepository roleRepository,
                       TenantRepository tenantRepository,
                       JwtUtil jwtUtil,
                       DynamicPermissionService dynamicPermissionService) {
        this.userRepository          = userRepository;
        this.roleRepository          = roleRepository;
        this.tenantRepository        = tenantRepository;
        this.jwtUtil                 = jwtUtil;
        this.dynamicPermissionService = dynamicPermissionService;
    }

    /**
     * Hash password using PBKDF2-SHA256, identical to Node.js crypto.pbkdf2
     * with sha256, 100_000 iterations, 32-byte key, base64url output.
     */
    private String hashPassword(String password, String salt) {
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] saltBytes = salt.getBytes(StandardCharsets.UTF_8);
            PBEKeySpec spec = new PBEKeySpec(
                    password.toCharArray(),
                    saltBytes,
                    PBKDF2_ITERATIONS,
                    PBKDF2_KEY_LENGTH
            );
            byte[] hash = factory.generateSecret(spec).getEncoded();
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new RuntimeException("Password hashing failed.", e);
        }
    }

    private String generateSalt() {
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Authenticates a user with username, password, and tenantKey.
     *
     * Flow:
     *  - Superadmin: tenantKey is ignored (superadmin has no tenant boundary).
     *  - Admin/User: tenantKey is required, must match the user's assigned tenantId,
     *                and the corresponding tenant must be active and not deleted.
     */
    @Transactional
    public LoginResponse login(String username, String password, String tenantKey) {
        String user = username.trim();
        if (user.isBlank() || password == null || password.isBlank()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Enter both username and password.");
        }

        // Look up user by username (username is PK — globally unique across all tenants)
        User record = userRepository.findByUsername(user)
                .orElseThrow(() -> {
                    log.warn("Login failed: user '{}' not found", user);
                    return new AppException(HttpStatus.UNAUTHORIZED, "Invalid credentials.");
                });

        if (!record.isActive()) {
            log.warn("Login rejected: user '{}' account is revoked", user);
            throw new AppException(HttpStatus.FORBIDDEN, "Account has been revoked. Contact your administrator.");
        }

        // ── tenantKey validation for non-superadmin users ──────────────────────
        if (!"superadmin".equals(record.getRole())) {
            // tenantKey is mandatory for all non-superadmin logins
            if (tenantKey == null || tenantKey.isBlank()) {
                throw new AppException(HttpStatus.BAD_REQUEST,
                        "tenantKey is required. Please provide your tenant key to log in.");
            }

            // User's stored tenantId must match the provided tenantKey
            if (!tenantKey.equals(record.getTenantId())) {
                // Use a generic message to avoid leaking which tenants exist
                throw new AppException(HttpStatus.UNAUTHORIZED, "Invalid credentials.");
            }

            // Validate the tenant itself is active and not deleted
            Tenant tenant = tenantRepository.findByIdAndDeletedFalse(tenantKey)
                    .orElseThrow(() -> new AppException(HttpStatus.UNAUTHORIZED,
                            "Invalid or inactive tenantKey."));
            if (!tenant.isActive()) {
                throw new AppException(HttpStatus.FORBIDDEN,
                        "Your tenant is not active. Contact your administrator.");
            }
        }

        // Non-superadmin users must always belong to a tenant
        if (!"superadmin".equals(record.getRole()) && record.getTenantId() == null) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "User account has no tenant assigned. Contact your administrator.");
        }

        // Verify password
        String presented = hashPassword(password, record.getSalt());
        if (!presented.equals(record.getHash())) {
            log.warn("Login failed: invalid password for user '{}'", user);
            throw new AppException(HttpStatus.UNAUTHORIZED, "Invalid credentials.");
        }

        // Resolve roleId — fall back to name-based mapping for legacy users
        String roleId = record.getRoleId() != null
                ? record.getRoleId()
                : ROLE_NAME_TO_ID.getOrDefault(record.getRole(), "role_user");

        String token = jwtUtil.generateToken(record.getUsername(), record.getRole(), record.getTenantId(), roleId);

        // Include authorities in the login response so the frontend can skip a
        // separate GET /me call solely to obtain the permission code list.
        List<String> authorityCodes = new ArrayList<>(dynamicPermissionService.getPermissionCodes(roleId));

        log.info("Login successful: user='{}', role='{}', tenant='{}'", user, record.getRole(), record.getTenantId());
        return new LoginResponse(token, record.getUsername(), record.getRole(), record.getTenantId(), roleId,
                                 authorityCodes);
    }

    @Transactional
    public void register(RegisterRequest req) {
        throw new AppException(HttpStatus.FORBIDDEN,
                "Self-registration is disabled. Contact your administrator to create an account.");
    }

    /** Returns at most 500 usernames ordered by username. Never loads all users. */
    public List<String> listUsernames() {
        String tenantId = TenantContext.getTenantId();
        PageRequest pageRequest = PageRequest.of(0, 500, Sort.by(Sort.Direction.ASC, "username"));
        Page<User> page = tenantId != null
                ? userRepository.findAllByTenantId(tenantId, pageRequest)
                : userRepository.findAll(pageRequest);
        return page.getContent().stream()
                .map(User::getUsername)
                .collect(Collectors.toList());
    }

    /**
     * Paginated user listing. Safe at 1M+ users.
     * Returns { users, total, limit, offset }.
     */
    public Map<String, Object> listAllUsers(String requesterUsername, int limit, int offset) {
        String tenantId = TenantContext.getTenantId();
        int safeLimit  = (limit <= 0) ? 100 : Math.min(500, limit);
        int safeOffset = Math.max(0, offset);
        int pageIndex  = safeOffset / safeLimit;
        PageRequest pageRequest = PageRequest.of(pageIndex, safeLimit, Sort.by(Sort.Direction.ASC, "username"));

        Page<User> page = tenantId != null
                ? userRepository.findAllByTenantId(tenantId, pageRequest)
                : userRepository.findAll(pageRequest);

        List<AdminUserDto> users = page.getContent().stream()
                .map(u -> new AdminUserDto(u.getUsername(), u.getRole(), u.getRoleId(),
                        u.getTenantId(), u.isActive(), u.getCreatedAt()))
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("users",  users);
        result.put("total",  page.getTotalElements());
        result.put("limit",  safeLimit);
        result.put("offset", safeOffset);
        return result;
    }

    /**
     * Creates a user under the admin's tenant (or any tenant for superadmin).
     *
     * Rules:
     *  - Superadmin: may specify any tenantId in the request body; may create any role.
     *  - Admin: tenantId is always taken from their JWT (TenantContext); cannot be overridden.
     *           May only create users with role "user" or "client" — not "admin" or "superadmin".
     */
    @Transactional
    public AdminUserDto createAdminUser(CreateAdminUserRequest req, String requesterRole) {
        String user = req.getUsername().trim();

        boolean callerIsSuperAdmin = TenantContext.isSuperAdmin();

        // ── Prevent non-superadmin from manually providing a tenantKey ────────
        if (!callerIsSuperAdmin && req.getTenantId() != null && !req.getTenantId().isBlank()) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "You cannot manually assign a tenantKey. It is automatically inherited from your account.");
        }

        // ── Resolve role and roleId ───────────────────────────────────────────
        String assignedRoleName;
        String assignedRoleId;

        if (req.getRoleId() != null && !req.getRoleId().isBlank()) {
            // New-style: roleId provided directly
            Role role = roleRepository.findByIdAndDeletedFalse(req.getRoleId())
                    .orElseThrow(() -> new AppException(HttpStatus.BAD_REQUEST, "Role not found: " + req.getRoleId()));
            if (role.isSystem() && "role_superadmin".equals(role.getId()) && !"superadmin".equals(requesterRole)) {
                throw new AppException(HttpStatus.FORBIDDEN, "Only superadmin can assign the superadmin role.");
            }
            assignedRoleName = role.getName().toLowerCase();
            assignedRoleId   = role.getId();
        } else {
            // Legacy-style: role text provided
            String requestedRole = req.getRole();
            assignedRoleName = "user";
            if ("admin".equals(requestedRole))           assignedRoleName = "admin";
            else if ("client".equals(requestedRole))     assignedRoleName = "client";
            else if ("superadmin".equals(requestedRole)) {
                if (!"superadmin".equals(requesterRole)) {
                    throw new AppException(HttpStatus.FORBIDDEN, "Only superadmin can create superadmin accounts.");
                }
                assignedRoleName = "superadmin";
            }
            assignedRoleId = ROLE_NAME_TO_ID.getOrDefault(assignedRoleName, "role_user");
        }

        // ── Admin cannot create another admin or superadmin ───────────────────
        if (!callerIsSuperAdmin && ("admin".equals(assignedRoleName) || "superadmin".equals(assignedRoleName))) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "Admins can only create user-level accounts. Only Super Admin can create Admin accounts.");
        }

        // ── Resolve tenantId ──────────────────────────────────────────────────
        String tenantId = resolveTenantIdForCreate(req, requesterRole);

        // Non-superadmin users must belong to a tenant
        if (!"superadmin".equals(assignedRoleName) && tenantId == null) {
            throw new AppException(HttpStatus.BAD_REQUEST,
                    "tenantId is required for non-superadmin users.");
        }

        // Validate the target tenant exists and is active (when tenantId is specified)
        if (tenantId != null) {
            Tenant tenant = tenantRepository.findByIdAndDeletedFalse(tenantId)
                    .orElseThrow(() -> new AppException(HttpStatus.BAD_REQUEST,
                            "Tenant not found: " + tenantId));
            if (!tenant.isActive()) {
                throw new AppException(HttpStatus.BAD_REQUEST,
                        "Tenant is not active: " + tenantId);
            }
        }

        if (user.length() < 3) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Username must be at least 3 characters.");
        }
        if (req.getPassword() == null || req.getPassword().length() < 6) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters.");
        }

        if (tenantId != null && userRepository.existsByUsernameAndTenantId(user, tenantId)) {
            throw new AppException(HttpStatus.CONFLICT, "A user with that name already exists in this tenant.");
        }
        if (tenantId == null && userRepository.existsByUsername(user)) {
            throw new AppException(HttpStatus.CONFLICT, "A user with that name already exists.");
        }

        String salt = generateSalt();
        String hash = hashPassword(req.getPassword(), salt);

        User newUser = new User();
        newUser.setUsername(user);
        newUser.setSalt(salt);
        newUser.setHash(hash);
        newUser.setRole(assignedRoleName);
        newUser.setRoleId(assignedRoleId);
        newUser.setActive(true);
        newUser.setTenantId(tenantId);
        userRepository.save(newUser);

        log.info("User created: username='{}', role='{}', tenant='{}'", user, assignedRoleName, tenantId);
        return new AdminUserDto(user, assignedRoleName, assignedRoleId, tenantId, true, null);
    }

    /**
     * For superadmin: uses the tenantId from the request body (can create in any tenant).
     * For admin/user: always uses the caller's own tenantId from JWT — request body value is ignored.
     */
    private String resolveTenantIdForCreate(CreateAdminUserRequest req, String requesterRole) {
        if ("superadmin".equals(requesterRole)) {
            return req.getTenantId();
        }
        return TenantContext.getTenantId();
    }

    @Transactional
    public void revokeUser(String target, String requesterUsername) {
        if (target.equals(requesterUsername)) {
            throw new AppException(HttpStatus.BAD_REQUEST, "You cannot revoke your own account.");
        }
        String tenantId = TenantContext.getTenantId();
        int updated = tenantId != null
                ? userRepository.revokeByUsernameAndTenantId(target, tenantId)
                : userRepository.revokeByUsername(target);
        if (updated == 0) {
            throw new AppException(HttpStatus.NOT_FOUND, "User not found.");
        }
        log.info("User revoked: username='{}', by='{}', tenant='{}'", target, requesterUsername, tenantId);
    }

    @Transactional
    public void activateUser(String target) {
        String tenantId = TenantContext.getTenantId();
        int updated = tenantId != null
                ? userRepository.activateByUsernameAndTenantId(target, tenantId)
                : userRepository.activateByUsername(target);
        if (updated == 0) {
            throw new AppException(HttpStatus.NOT_FOUND, "User not found.");
        }
        log.info("User activated: username='{}', tenant='{}'", target, tenantId);
    }

    @Transactional
    public void changeRole(String target, String newRole, String explicitRoleId, String requesterUsername, String requesterRole) {
        if (target.equals(requesterUsername)) {
            throw new AppException(HttpStatus.BAD_REQUEST, "You cannot change your own role.");
        }
        boolean isSuperAdmin = "superadmin".equals(requesterRole);

        // Custom roles (non-system) are identified by explicitRoleId not being a system key.
        boolean isCustomRole = explicitRoleId != null && !ROLE_NAME_TO_ID.containsValue(explicitRoleId);

        if (!isCustomRole) {
            List<String> validRoles = isSuperAdmin
                    ? List.of("user", "admin", "client", "superadmin")
                    : List.of("user", "client");
            if (!validRoles.contains(newRole)) {
                String msg = isSuperAdmin
                        ? "Role must be \"user\", \"admin\", \"client\", \"superadmin\", or a custom role ID."
                        : "Admins can only assign \"user\" or \"client\" roles (or a custom role). Only Super Admin can assign the admin role.";
                throw new AppException(HttpStatus.BAD_REQUEST, msg);
            }
        }

        String tenantId = TenantContext.getTenantId();
        int updated = tenantId != null
                ? userRepository.updateRoleByUsernameAndTenantId(target, newRole, tenantId)
                : userRepository.updateRoleByUsername(target, newRole);
        if (updated == 0) {
            throw new AppException(HttpStatus.NOT_FOUND, "User not found.");
        }

        log.info("Role changed: username='{}', newRole='{}', roleId='{}', by='{}', tenant='{}'",
                target, newRole, explicitRoleId, requesterUsername, tenantId);

        // Sync role_id: prefer explicit ID, fall back to system name-to-ID map.
        String resolvedRoleId = (explicitRoleId != null && !explicitRoleId.isBlank())
                ? explicitRoleId
                : ROLE_NAME_TO_ID.getOrDefault(newRole, "role_user");
        userRepository.findByUsername(target).ifPresent(u -> {
            u.setRoleId(resolvedRoleId);
            userRepository.save(u);
        });
    }
}
