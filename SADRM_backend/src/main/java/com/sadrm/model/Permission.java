package com.sadrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "permissions")
public class Permission {

    @Id
    @Column(name = "id", nullable = false)
    private String id;

    @Column(name = "code", nullable = false, unique = true)
    private String code;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public Permission() {}

    public String getId()          { return id; }
    public void setId(String id)   { this.id = id; }

    public String getCode()             { return code; }
    public void setCode(String code)    { this.code = code; }

    public String getDescription()                  { return description; }
    public void setDescription(String description)  { this.description = description; }

    public String getCategory()               { return category; }
    public void setCategory(String category)  { this.category = category; }

    public OffsetDateTime getCreatedAt()                  { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt)    { this.createdAt = createdAt; }
}
