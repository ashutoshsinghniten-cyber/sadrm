package com.sadrm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateAdminUserRequest {

    @NotBlank(message = "Username is required.")
    @Size(min = 3, message = "Username must be at least 3 characters.")
    private String username;

    @NotBlank(message = "Password is required.")
    @Size(min = 6, message = "Password must be at least 6 characters.")
    private String password;

    private String role;

    private String tenantId;

    /** Optional: assign a specific dynamic roleId instead of role text. */
    private String roleId;

    public CreateAdminUserRequest() {
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getRoleId()            { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }
}
