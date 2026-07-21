package com.sadrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

@Entity
@Table(name = "role_permissions")
@IdClass(RolePermissionId.class)
public class RolePermission {

    @Id
    @Column(name = "role_id", nullable = false)
    private String roleId;

    @Id
    @Column(name = "permission_id", nullable = false)
    private String permissionId;

    public RolePermission() {}

    public RolePermission(String roleId, String permissionId) {
        this.roleId       = roleId;
        this.permissionId = permissionId;
    }

    public String getRoleId()                { return roleId; }
    public void setRoleId(String roleId)     { this.roleId = roleId; }

    public String getPermissionId()                    { return permissionId; }
    public void setPermissionId(String permissionId)   { this.permissionId = permissionId; }
}
