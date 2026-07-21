package com.sadrm.dto;

import java.util.List;

public class LoginResponse {

    private String token;
    private String username;
    private String role;
    private String tenantId;
    private String tenantKey;
    private String roleId;
    private List<String> authorities;

    public LoginResponse() {}

    public LoginResponse(String token, String username, String role, String tenantId, String roleId,
                         List<String> authorities) {
        this.token       = token;
        this.username    = username;
        this.role        = role;
        this.tenantId    = tenantId;
        this.tenantKey   = tenantId;
        this.roleId      = roleId;
        this.authorities = authorities;
    }

    public String getToken()    { return token; }
    public void setToken(String token) { this.token = token; }

    public String getUsername()          { return username; }
    public void setUsername(String u)    { this.username = u; }

    public String getRole()          { return role; }
    public void setRole(String role) { this.role = role; }

    public String getTenantId()              { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getTenantKey()               { return tenantKey; }
    public void setTenantKey(String tenantKey) { this.tenantKey = tenantKey; }

    public String getRoleId()            { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public List<String> getAuthorities()                   { return authorities; }
    public void setAuthorities(List<String> authorities)   { this.authorities = authorities; }
}
