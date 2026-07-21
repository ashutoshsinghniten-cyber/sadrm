package com.sadrm.dto;

import com.sadrm.model.Role;

import java.time.OffsetDateTime;
import java.util.List;

public class RoleDto {

    private String id;
    private String name;
    private String description;
    private String tenantId;
    private boolean active;
    private boolean system;
    private String createdBy;
    private String updatedBy;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private List<PermissionDto> permissions;

    public RoleDto() {}

    public static RoleDto from(Role r) {
        RoleDto dto = new RoleDto();
        dto.id          = r.getId();
        dto.name        = r.getName();
        dto.description = r.getDescription();
        dto.tenantId    = r.getTenantId();
        dto.active      = r.isActive();
        dto.system      = r.isSystem();
        dto.createdBy   = r.getCreatedBy();
        dto.updatedBy   = r.getUpdatedBy();
        dto.createdAt   = r.getCreatedAt();
        dto.updatedAt   = r.getUpdatedAt();
        return dto;
    }

    public String getId()          { return id; }
    public String getName()        { return name; }
    public String getDescription() { return description; }
    public String getTenantId()    { return tenantId; }
    public boolean isActive()      { return active; }
    public boolean isSystem()      { return system; }
    public String getCreatedBy()   { return createdBy; }
    public String getUpdatedBy()   { return updatedBy; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public List<PermissionDto> getPermissions()              { return permissions; }
    public void setPermissions(List<PermissionDto> perms)    { this.permissions = perms; }
}
