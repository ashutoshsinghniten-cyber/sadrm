package com.sadrm.controller;

import com.sadrm.dto.CreatePermissionRequest;
import com.sadrm.dto.PermissionDto;
import com.sadrm.service.PermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/permissions")
@Tag(name = "Permissions", description = "Permission catalog — 36 built-in + custom permissions")
@SecurityRequirement(name = "BearerAuth")
public class PermissionController {

    private final PermissionService permissionService;

    public PermissionController(PermissionService permissionService) {
        this.permissionService = permissionService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERMISSION_READ')")
    @Operation(
        summary = "List all permissions",
        description = "Requires PERMISSION_READ. Returns permissions grouped by category and as a flat list."
    )
    public ResponseEntity<Map<String, Object>> listPermissions() {
        Map<String, Object> body = new HashMap<>();
        body.put("permissions", permissionService.listGroupedByCategory());
        body.put("flat",        permissionService.listAll());
        return ResponseEntity.ok(body);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PERMISSION_CREATE')")
    @Operation(
        summary = "Create custom permission",
        description = "Requires PERMISSION_CREATE (superadmin only). Code must be UPPER_SNAKE_CASE."
    )
    public ResponseEntity<PermissionDto> createPermission(
            @Valid @RequestBody CreatePermissionRequest req) {
        PermissionDto created = permissionService.create(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
