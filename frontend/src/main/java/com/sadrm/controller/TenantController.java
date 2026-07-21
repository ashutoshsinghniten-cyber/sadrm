package com.sadrm.controller;

import com.sadrm.dto.CreateTenantRequest;
import com.sadrm.dto.UpdateTenantRequest;
import com.sadrm.model.Tenant;
import com.sadrm.service.TenantService;
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
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/tenants")
@Tag(name = "Tenants", description = "Tenant management — superadmin only")
@SecurityRequirement(name = "BearerAuth")
public class TenantController {

    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    /**
     * GET /api/admin/tenants/for-login
     *
     * Public endpoint — no JWT required. Returns only the fields the login-page dropdown
     * needs (id, name, slug) for active, non-deleted tenants. Internal audit fields
     * (createdBy, updatedBy, timestamps) are intentionally omitted.
     */
    @GetMapping("/for-login")
    @Operation(summary = "List tenants (login dropdown)", description = "Public. Returns id/name/slug only for active tenants. No auth required.")
    public ResponseEntity<Map<String, Object>> listTenantsForLogin() {
        List<Map<String, Object>> slim = tenantService.listAll().stream()
                .filter(t -> t.isActive() && !t.isDeleted())
                .map(t -> {
                    Map<String, Object> entry = new HashMap<>();
                    entry.put("id",   t.getId());
                    entry.put("name", t.getName());
                    entry.put("slug", t.getSlug());
                    return entry;
                })
                .collect(Collectors.toList());
        Map<String, Object> body = new HashMap<>();
        body.put("tenants", slim);
        body.put("count",   slim.size());
        return ResponseEntity.ok(body);
    }

    /** GET /api/admin/tenants — full list with metadata, superadmin only */
    @GetMapping
    @PreAuthorize("hasAuthority('TENANT_READ')")
    @Operation(summary = "List tenants (admin)", description = "Requires TENANT_READ. Returns full tenant objects including audit fields.")
    public ResponseEntity<Map<String, Object>> listTenants() {
        List<Tenant> tenants = tenantService.listAll();
        Map<String, Object> body = new HashMap<>();
        body.put("tenants", tenants);
        body.put("count",   tenants.size());
        return ResponseEntity.ok(body);
    }

    /** GET /api/admin/tenants/{id} */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('TENANT_READ')")
    @Operation(summary = "Get tenant by ID", description = "Requires TENANT_READ.")
    public ResponseEntity<Tenant> getTenant(@PathVariable String id) {
        return ResponseEntity.ok(tenantService.getById(id));
    }

    /** POST /api/admin/tenants */
    @PostMapping
    @PreAuthorize("hasAuthority('TENANT_CREATE')")
    @Operation(summary = "Create tenant", description = "Requires TENANT_CREATE. Slug must be unique lowercase-alphanumeric-hyphen.")
    public ResponseEntity<Map<String, Object>> createTenant(
            @Valid @RequestBody CreateTenantRequest req,
            Authentication auth) {

        Tenant tenant = tenantService.create(req, auth.getName());
        Map<String, Object> body = new HashMap<>();
        body.put("ok",        true);
        body.put("id",        tenant.getId());
        body.put("name",      tenant.getName());
        body.put("slug",      tenant.getSlug());
        body.put("active",    tenant.isActive());
        body.put("createdBy", tenant.getCreatedBy());
        body.put("createdAt", tenant.getCreatedAt());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    /** PUT /api/admin/tenants/{id} */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('TENANT_UPDATE')")
    @Operation(summary = "Update tenant", description = "Requires TENANT_UPDATE. All fields optional — send only what changes.")
    public ResponseEntity<Map<String, Object>> updateTenant(
            @PathVariable String id,
            @Valid @RequestBody UpdateTenantRequest req,
            Authentication auth) {

        Tenant tenant = tenantService.update(id, req, auth.getName());
        Map<String, Object> body = new HashMap<>();
        body.put("ok",        true);
        body.put("id",        tenant.getId());
        body.put("name",      tenant.getName());
        body.put("slug",      tenant.getSlug());
        body.put("active",    tenant.isActive());
        body.put("updatedBy", tenant.getUpdatedBy());
        body.put("updatedAt", tenant.getUpdatedAt());
        return ResponseEntity.ok(body);
    }

    /** DELETE /api/admin/tenants/{id} */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('TENANT_DELETE')")
    @Operation(summary = "Delete tenant (soft)", description = "Requires TENANT_DELETE. Sets deleted=true, active=false. Data is preserved.")
    public ResponseEntity<Map<String, Object>> deleteTenant(
            @PathVariable String id,
            Authentication auth) {

        tenantService.delete(id, auth.getName());
        Map<String, Object> body = new HashMap<>();
        body.put("ok",      true);
        body.put("id",      id);
        body.put("deleted", true);
        return ResponseEntity.ok(body);
    }

    /** PATCH /api/admin/tenants/{id}/activate */
    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('TENANT_UPDATE')")
    @Operation(summary = "Activate tenant", description = "Requires TENANT_UPDATE.")
    public ResponseEntity<Map<String, Object>> activate(@PathVariable String id) {
        Tenant tenant = tenantService.activate(id);
        Map<String, Object> body = new HashMap<>();
        body.put("ok",     true);
        body.put("id",     tenant.getId());
        body.put("active", true);
        return ResponseEntity.ok(body);
    }

    /** PATCH /api/admin/tenants/{id}/deactivate */
    @PatchMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('TENANT_UPDATE')")
    @Operation(summary = "Deactivate tenant", description = "Requires TENANT_UPDATE.")
    public ResponseEntity<Map<String, Object>> deactivate(@PathVariable String id) {
        Tenant tenant = tenantService.deactivate(id);
        Map<String, Object> body = new HashMap<>();
        body.put("ok",     true);
        body.put("id",     tenant.getId());
        body.put("active", false);
        return ResponseEntity.ok(body);
    }
}
