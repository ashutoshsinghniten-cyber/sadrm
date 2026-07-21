package com.sadrm.controller;

import com.sadrm.security.JwtUtil;
import com.sadrm.service.SseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

@RestController
@RequestMapping("/api/data")
@Tag(name = "SSE", description = "Server-Sent Events — real-time tenant-isolated batch updates")
public class SseController {

    private final SseService sseService;
    private final JwtUtil jwtUtil;

    public SseController(SseService sseService, JwtUtil jwtUtil) {
        this.sseService = sseService;
        this.jwtUtil    = jwtUtil;
    }

    /**
     * GET /api/data/events
     * Accepts token via Authorization header OR ?token= query param
     * (EventSource in browsers cannot send custom headers).
     */
    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(
        summary = "Connect to SSE stream",
        description = """
            Real-time event stream. Tenant-isolated — clients only receive events for their own tenant.
            Pass token via Authorization: Bearer header OR ?token= query param (required for browser EventSource).
            Heartbeat every 25 seconds. Event format: {"type":"batch-updated","batchId":"...","tenantId":"..."}
            """
    )
    public ResponseEntity<SseEmitter> events(
            @RequestParam(value = "token", required = false) String queryToken,
            HttpServletRequest request) {

        String token = null;
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (queryToken != null && !queryToken.isBlank()) {
            token = queryToken;
        }

        if (token == null || !jwtUtil.isValid(token)) {
            return ResponseEntity.status(401).build();
        }

        // Prefer tenantKey claim; falls back to tenantId for backward-compat tokens
        String tenantId = jwtUtil.extractTenantKey(token);
        String clientId = UUID.randomUUID().toString();
        SseEmitter emitter = sseService.createEmitter(clientId, tenantId);

        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .header("X-Accel-Buffering", "no")
                .body(emitter);
    }
}
