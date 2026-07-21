package com.sadrm.controller;

import com.sadrm.dto.AdminUserDto;
import com.sadrm.dto.CreateAdminUserRequest;
import com.sadrm.dto.LoginRequest;
import com.sadrm.dto.LoginResponse;
import com.sadrm.dto.RegisterRequest;
import com.sadrm.exception.AppException;
import com.sadrm.security.TenantContext;
import com.sadrm.security.TenantValidator;
import com.sadrm.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Authentication and user management")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * POST /api/auth/login
     *
     * Authenticates the caller.  tenantKey is required for all non-superadmin accounts.
     * Superadmin may omit tenantKey (or pass null).
     */
    @PostMapping("/login")
    @Operation(
        summary = "Login",
        description = "Returns JWT token with roleId, tenantId, tenantKey. " +
                      "Non-superadmin callers must include tenantKey matching their assigned tenant. " +
                      "Public endpoint."
    )
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        LoginResponse resp = authService.login(req.getUsername(), req.getPassword(), req.getTenantKey());
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/register")
    @Operation(summary = "Register (disabled)", description = "Self-registration is disabled. Always returns 403.")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest req) {
        authService.register(req);
        Map<String, Object> body = new HashMap<>();
        body.put("username", req.getUsername().trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @GetMapping("/users")
    @PreAuthorize("hasAuthority('USER_READ')")
    @Operation(summary = "List usernames", description = "Requires USER_READ. Returns paginated usernames scoped to the caller's tenant (max 500).")
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> listUsernames() {
        List<String> usernames = authService.listUsernames();
        Map<String, Object> body = new HashMap<>();
        body.put("usernames", usernames);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/me")
    @Operation(
        summary = "Current user info",
        description = "Returns username, tenantId, tenantKey, and authorities (permission codes)."
    )
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> me(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            throw new AppException(HttpStatus.UNAUTHORIZED, "No token provided.");
        }

        Set<String> authorities = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toSet());

        String tenantId = TenantContext.getTenantId();

        Map<String, Object> body = new HashMap<>();
        body.put("username",    auth.getName());
        body.put("tenantId",    tenantId);
        body.put("tenantKey",   tenantId); // tenantKey is an alias for tenantId
        body.put("authorities", authorities);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/admin/users")
    @PreAuthorize("hasAuthority('USER_READ')")
    @Operation(
        summary = "List all users",
        description = "Requires USER_READ. Tenant-scoped. Paginated: ?limit=100&offset=0 (default 100, max 500). " +
                      "Response includes users[], total, limit, offset."
    )
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> adminListUsers(
            Authentication auth,
            @RequestParam(value = "limit",  defaultValue = "100") int limit,
            @RequestParam(value = "offset", defaultValue = "0")   int offset) {

        // Service returns { users, total, limit, offset } — backward-compatible: callers that
        // only read response.users continue to work; new callers can use total for pagination UI.
        return ResponseEntity.ok(authService.listAllUsers(auth.getName(), limit, offset));
    }

    /**
     * POST /api/auth/admin/users
     *
     * Creates a new user.
     *  - Superadmin: may specify tenantId and any role (including "admin").
     *  - Admin: tenantId is automatically assigned from their JWT (cannot be overridden).
     *           May only create "user" or "client" role accounts.
     */
    @PostMapping("/admin/users")
    @PreAuthorize("hasAuthority('USER_CREATE')")
    @Operation(
        summary = "Create user",
        description = "Requires USER_CREATE. " +
                      "Admin callers: tenantKey is auto-inherited from JWT (cannot be specified manually); " +
                      "only user/client roles are allowed. " +
                      "Super Admin callers: may specify tenantId and any role including admin."
    )
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> adminCreateUser(
            @Valid @RequestBody CreateAdminUserRequest req,
            Authentication auth) {

        String requesterRole = extractRoleName(auth);
        AdminUserDto created = authService.createAdminUser(req, requesterRole);

        Map<String, Object> body = new HashMap<>();
        body.put("ok",        true);
        body.put("username",  created.getUsername());
        body.put("role",      created.getRole());
        body.put("roleId",    created.getRoleId());
        body.put("tenantId",  created.getTenantId());
        body.put("tenantKey", created.getTenantId()); // alias for tenantId
        body.put("active",    created.isActive());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PatchMapping("/admin/users/{username}/revoke")
    @PreAuthorize("hasAuthority('USER_UPDATE')")
    @Operation(
        summary = "Revoke user",
        description = "Requires USER_UPDATE. Sets active=false. Admin can only revoke users in their own tenant."
    )
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> revokeUser(
            @PathVariable String username,
            Authentication auth) {

        authService.revokeUser(username, auth.getName());
        Map<String, Object> body = new HashMap<>();
        body.put("ok",        true);
        body.put("username",  username);
        body.put("tenantId",  TenantContext.getTenantId());
        body.put("tenantKey", TenantContext.getTenantId());
        body.put("active",    false);
        return ResponseEntity.ok(body);
    }

    @PatchMapping("/admin/users/{username}/activate")
    @PreAuthorize("hasAuthority('USER_UPDATE')")
    @Operation(
        summary = "Activate user",
        description = "Requires USER_UPDATE. Sets active=true. Admin can only activate users in their own tenant."
    )
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> activateUser(@PathVariable String username) {
        authService.activateUser(username);
        Map<String, Object> body = new HashMap<>();
        body.put("ok",        true);
        body.put("username",  username);
        body.put("tenantId",  TenantContext.getTenantId());
        body.put("tenantKey", TenantContext.getTenantId());
        body.put("active",    true);
        return ResponseEntity.ok(body);
    }

    @PatchMapping("/admin/users/{username}/role")
    @PreAuthorize("hasAuthority('USER_UPDATE')")
    @Operation(
        summary = "Change user role",
        description = "Requires USER_UPDATE. Updates role text and syncs role_id. " +
                      "Admin can only assign 'user' or 'client' roles. " +
                      "Super Admin can assign any role."
    )
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> changeRole(
            @PathVariable String username,
            @RequestBody Map<String, String> body,
            Authentication auth) {

        TenantValidator.validate(body.get("tenantId"));
        String newRole       = body.get("role");
        String newRoleId     = body.get("roleId");   // explicit role ID for custom roles
        String requesterRole = extractRoleName(auth);
        authService.changeRole(username, newRole, newRoleId, auth.getName(), requesterRole);

        Map<String, Object> resp = new HashMap<>();
        resp.put("ok",        true);
        resp.put("username",  username);
        resp.put("role",      newRole);
        resp.put("tenantId",  TenantContext.getTenantId());
        resp.put("tenantKey", TenantContext.getTenantId());
        return ResponseEntity.ok(resp);
    }

    /**
     * Determines whether the authenticated caller is a superadmin.
     * Uses TENANT_CREATE permission as the discriminating signal — only role_superadmin carries it.
     */
    private String extractRoleName(Authentication auth) {
        boolean isSuperAdmin = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(a -> a.equals("TENANT_CREATE"));
        return isSuperAdmin ? "superadmin" : "admin";
    }
}
