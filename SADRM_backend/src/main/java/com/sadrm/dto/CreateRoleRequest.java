package com.sadrm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public class CreateRoleRequest {

    @NotBlank(message = "Role name is required.")
    @Size(min = 2, max = 80, message = "Role name must be 2–80 characters.")
    private String name;

    @Size(max = 255, message = "Description cannot exceed 255 characters.")
    private String description;

    /** Optional: permission IDs to assign on creation. */
    private List<String> permissionIds;

    private String tenantId;

    public CreateRoleRequest() {}

    public String getName()        { return name; }
    public void setName(String n)  { this.name = n; }

    public String getDescription()               { return description; }
    public void setDescription(String d)         { this.description = d; }

    public List<String> getPermissionIds()               { return permissionIds; }
    public void setPermissionIds(List<String> ids)       { this.permissionIds = ids; }

    public String getTenantId()                   { return tenantId; }
    public void setTenantId(String tenantId)      { this.tenantId = tenantId; }
}
