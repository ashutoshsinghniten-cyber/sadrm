package com.sadrm.controller;

import com.sadrm.dto.AiExtractionRequest;
import com.sadrm.dto.BatchSubmitRequest;
import com.sadrm.service.AiRuntimeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/runtime")
@Tag(name = "AI Runtime", description = "AI extraction via Claude API")
public class RuntimeController {

    private final AiRuntimeService aiRuntimeService;

    public RuntimeController(AiRuntimeService aiRuntimeService) {
        this.aiRuntimeService = aiRuntimeService;
    }

    @GetMapping("/health")
    @Operation(summary = "AI runtime health",
               description = "Public. Returns configured=true if AI_RUNTIME_API_KEY is set.")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new HashMap<>();
        body.put("ok",         true);
        body.put("configured", aiRuntimeService.isConfigured());
        body.put("endpoint",   "/api/runtime/extraction");
        return ResponseEntity.ok(body);
    }

    // ── Single-record extraction ─────────────────────────────────────────────────
    // Set smartRouting=true in the request body to use cheap model first (Haiku),
    // with automatic escalation to the expensive model when confidence is low.

    @PostMapping("/extraction")
    @PreAuthorize("hasAuthority('AI_EXTRACT')")
    @Operation(summary = "AI extraction",
               description = "Requires AI_EXTRACT. Forwards to Claude API. " +
                             "Set smartRouting=true to use cheap model first with confidence-based escalation.")
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> extraction(@RequestBody AiExtractionRequest request) {
        return ResponseEntity.ok(aiRuntimeService.extract(request));
    }

    // ── Batch extraction (Anthropic Message Batches API — ~50 % cost discount) ──
    // Records are submitted in one request. Results are async: poll /batch/{id}
    // for status, then fetch /batch/{id}/results when status is "ended".

    @PostMapping("/batch")
    @PreAuthorize("hasAuthority('AI_EXTRACT')")
    @Operation(summary = "Submit batch extraction",
               description = "Requires AI_EXTRACT. Submits all records to the Anthropic Batch API " +
                             "using the cheap model. Returns a batchId to poll for results.")
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> submitBatch(@RequestBody BatchSubmitRequest request) {
        return ResponseEntity.ok(aiRuntimeService.submitBatch(request));
    }

    @GetMapping("/batch/{batchId}")
    @PreAuthorize("hasAuthority('AI_EXTRACT')")
    @Operation(summary = "Get batch status",
               description = "Requires AI_EXTRACT. Returns processing_status and request counts for a batch.")
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<Map<String, Object>> getBatchStatus(@PathVariable String batchId) {
        return ResponseEntity.ok(aiRuntimeService.getBatchStatus(batchId));
    }

    @GetMapping("/batch/{batchId}/results")
    @PreAuthorize("hasAuthority('AI_EXTRACT')")
    @Operation(summary = "Get batch results",
               description = "Requires AI_EXTRACT. Returns extracted text, confidence score, " +
                             "and needsEscalation flag per record. Call only when status is 'ended'.")
    @SecurityRequirement(name = "BearerAuth")
    public ResponseEntity<List<Map<String, Object>>> getBatchResults(@PathVariable String batchId) {
        return ResponseEntity.ok(aiRuntimeService.getBatchResults(batchId));
    }
}
