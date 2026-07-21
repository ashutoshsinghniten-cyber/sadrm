package com.sadrm.controller;

import com.sadrm.dto.AssignPermissionsRequest;
import com.sadrm.dto.CreateRoleRequest;
import com.sadrm.dto.PatchPermissionsRequest;
import com.sadrm.dto.RoleDto;
import com.sadrm.dto.UpdateRoleRequest;
import com.sadrm.service.RoleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/roles")
@Tag(name = "Roles", description = "Dynamic role management (RBAC)")
@SecurityRequirement(name = "BearerAuth")
public class RoleController {

    private final RoleService roleService;

    public RoleController(RoleService roleService) {
        this.roleService = roleService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_READ')")
    @Operation(
        summary = "List roles",
        description = "Requires ROLE_READ. Superadmin sees all roles; tenant users see system roles + own tenant's custom roles."
    )
    public ResponseEntity<Map<String, Object>> listRoles() {
        List<RoleDto> roles = roleService.listRoles();
        Map<String, Object> body = new HashMap<>();
        body.put("roles", roles);
        body.put("count", roles.size());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_READ')")
    @Operation(summary = "Get role by ID", description = "Requires ROLE_READ. Returns role with full permission list.")
    public ResponseEntity<RoleDto> getRole(@PathVariable String id) {
        return ResponseEntity.ok(roleService.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_CREATE')")
    @Operation(
        summary = "Create role",
        description = "Requires ROLE_CREATE. Tenant admin creates tenant-scoped role; superadmin creates system-level role."
    )
    public ResponseEntity<RoleDto> createRole(
            @Valid @RequestBody CreateRoleRequest req,
            Authentication auth) {
        RoleDto created = roleService.createRole(req, auth.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_UPDATE')")
    @Operation(
        summary = "Update role",
        description = "Requires ROLE_UPDATE. Updates name, description, or active flag. Cannot modify system roles as tenant admin."
    )
    public ResponseEntity<RoleDto> updateRole(
            @PathVariable String id,
            @Valid @RequestBody UpdateRoleRequest req,
            Authentication auth) {
        return ResponseEntity.ok(roleService.updateRole(id, req, auth.getName()));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_DELETE')")
    @Operation(
        summary = "Delete role (soft)",
        description = "Requires ROLE_DELETE. Sets deleted=true. Cannot delete system roles. Redis cache evicted immediately."
    )
    public ResponseEntity<Map<String, Object>> deleteRole(
            @PathVariable String id,
            Authentication auth) {
        roleService.deleteRole(id, auth.getName());
        Map<String, Object> body = new HashMap<>();
        body.put("ok", true);
        body.put("id", id);
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{id}/permissions")
    @PreAuthorize("hasAuthority('ROLE_UPDATE')")
    @Operation(
        summary = "Assign permissions to role (full replace)",
        description = "Requires ROLE_UPDATE. Full replace — sends empty list to remove all permissions. Redis cache evicted."
    )
    public ResponseEntity<RoleDto> assignPermissions(
            @PathVariable String id,
            @Valid @RequestBody AssignPermissionsRequest req,
            Authentication auth) {
        return ResponseEntity.ok(roleService.assignPermissions(id, req, auth.getName()));
    }

    @PatchMapping("/{id}/permissions")
    @PreAuthorize("hasAuthority('ROLE_UPDATE')")
    @Operation(
        summary = "Patch role permissions (add + revoke)",
        description = "Requires ROLE_UPDATE. Use 'add' list to add permissions, 'revoke' list to remove them. Both are optional. Existing permissions not in either list are untouched. Redis cache evicted."
    )
    public ResponseEntity<RoleDto> patchPermissions(
            @PathVariable String id,
            @RequestBody PatchPermissionsRequest req,
            Authentication auth) {
        return ResponseEntity.ok(roleService.patchPermissions(id, req, auth.getName()));
    }
}
