package com.sadrm.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "roles")
public class Role {

    @Id
    @Column(name = "id", nullable = false)
    private String id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "tenant_id")
    private String tenantId;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "is_system", nullable = false)
    private boolean system = false;

    @Column(name = "deleted", nullable = false)
    private boolean deleted = false;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public Role() {}

    public String getId()          { return id; }
    public void setId(String id)   { this.id = id; }

    public String getName()            { return name; }
    public void setName(String name)   { this.name = name; }

    public String getDescription()                 { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getTenantId()              { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public boolean isActive()             { return active; }
    public void setActive(boolean active) { this.active = active; }

    public boolean isSystem()             { return system; }
    public void setSystem(boolean system) { this.system = system; }

    public boolean isDeleted()              { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }

    public String getCreatedBy()               { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getUpdatedBy()               { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public OffsetDateTime getCreatedAt()                 { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt)   { this.createdAt = createdAt; }

    public OffsetDateTime getUpdatedAt()                 { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt)   { this.updatedAt = updatedAt; }
}
