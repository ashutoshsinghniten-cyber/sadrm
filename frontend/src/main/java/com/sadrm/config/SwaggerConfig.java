package com.sadrm.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class SwaggerConfig {

    @Value("${server.port:8080}")
    private String serverPort;

    @Bean
    public OpenAPI openAPI() {
        final String schemeName = "BearerAuth";

        return new OpenAPI()
                .info(new Info()
                        .title("SADRM Backend API")
                        .description("""
                                **Salvation Army Donation Records Management — Backend API**

                                Multi-tenant SaaS backend with dynamic RBAC.

                                ### Authentication
                                1. Call `POST /api/auth/login` with `username` + `password`
                                2. Copy the `token` from the response
                                3. Click **Authorize** above and enter: `Bearer <token>`
                                4. All protected endpoints will now use your token

                                ### Permission Model
                                Every protected endpoint checks a specific permission code via `@PreAuthorize`.
                                The JWT carries a `roleId`; permissions are loaded from DB and Redis-cached (5 min TTL).

                                ### Tenant Isolation
                                All data is scoped to the tenant extracted from the JWT.
                                Superadmin (`tenantId = null`) can access all tenants.
                                """)
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("SADRM Team")
                                .email("admin@sadrm.internal"))
                        .license(new License()
                                .name("Private — Internal Use Only")))
                .servers(List.of(
                        new Server()
                                .url("http://localhost:" + serverPort)
                                .description("Local development"),
                        new Server()
                                .url("https://api.sadrm.internal")
                                .description("Production")))
                .addSecurityItem(new SecurityRequirement().addList(schemeName))
                .components(new Components()
                        .addSecuritySchemes(schemeName, new SecurityScheme()
                                .name(schemeName)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Enter the JWT token obtained from POST /api/auth/login")));
    }
}
