package com.sadrm.config;

import com.sadrm.model.Tenant;
import com.sadrm.model.User;
import com.sadrm.repository.TenantRepository;
import com.sadrm.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.time.OffsetDateTime;
import java.util.Base64;

@Component
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private static final int    PBKDF2_ITERATIONS   = 100_000;
    private static final int    PBKDF2_KEY_LENGTH    = 256;
    private static final String SUPERADMIN_USERNAME  = "superadmin";
    private static final String SUPERADMIN_PASSWORD  = "Admin@123";
    private static final String DEFAULT_TENANT_ID    = "tenant_default";
    private static final String DEFAULT_TENANT_NAME  = "Default";
    private static final String DEFAULT_TENANT_SLUG  = "default";

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;

    public DataInitializer(UserRepository userRepository, TenantRepository tenantRepository) {
        this.userRepository   = userRepository;
        this.tenantRepository = tenantRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        ensureDefaultTenant();
        ensureSuperAdmin();
    }

    private void ensureDefaultTenant() {
        if (!tenantRepository.existsById(DEFAULT_TENANT_ID)) {
            OffsetDateTime now = OffsetDateTime.now();
            Tenant tenant = new Tenant();
            tenant.setId(DEFAULT_TENANT_ID);
            tenant.setName(DEFAULT_TENANT_NAME);
            tenant.setSlug(DEFAULT_TENANT_SLUG);
            tenant.setActive(true);
            tenant.setDeleted(false);
            tenant.setCreatedBy("system");
            tenant.setUpdatedBy("system");
            tenant.setCreatedAt(now);
            tenant.setUpdatedAt(now);
            tenantRepository.save(tenant);
            log.info("Default tenant created.");
        }
    }

    private void ensureSuperAdmin() {
        if (userRepository.existsByUsername(SUPERADMIN_USERNAME)) {
            log.info("Superadmin already exists — skipping seed.");
            return;
        }

        String salt = generateSalt();
        String hash = hashPassword(SUPERADMIN_PASSWORD, salt);

        User superAdmin = new User();
        superAdmin.setUsername(SUPERADMIN_USERNAME);
        superAdmin.setSalt(salt);
        superAdmin.setHash(hash);
        superAdmin.setRole("superadmin");
        superAdmin.setActive(true);
        superAdmin.setTenantId(null);        // superadmin is platform-level, not tenant-scoped
        superAdmin.setRoleId("role_superadmin"); // dynamic RBAC role
        superAdmin.setCreatedAt(OffsetDateTime.now());
        userRepository.save(superAdmin);

        log.info("Superadmin user created successfully.");
    }

    private String hashPassword(String password, String salt) {
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] saltBytes = salt.getBytes(StandardCharsets.UTF_8);
            PBEKeySpec spec = new PBEKeySpec(
                    password.toCharArray(),
                    saltBytes,
                    PBKDF2_ITERATIONS,
                    PBKDF2_KEY_LENGTH
            );
            byte[] hash = factory.generateSecret(spec).getEncoded();
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new RuntimeException("Password hashing failed.", e);
        }
    }

    private String generateSalt() {
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
