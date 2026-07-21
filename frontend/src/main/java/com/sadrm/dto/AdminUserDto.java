package com.sadrm.dto;

import java.time.OffsetDateTime;

public class AdminUserDto {

    private String username;
    private String role;
    private String roleId;
    private String tenantId;
    private String tenantKey;
    private boolean active;
    private OffsetDateTime createdAt;

    public AdminUserDto() {
    }

    public AdminUserDto(String username, String role, String roleId, String tenantId,
                        boolean active, OffsetDateTime createdAt) {
        this.username  = username;
        this.role      = role;
        this.roleId    = roleId;
        this.tenantId  = tenantId;
        this.tenantKey = tenantId; // tenantKey is an alias for tenantId
        this.active    = active;
        this.createdAt = createdAt;
    }

    public String getUsername()               { return username; }
    public void setUsername(String username)  { this.username = username; }

    public String getRole()               { return role; }
    public void setRole(String role)      { this.role = role; }

    public String getRoleId()             { return roleId; }
    public void setRoleId(String roleId)  { this.roleId = roleId; }

    public String getTenantId()                   { return tenantId; }
    public void setTenantId(String tenantId)      { this.tenantId = tenantId; }

    public String getTenantKey()                    { return tenantKey; }
    public void setTenantKey(String tenantKey)      { this.tenantKey = tenantKey; }

    public boolean isActive()                 { return active; }
    public void setActive(boolean active)     { this.active = active; }

    public OffsetDateTime getCreatedAt()                    { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt)      { this.createdAt = createdAt; }
}
