package com.sadrm.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;

public class AssignPermissionsRequest {

    @NotNull(message = "permissionIds list is required (can be empty to remove all).")
    private List<String> permissionIds;

    private String tenantId;

    public AssignPermissionsRequest() {}

    public List<String> getPermissionIds()           { return permissionIds; }
    public void setPermissionIds(List<String> ids)   { this.permissionIds = ids; }

    public String getTenantId()                   { return tenantId; }
    public void setTenantId(String tenantId)      { this.tenantId = tenantId; }
}
