package com.sadrm.security;

import com.sadrm.exception.AppException;
import org.springframework.http.HttpStatus;

public class TenantValidator {

    /**
     * Validates that the tenantId provided in the request body matches the caller's JWT tenantId.
     * - If bodyTenantId is null/blank → skipped (backward compatible, JWT tenantId is used)
     * - If caller is superadmin (jwtTenantId == null) → skipped
     * - If mismatch → 403
     */
    public static void validate(String bodyTenantId) {
        if (bodyTenantId == null || bodyTenantId.isBlank()) return;
        String jwtTenantId = TenantContext.getTenantId();
        if (jwtTenantId == null) return;
        if (!bodyTenantId.equals(jwtTenantId)) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "tenantId in request does not match your account's tenant.");
        }
    }
}
