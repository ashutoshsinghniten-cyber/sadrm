package com.sadrm.dto;

import com.sadrm.model.Permission;

public class PermissionDto {

    private String id;
    private String code;
    private String description;
    private String category;

    public PermissionDto() {}

    public static PermissionDto from(Permission p) {
        PermissionDto dto = new PermissionDto();
        dto.id          = p.getId();
        dto.code        = p.getCode();
        dto.description = p.getDescription();
        dto.category    = p.getCategory();
        return dto;
    }

    public String getId()          { return id; }
    public String getCode()        { return code; }
    public String getDescription() { return description; }
    public String getCategory()    { return category; }
}
