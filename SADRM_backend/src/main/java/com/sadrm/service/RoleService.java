package com.sadrm.service;

import com.sadrm.dto.AssignPermissionsRequest;
import com.sadrm.dto.CreateRoleRequest;
import com.sadrm.dto.PermissionDto;
import com.sadrm.dto.PatchPermissionsRequest;
import com.sadrm.dto.RoleDto;
import com.sadrm.dto.UpdateRoleRequest;
import com.sadrm.exception.AppException;
import com.sadrm.model.Permission;
import com.sadrm.model.Role;
import com.sadrm.model.RolePermission;
import com.sadrm.repository.PermissionRepository;
import com.sadrm.repository.RolePermissionRepository;
import com.sadrm.repository.RoleRepository;
import com.sadrm.security.TenantContext;
import com.sadrm.security.TenantValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class RoleService {

    private static final Logger log = LoggerFactory.getLogger(RoleService.class);

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final RolePermissionRepository rolePermissionRepository;
    private final DynamicPermissionService dynamicPermissionService;

    public RoleService(RoleRepository roleRepository,
                       PermissionRepository permissionRepository,
                       RolePermissionRepository rolePermissionRepository,
                       DynamicPermissionService dynamicPermissionService) {
        this.roleRepository            = roleRepository;
        this.permissionRepository      = permissionRepository;
        this.rolePermissionRepository  = rolePermissionRepository;
        this.dynamicPermissionService  = dynamicPermissionService;
    }

    /** Returns roles visible to the caller: superadmin sees all, tenant users see their tenant's roles + system roles. */
    public List<RoleDto> listRoles() {
        String tenantId = TenantContext.getTenantId();
        List<Role> roles = tenantId != null
                ? roleRepository.findAvailableForTenant(tenantId)
                : roleRepository.findAllActive();
        return roles.stream().map(this::toDtoWithPermissions).collect(Collectors.toList());
    }

    public RoleDto getById(String roleId) {
        Role role = resolveAccessibleRole(roleId);
        return toDtoWithPermissions(role);
    }

    @Transactional
    public RoleDto createRole(CreateRoleRequest req, String createdBy) {
        TenantValidator.validate(req.getTenantId());
        String tenantId = TenantContext.getTenantId();

        if (tenantId == null) {
            // Superadmin creating a system-level role
            if (roleRepository.existsByNameAndTenantIdIsNullAndDeletedFalse(req.getName())) {
                throw new AppException(HttpStatus.CONFLICT, "A system role with that name already exists.");
            }
        } else {
            if (roleRepository.existsByNameAndTenantIdAndDeletedFalse(req.getName(), tenantId)) {
                throw new AppException(HttpStatus.CONFLICT, "A role with that name already exists in your tenant.");
            }
        }

        Role role = new Role();
        role.setId("role_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        role.setName(req.getName().trim());
        role.setDescription(req.getDescription() != null ? req.getDescription().trim() : null);
        role.setTenantId(tenantId);
        role.setActive(true);
        role.setSystem(false);
        role.setDeleted(false);
        role.setCreatedBy(createdBy);
        role.setUpdatedBy(createdBy);
        role.setCreatedAt(OffsetDateTime.now());
        role.setUpdatedAt(OffsetDateTime.now());
        roleRepository.save(role);

        if (req.getPermissionIds() != null && !req.getPermissionIds().isEmpty()) {
            assignPermissionsInternal(role.getId(), req.getPermissionIds());
        }

        log.info("Role created: id='{}', name='{}', tenant='{}', by='{}'", role.getId(), role.getName(), TenantContext.getTenantId(), createdBy);
        return toDtoWithPermissions(role);
    }

    @Transactional
    public RoleDto updateRole(String roleId, UpdateRoleRequest req, String updatedBy) {
        TenantValidator.validate(req.getTenantId());
        Role role = resolveAccessibleRole(roleId);
        guardSystemRole(role, "update");

        if (req.getName() != null) {
            String tenantId = role.getTenantId();
            boolean nameTaken = tenantId != null
                    ? roleRepository.existsByNameAndTenantIdAndDeletedFalse(req.getName(), tenantId)
                    : roleRepository.existsByNameAndTenantIdIsNullAndDeletedFalse(req.getName());
            if (nameTaken && !role.getName().equals(req.getName())) {
                throw new AppException(HttpStatus.CONFLICT, "A role with that name already exists.");
            }
            role.setName(req.getName().trim());
        }
        if (req.getDescription() != null) role.setDescription(req.getDescription().trim());
        if (req.getActive() != null)      role.setActive(req.getActive());

        role.setUpdatedBy(updatedBy);
        role.setUpdatedAt(OffsetDateTime.now());
        roleRepository.save(role);
        log.info("Role updated: id='{}', by='{}'", roleId, updatedBy);
        return toDtoWithPermissions(role);
    }

    @Transactional
    public void deleteRole(String roleId, String deletedBy) {
        Role role = resolveAccessibleRole(roleId);
        guardSystemRole(role, "delete");
        role.setDeleted(true);
        role.setUpdatedBy(deletedBy);
        role.setUpdatedAt(OffsetDateTime.now());
        roleRepository.save(role);
        dynamicPermissionService.evict(roleId);
        log.info("Role deleted: id='{}', by='{}'", roleId, deletedBy);
    }

    @Transactional
    public RoleDto assignPermissions(String roleId, AssignPermissionsRequest req, String updatedBy) {
        TenantValidator.validate(req.getTenantId());
        Role role = resolveAccessibleRole(roleId);

        // System roles can only be modified by superadmin (tenantId = null)
        if (role.isSystem() && TenantContext.getTenantId() != null) {
            throw new AppException(HttpStatus.FORBIDDEN, "System roles cannot be modified by tenant admins.");
        }

        rolePermissionRepository.deleteAllByRoleId(roleId);
        if (req.getPermissionIds() != null && !req.getPermissionIds().isEmpty()) {
            assignPermissionsInternal(roleId, req.getPermissionIds());
        }

        role.setUpdatedBy(updatedBy);
        role.setUpdatedAt(OffsetDateTime.now());
        roleRepository.save(role);
        dynamicPermissionService.evict(roleId);

        log.info("Permissions assigned to role: id='{}', count={}, by='{}'",
                roleId, req.getPermissionIds() != null ? req.getPermissionIds().size() : 0, updatedBy);
        return toDtoWithPermissions(role);
    }

    @Transactional
    public RoleDto patchPermissions(String roleId, PatchPermissionsRequest req, String updatedBy) {
        TenantValidator.validate(req.getTenantId());
        Role role = resolveAccessibleRole(roleId);

        if (role.isSystem() && TenantContext.getTenantId() != null) {
            throw new AppException(HttpStatus.FORBIDDEN, "System roles cannot be modified by tenant admins.");
        }

        if (req.getRevoke() != null) {
            for (String permId : req.getRevoke()) {
                rolePermissionRepository.deleteByRoleIdAndPermissionId(roleId, permId);
            }
        }

        if (req.getAdd() != null && !req.getAdd().isEmpty()) {
            Set<String> existing = rolePermissionRepository.findByRoleId(roleId)
                    .stream().map(RolePermission::getPermissionId).collect(Collectors.toSet());

            List<RolePermission> toSave = new ArrayList<>();
            for (String permId : req.getAdd()) {
                if (existing.contains(permId)) continue;
                if (!permissionRepository.existsById(permId)) {
                    throw new AppException(HttpStatus.BAD_REQUEST, "Permission not found: " + permId);
                }
                toSave.add(new RolePermission(roleId, permId));
            }
            if (!toSave.isEmpty()) {
                rolePermissionRepository.saveAll(toSave);
            }
        }

        role.setUpdatedBy(updatedBy);
        role.setUpdatedAt(OffsetDateTime.now());
        roleRepository.save(role);
        dynamicPermissionService.evict(roleId);

        log.info("Permissions patched for role: id='{}', added={}, revoked={}, by='{}'",
                roleId,
                req.getAdd() != null ? req.getAdd().size() : 0,
                req.getRevoke() != null ? req.getRevoke().size() : 0,
                updatedBy);
        return toDtoWithPermissions(role);
    }

    private void assignPermissionsInternal(String roleId, List<String> permissionIds) {
        List<RolePermission> toSave = new ArrayList<>();
        for (String permId : permissionIds) {
            if (!permissionRepository.existsById(permId)) {
                throw new AppException(HttpStatus.BAD_REQUEST, "Permission not found: " + permId);
            }
            toSave.add(new RolePermission(roleId, permId));
        }
        rolePermissionRepository.saveAll(toSave);
    }

    private Role resolveAccessibleRole(String roleId) {
        Role role = roleRepository.findByIdAndDeletedFalse(roleId)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Role not found."));

        String tenantId = TenantContext.getTenantId();
        if (tenantId != null && role.getTenantId() != null && !role.getTenantId().equals(tenantId)) {
            throw new AppException(HttpStatus.FORBIDDEN, "Access denied.");
        }
        return role;
    }

    private void guardSystemRole(Role role, String action) {
        if (role.isSystem() && TenantContext.getTenantId() != null) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "Cannot " + action + " a system role. Create a custom role instead.");
        }
    }

    private RoleDto toDtoWithPermissions(Role role) {
        RoleDto dto = RoleDto.from(role);

        List<String> permIds = rolePermissionRepository.findByRoleId(role.getId())
                .stream().map(RolePermission::getPermissionId).collect(Collectors.toList());

        List<PermissionDto> permDtos = permissionRepository.findAllById(permIds)
                .stream()
                .map(PermissionDto::from)
                .sorted(java.util.Comparator.comparing(PermissionDto::getCategory)
                        .thenComparing(PermissionDto::getCode))
                .collect(Collectors.toList());

        dto.setPermissions(permDtos);
        return dto;
    }
}
