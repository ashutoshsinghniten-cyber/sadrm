package com.sadrm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class CreatePermissionRequest {

    @NotBlank(message = "Permission code is required.")
    @Size(min = 3, max = 80)
    @Pattern(regexp = "^[A-Z][A-Z0-9_]*$", message = "Code must be UPPER_SNAKE_CASE (e.g. REPORT_VIEW).")
    private String code;

    @NotBlank(message = "Description is required.")
    @Size(max = 255)
    private String description;

    @NotBlank(message = "Category is required.")
    @Size(max = 50)
    private String category;

    public CreatePermissionRequest() {}

    public String getCode()              { return code; }
    public void setCode(String code)     { this.code = code; }

    public String getDescription()               { return description; }
    public void setDescription(String d)         { this.description = d; }

    public String getCategory()              { return category; }
    public void setCategory(String category) { this.category = category; }
}
