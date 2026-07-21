package com.sadrm.security;

public final class TenantContext {

    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void setTenantId(String tenantId) {
        CURRENT_TENANT.set(tenantId);
    }

    public static String getTenantId() {
        return CURRENT_TENANT.get();
    }

    /** Returns true when the current caller is a superadmin (no tenant boundary). */
    public static boolean isSuperAdmin() {
        return CURRENT_TENANT.get() == null;
    }

    /** Must be called at the end of every request to prevent ThreadLocal memory leaks. */
    public static void clear() {
        CURRENT_TENANT.remove();
    }
}
