package com.sadrm.service;

import com.sadrm.dto.CreateTenantRequest;
import com.sadrm.dto.UpdateTenantRequest;
import com.sadrm.exception.AppException;
import com.sadrm.model.Tenant;
import com.sadrm.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class TenantService {

    private static final Logger log = LoggerFactory.getLogger(TenantService.class);

    private final TenantRepository tenantRepository;

    public TenantService(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    public List<Tenant> listAll() {
        return tenantRepository.findAllByDeletedFalseOrderByCreatedAtDesc();
    }

    public Tenant getById(String tenantId) {
        return tenantRepository.findByIdAndDeletedFalse(tenantId)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Tenant not found."));
    }

    @Transactional
    public Tenant create(CreateTenantRequest req, String createdBy) {
        String slug = req.getSlug().trim().toLowerCase();
        if (tenantRepository.existsBySlugAndDeletedFalse(slug)) {
            throw new AppException(HttpStatus.CONFLICT, "A tenant with that slug already exists.");
        }

        OffsetDateTime now = OffsetDateTime.now();
        Tenant tenant = new Tenant();
        tenant.setId("tenant_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        tenant.setName(req.getName().trim());
        tenant.setSlug(slug);
        tenant.setActive(true);
        tenant.setDeleted(false);
        tenant.setCreatedBy(createdBy);
        tenant.setUpdatedBy(createdBy);
        tenant.setCreatedAt(now);
        tenant.setUpdatedAt(now);
        Tenant saved = tenantRepository.save(tenant);
        log.info("Tenant created: id='{}', slug='{}', by='{}'", saved.getId(), saved.getSlug(), createdBy);
        return saved;
    }

    /** Legacy overload used by DataInitializer (no requester context). */
    @Transactional
    public Tenant create(CreateTenantRequest req) {
        return create(req, "system");
    }

    @Transactional
    public Tenant update(String tenantId, UpdateTenantRequest req, String updatedBy) {
        Tenant tenant = getById(tenantId);

        if (req.getName() != null && !req.getName().isBlank()) {
            tenant.setName(req.getName().trim());
        }

        if (req.getSlug() != null && !req.getSlug().isBlank()) {
            String newSlug = req.getSlug().trim().toLowerCase();
            if (!newSlug.equals(tenant.getSlug())
                    && tenantRepository.existsBySlugAndIdNotAndDeletedFalse(newSlug, tenantId)) {
                throw new AppException(HttpStatus.CONFLICT, "A tenant with that slug already exists.");
            }
            tenant.setSlug(newSlug);
        }

        if (req.getActive() != null) {
            tenant.setActive(req.getActive());
        }

        tenant.setUpdatedBy(updatedBy);
        tenant.setUpdatedAt(OffsetDateTime.now());
        Tenant saved = tenantRepository.save(tenant);
        log.info("Tenant updated: id='{}', by='{}'", tenantId, updatedBy);
        return saved;
    }

    @Transactional
    public void delete(String tenantId, String deletedBy) {
        Tenant tenant = getById(tenantId);
        tenant.setDeleted(true);
        tenant.setActive(false);
        tenant.setUpdatedBy(deletedBy);
        tenant.setUpdatedAt(OffsetDateTime.now());
        tenantRepository.save(tenant);
        log.info("Tenant deleted (soft): id='{}', by='{}'", tenantId, deletedBy);
    }

    @Transactional
    public Tenant deactivate(String tenantId) {
        Tenant tenant = getById(tenantId);
        tenant.setActive(false);
        tenant.setUpdatedAt(OffsetDateTime.now());
        Tenant saved = tenantRepository.save(tenant);
        log.info("Tenant deactivated: id='{}'", tenantId);
        return saved;
    }

    @Transactional
    public Tenant activate(String tenantId) {
        Tenant tenant = getById(tenantId);
        tenant.setActive(true);
        tenant.setUpdatedAt(OffsetDateTime.now());
        Tenant saved = tenantRepository.save(tenant);
        log.info("Tenant activated: id='{}'", tenantId);
        return saved;
    }
}
