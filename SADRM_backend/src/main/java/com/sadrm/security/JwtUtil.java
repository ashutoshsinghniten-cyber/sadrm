package com.sadrm.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    private final SecretKey key;
    private static final long EXPIRY_MS = 8L * 60 * 60 * 1000; // 8 hours

    public JwtUtil(@Value("${app.jwt.secret}") String secret) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Generates a JWT token.
     * tenantId is null for superadmin (no tenant boundary).
     * roleId is the FK into the roles table — used to load dynamic permissions.
     * role (text) is kept for backward-compat display (e.g. "admin").
     * tenantKey claim mirrors tenantId — included for explicit tenant-key based auth.
     */
    public String generateToken(String username, String role, String tenantId, String roleId) {
        return Jwts.builder()
                .subject(username)
                .claim("role",      role)
                .claim("tenantId",  tenantId)   // backward-compat claim
                .claim("tenantKey", tenantId)   // explicit tenantKey claim (same value as tenantId)
                .claim("roleId",    roleId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + EXPIRY_MS))
                .signWith(key)
                .compact();
    }

    public Claims parseToken(String token) throws JwtException {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String extractUsername(String token) {
        return parseToken(token).getSubject();
    }

    public String extractRole(String token) {
        return parseToken(token).get("role", String.class);
    }

    /** Returns null for superadmin tokens. Prefers tenantKey claim; falls back to tenantId for old tokens. */
    public String extractTenantKey(String token) {
        Claims claims = parseToken(token);
        String tenantKey = claims.get("tenantKey", String.class);
        if (tenantKey != null) return tenantKey;
        // backward-compat: old tokens only have tenantId claim
        return claims.get("tenantId", String.class);
    }

    /** Returns null for superadmin tokens. Kept for backward compatibility. */
    public String extractTenantId(String token) {
        return parseToken(token).get("tenantId", String.class);
    }

    /** Returns the dynamic role ID used for permission loading. */
    public String extractRoleId(String token) {
        return parseToken(token).get("roleId", String.class);
    }

    public boolean isValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
