package com.sadrm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class CreateTenantRequest {

    @NotBlank(message = "Tenant name is required.")
    @Size(min = 2, max = 100, message = "Tenant name must be between 2 and 100 characters.")
    private String name;

    @NotBlank(message = "Slug is required.")
    @Size(min = 2, max = 50, message = "Slug must be between 2 and 50 characters.")
    @Pattern(regexp = "^[a-z0-9-]+$", message = "Slug must contain only lowercase letters, digits, and hyphens.")
    private String slug;

    public CreateTenantRequest() {
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
}
