package com.sadrm.service;

import com.sadrm.dto.CreatePermissionRequest;
import com.sadrm.dto.PermissionDto;
import com.sadrm.exception.AppException;
import com.sadrm.model.Permission;
import com.sadrm.repository.PermissionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class PermissionService {

    private static final Logger log = LoggerFactory.getLogger(PermissionService.class);

    private final PermissionRepository permissionRepository;

    public PermissionService(PermissionRepository permissionRepository) {
        this.permissionRepository = permissionRepository;
    }

    /** Returns all permissions grouped by category. */
    public Map<String, List<PermissionDto>> listGroupedByCategory() {
        List<Permission> all = permissionRepository.findAllByOrderByCategoryAscCodeAsc();
        Map<String, List<PermissionDto>> grouped = new LinkedHashMap<>();
        all.stream()
                .collect(Collectors.groupingBy(Permission::getCategory,
                        LinkedHashMap::new,
                        Collectors.mapping(PermissionDto::from, Collectors.toList())))
                .forEach(grouped::put);
        return grouped;
    }

    /** Returns a flat list of all permissions. */
    public List<PermissionDto> listAll() {
        return permissionRepository.findAllByOrderByCategoryAscCodeAsc()
                .stream().map(PermissionDto::from).collect(Collectors.toList());
    }

    @Transactional
    public PermissionDto create(CreatePermissionRequest req) {
        String code = req.getCode().trim().toUpperCase();
        if (permissionRepository.existsByCode(code)) {
            throw new AppException(HttpStatus.CONFLICT, "Permission code '" + code + "' already exists.");
        }
        Permission perm = new Permission();
        perm.setId("perm_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        perm.setCode(code);
        perm.setDescription(req.getDescription().trim());
        perm.setCategory(req.getCategory().trim().toUpperCase());
        perm.setCreatedAt(OffsetDateTime.now());
        PermissionDto saved = PermissionDto.from(permissionRepository.save(perm));
        log.info("Permission created: id='{}', code='{}', category='{}'", saved.getId(), code, req.getCategory().trim().toUpperCase());
        return saved;
    }

    public PermissionDto getById(String id) {
        return PermissionDto.from(
                permissionRepository.findById(id)
                        .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Permission not found.")));
    }
}
