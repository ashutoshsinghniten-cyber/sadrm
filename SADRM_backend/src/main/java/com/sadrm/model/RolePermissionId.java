package com.sadrm.model;

import java.io.Serializable;
import java.util.Objects;

public class RolePermissionId implements Serializable {

    private String roleId;
    private String permissionId;

    public RolePermissionId() {}

    public RolePermissionId(String roleId, String permissionId) {
        this.roleId       = roleId;
        this.permissionId = permissionId;
    }

    public String getRoleId()                { return roleId; }
    public void setRoleId(String roleId)     { this.roleId = roleId; }

    public String getPermissionId()                    { return permissionId; }
    public void setPermissionId(String permissionId)   { this.permissionId = permissionId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RolePermissionId that)) return false;
        return Objects.equals(roleId, that.roleId)
                && Objects.equals(permissionId, that.permissionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(roleId, permissionId);
    }
}
