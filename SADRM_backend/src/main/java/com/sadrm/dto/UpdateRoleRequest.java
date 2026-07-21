package com.sadrm.dto;

import jakarta.validation.constraints.Size;

public class UpdateRoleRequest {

    @Size(min = 2, max = 80)
    private String name;

    @Size(max = 255)
    private String description;

    private Boolean active;

    private String tenantId;

    public UpdateRoleRequest() {}

    public String getName()              { return name; }
    public void setName(String n)        { this.name = n; }

    public String getDescription()       { return description; }
    public void setDescription(String d) { this.description = d; }

    public Boolean getActive()            { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public String getTenantId()                   { return tenantId; }
    public void setTenantId(String tenantId)      { this.tenantId = tenantId; }
}
