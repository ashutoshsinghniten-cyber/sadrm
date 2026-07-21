package com.sadrm.dto;

import java.util.List;

public class PatchPermissionsRequest {

    private List<String> add;
    private List<String> revoke;
    private String tenantId;

    public PatchPermissionsRequest() {}

    public List<String> getAdd()              { return add; }
    public void setAdd(List<String> add)      { this.add = add; }

    public List<String> getRevoke()           { return revoke; }
    public void setRevoke(List<String> revoke){ this.revoke = revoke; }

    public String getTenantId()                   { return tenantId; }
    public void setTenantId(String tenantId)      { this.tenantId = tenantId; }
}
