package com.sadrm.security;

import com.sadrm.service.DynamicPermissionService;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);

    private final JwtUtil jwtUtil;
    private final DynamicPermissionService dynamicPermissionService;

    public JwtAuthFilter(JwtUtil jwtUtil, DynamicPermissionService dynamicPermissionService) {
        this.jwtUtil                  = jwtUtil;
        this.dynamicPermissionService = dynamicPermissionService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);

        if (token != null) {
            try {
                String username  = jwtUtil.extractUsername(token);
                // Prefer tenantKey claim; falls back to tenantId for backward-compat tokens
                String tenantKey = jwtUtil.extractTenantKey(token);
                String roleId    = jwtUtil.extractRoleId(token);
                String roleName  = jwtUtil.extractRole(token);

                if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                    // Resolve roleId — handles backward-compat tokens without roleId claim
                    String resolvedRoleId = dynamicPermissionService.resolveRoleId(roleId, roleName);

                    // Load dynamic permissions from DB (Redis-cached)
                    List<GrantedAuthority> authorities = dynamicPermissionService.getAuthorities(resolvedRoleId);

                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(username, null, authorities);
                    SecurityContextHolder.getContext().setAuthentication(auth);

                    // Store tenantKey in thread-local context (null for superadmin)
                    TenantContext.setTenantId(tenantKey);

                    log.debug("Authenticated: user={}, role={}, tenant={}", username, roleName, tenantKey);
                }
            } catch (JwtException | IllegalArgumentException e) {
                log.debug("JWT validation failed for {}: {}", request.getRequestURI(), e.getMessage());
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }

    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        String queryToken = request.getParameter("token");
        if (queryToken != null && !queryToken.isBlank()) {
            return queryToken;
        }
        return null;
    }
}
