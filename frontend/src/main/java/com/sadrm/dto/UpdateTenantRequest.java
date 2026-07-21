package com.sadrm.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class UpdateTenantRequest {

    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters.")
    private String name;

    @Pattern(regexp = "^[a-z0-9-]+$", message = "Slug must contain only lowercase letters, digits, and hyphens.")
    @Size(min = 2, max = 60, message = "Slug must be between 2 and 60 characters.")
    private String slug;

    private Boolean active;

    public UpdateTenantRequest() {}

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }
}
