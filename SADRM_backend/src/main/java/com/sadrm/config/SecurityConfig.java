package com.sadrm.config;

import com.sadrm.security.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.Collections;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity   // enables @PreAuthorize("hasAuthority('PERMISSION_CODE')")
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // ── Public endpoints (no token required) ─────────────────────
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
                // Slim login-page dropdown — returns only {id, name, slug}, no audit fields.
                // Full GET /api/admin/tenants requires TENANT_READ (@PreAuthorize on controller).
                .requestMatchers(HttpMethod.GET,  "/api/admin/tenants/for-login").permitAll()
                // SSE validates token manually — allow here to support ?token= param
                .requestMatchers(HttpMethod.GET,  "/api/data/events").permitAll()
                // Health / actuator
                .requestMatchers(HttpMethod.GET,  "/api/health").permitAll()
                .requestMatchers(HttpMethod.GET,  "/api/runtime/health").permitAll()
                .requestMatchers("/actuator/**").permitAll()
                // Swagger UI & OpenAPI spec (springdoc)
                .requestMatchers("/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/v3/api-docs/**", "/v3/api-docs.yaml").permitAll()
                // OPTIONS pre-flight
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // ── Everything else requires a valid JWT ──────────────────────
                // Fine-grained access control is handled by @PreAuthorize
                // on individual controller methods using hasAuthority('PERMISSION_CODE')
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(Collections.singletonList("*"));
        config.setAllowedMethods(Arrays.asList("GET", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(Arrays.asList(
                "Content-Type", "Authorization",
                "X-Allow-Bulk-Replace", "Cache-Control",
                "X-Idempotency-Key"
        ));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    /**
     * Password encoding is bypassed — PBKDF2 is done manually in AuthService
     * to maintain compatibility with the existing Node.js hash format.
     */
    @Bean
    @SuppressWarnings("deprecation")
    public PasswordEncoder passwordEncoder() {
        return NoOpPasswordEncoder.getInstance();
    }
}
