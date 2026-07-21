package com.sadrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sadrm.dto.AiExtractionRequest;
import com.sadrm.dto.BatchExtractionItem;
import com.sadrm.dto.BatchSubmitRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiRuntimeService {

    private static final Logger log = LoggerFactory.getLogger(AiRuntimeService.class);

    // AI appends this tag so we can parse it out and decide whether to escalate.
    private static final String CONFIDENCE_INSTRUCTION =
            "\n\nAfter your extraction, on its own final line add exactly: " +
            "[CONFIDENCE:X.XX] where X.XX is your confidence (0.00-1.00) that every " +
            "extracted field is correct. Example: [CONFIDENCE:0.87]. No other text after it.";

    private static final Pattern CONFIDENCE_PATTERN =
            Pattern.compile("\\[CONFIDENCE:(\\d+(?:\\.\\d+)?)\\]");

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Value("${app.ai.endpoint:}")
    private String endpoint;

    // Expensive model — used for difficult/handwritten records or low-confidence escalations.
    @Value("${app.ai.model:}")
    private String model;

    // Cheap model (e.g. claude-haiku-4-5-20251001) — used first for smart-routing and all batch jobs.
    @Value("${app.ai.cheap-model:}")
    private String cheapModel;

    @Value("${app.ai.api-key:}")
    private String apiKey;

    @Value("${app.ai.version:}")
    private String version;

    @Value("${app.ai.auth-header:x-api-key}")
    private String authHeader;

    @Value("${app.ai.version-header:anthropic-version}")
    private String versionHeader;

    // Records whose overall confidence falls below this value are escalated to the expensive model.
    @Value("${app.ai.confidence-threshold:0.75}")
    private double confidenceThreshold;

    // Comma-separated Anthropic beta features, e.g. "pdfs-2024-09-25,prompt-caching-2024-07-31".
    // Required when messages contain 'document' content blocks (PDF) or cache_control in system.
    @Value("${app.ai.beta-headers:}")
    private String betaHeaders;

    public AiRuntimeService(WebClient.Builder builder, ObjectMapper objectMapper) {
        this.webClient = builder.build();
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return endpoint != null && !endpoint.isBlank()
                && apiKey   != null && !apiKey.isBlank();
    }

    // ── Single-record extraction ────────────────────────────────────────────────

    public Map<String, Object> extract(AiExtractionRequest request) {
        if (!isConfigured()) {
            return Map.of("error", "AI runtime not configured");
        }

        boolean canRoute = Boolean.TRUE.equals(request.getSmartRouting())
                && cheapModel != null && !cheapModel.isBlank();

        if (canRoute) {
            return extractWithSmartRouting(request);
        }
        return callModel(model, request.getSystem(), request.getMessages(),
                request.getMaxTokens(), false);
    }

    private Map<String, Object> extractWithSmartRouting(AiExtractionRequest request) {
        // Pass 1 — cheap model with confidence instruction injected into system prompt.
        Object systemWithConfidence = withConfidenceInstruction(request.getSystem());
        Map<String, Object> cheapResult = callModel(cheapModel, systemWithConfidence,
                request.getMessages(), request.getMaxTokens(), true);

        if (cheapResult.containsKey("error")) {
            log.warn("Cheap model failed, falling back to expensive model");
            return callModel(model, request.getSystem(), request.getMessages(),
                    request.getMaxTokens(), false);
        }

        String rawText    = (String) cheapResult.get("rawText");
        double confidence = parseConfidence(rawText);
        String cleanText  = stripConfidenceTag(rawText);

        if (confidence < confidenceThreshold) {
            // Pass 2 — escalate to expensive model (no confidence tag needed).
            log.info("Confidence {} below threshold {}, escalating to expensive model",
                    String.format("%.2f", confidence), String.format("%.2f", confidenceThreshold));
            Map<String, Object> expensiveResult = callModel(model, request.getSystem(),
                    request.getMessages(), request.getMaxTokens(), false);
            expensiveResult.put("confidence",  confidence);
            expensiveResult.put("modelUsed",   model);
            expensiveResult.put("escalated",   true);
            return expensiveResult;
        }

        Map<String, Object> result = new HashMap<>(cheapResult);
        result.remove("rawText");
        result.put("text",       cleanText);
        result.put("confidence", confidence);
        result.put("modelUsed",  cheapModel);
        result.put("escalated",  false);
        return result;
    }

    // ── Batch submission (Anthropic Message Batches API — 50 % discount) ───────

    public Map<String, Object> submitBatch(BatchSubmitRequest request) {
        if (!isConfigured()) {
            return Map.of("error", "AI runtime not configured");
        }
        if (request.getRecords() == null || request.getRecords().isEmpty()) {
            return Map.of("error", "No records provided");
        }

        // Always use the cheap model for batch jobs; fall back to expensive if not configured.
        String batchModel    = (cheapModel != null && !cheapModel.isBlank()) ? cheapModel : model;
        String batchEndpoint = endpoint + "/batches";

        List<Map<String, Object>> batchRequests = new ArrayList<>();
        for (BatchExtractionItem item : request.getRecords()) {
            Map<String, Object> params = new HashMap<>();
            params.put("model",      batchModel);
            params.put("max_tokens", item.getMaxTokens() != null ? item.getMaxTokens() : 4096);
            params.put("messages",   item.getMessages());
            if (item.getSystem() != null) {
                // Inject confidence instruction so results can be routed after the batch finishes.
                params.put("system", withConfidenceInstruction(item.getSystem()));
            }

            Map<String, Object> batchItem = new HashMap<>();
            batchItem.put("custom_id", item.getCustomId());
            batchItem.put("params",    params);
            batchRequests.add(batchItem);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("requests", batchRequests);

        try {
            var req = webClient.post()
                    .uri(batchEndpoint)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(authHeader, apiKey)
                    .header(versionHeader, version);
            if (betaHeaders != null && !betaHeaders.isBlank()) {
                req = req.header("anthropic-beta", betaHeaders);
            }
            Map<?, ?> response = req
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            Map<String, Object> result = new HashMap<>();
            if (response != null) {
                result.put("batchId",       response.get("id"));
                result.put("status",        response.get("processing_status"));
                result.put("requestCounts", response.get("request_counts"));
                result.put("createdAt",     response.get("created_at"));
            }
            result.put("modelUsed",   batchModel);
            result.put("recordCount", request.getRecords().size());
            return result;
        } catch (WebClientResponseException e) {
            log.error("Batch submission failed [status={}]: {}", e.getStatusCode(), e.getResponseBodyAsString());
            return Map.of("error", e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Batch submission failed: {}", e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }

    public Map<String, Object> getBatchStatus(String batchId) {
        if (!isConfigured()) {
            return Map.of("error", "AI runtime not configured");
        }

        try {
            Map<?, ?> response = webClient.get()
                    .uri(endpoint + "/batches/" + batchId)
                    .header(authHeader, apiKey)
                    .header(versionHeader, version)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            Map<String, Object> result = new HashMap<>();
            if (response != null) {
                result.put("batchId",       response.get("id"));
                result.put("status",        response.get("processing_status"));
                result.put("requestCounts", response.get("request_counts"));
                result.put("createdAt",     response.get("created_at"));
                result.put("endedAt",       response.get("ended_at"));
            }
            return result;
        } catch (Exception e) {
            log.error("Batch status fetch failed [batchId={}]: {}", batchId, e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }

    // Returns one entry per record with: customId, text, confidence, needsEscalation, usage.
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getBatchResults(String batchId) {
        if (!isConfigured()) {
            return List.of(Map.of("error", "AI runtime not configured"));
        }

        List<Map<String, Object>> results = new ArrayList<>();

        try {
            String rawBody = webClient.get()
                    .uri(endpoint + "/batches/" + batchId + "/results")
                    .header(authHeader, apiKey)
                    .header(versionHeader, version)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (rawBody == null || rawBody.isBlank()) return results;

            for (String line : rawBody.split("\n")) {
                line = line.trim();
                if (line.isEmpty()) continue;

                try {
                    Map<String, Object> entry = objectMapper.readValue(line, Map.class);
                    String customId           = (String) entry.get("custom_id");
                    Map<?, ?> resultWrapper   = (Map<?, ?>) entry.get("result");

                    Map<String, Object> parsed = new HashMap<>();
                    parsed.put("customId", customId);

                    if (resultWrapper != null) {
                        String type = (String) resultWrapper.get("type");
                        parsed.put("resultType", type);

                        if ("succeeded".equals(type)) {
                            Map<?, ?> message = (Map<?, ?>) resultWrapper.get("message");
                            Map<String, Object> extracted = parseApiResponse(message, true);
                            String rawText    = (String) extracted.get("rawText");
                            double confidence = parseConfidence(rawText);
                            parsed.put("text",            stripConfidenceTag(rawText));
                            parsed.put("confidence",      confidence);
                            parsed.put("needsEscalation", confidence < confidenceThreshold);
                            parsed.put("usage",           extracted.get("usage"));
                        } else {
                            parsed.put("error", resultWrapper.get("error"));
                        }
                    }
                    results.add(parsed);
                } catch (Exception e) {
                    log.warn("Failed to parse batch result line: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Batch results fetch failed [batchId={}]: {}", batchId, e.getMessage());
            results.add(Map.of("error", e.getMessage()));
        }

        return results;
    }

    // ── Internal helpers ────────────────────────────────────────────────────────

    private Map<String, Object> callModel(String modelId, Object system,
            List<Map<String, Object>> messages, Integer maxTokens, boolean keepRaw) {

        Map<String, Object> body = new HashMap<>();
        body.put("model",      modelId);
        body.put("max_tokens", maxTokens != null ? maxTokens : 4096);
        body.put("messages",   messages);
        if (system != null) {
            body.put("system", system);
        }

        try {
            var req = webClient.post()
                    .uri(endpoint)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(authHeader, apiKey)
                    .header(versionHeader, version);
            if (betaHeaders != null && !betaHeaders.isBlank()) {
                req = req.header("anthropic-beta", betaHeaders);
            }
            Map<?, ?> response = req
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            return parseApiResponse(response, keepRaw);
        } catch (WebClientResponseException e) {
            log.error("AI call failed [model={}, status={}]: {}", modelId, e.getStatusCode(), e.getResponseBodyAsString());
            return Map.of("error", e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("AI call failed [model={}]: {}", modelId, e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseApiResponse(Map<?, ?> response, boolean keepRaw) {
        Map<String, Object> result = new HashMap<>();
        if (response == null) {
            result.put(keepRaw ? "rawText" : "text", "");
            return result;
        }

        List<?> content = (List<?>) response.get("content");
        String text = "";
        if (content != null && !content.isEmpty()) {
            Map<?, ?> block = (Map<?, ?>) content.get(0);
            Object t = block.get("text");
            text = t != null ? t.toString() : "";
        }
        result.put(keepRaw ? "rawText" : "text", text);

        Map<?, ?> usage = (Map<?, ?>) response.get("usage");
        if (usage != null) {
            Map<String, Object> usageMap = new HashMap<>();
            usageMap.put("inputTokens",  usage.get("input_tokens"));
            usageMap.put("outputTokens", usage.get("output_tokens"));
            result.put("usage", usageMap);
        }

        return result;
    }

    @SuppressWarnings("unchecked")
    private Object withConfidenceInstruction(Object system) {
        if (system instanceof String) {
            return system + CONFIDENCE_INSTRUCTION;
        }
        if (system instanceof List) {
            List<Map<String, Object>> blocks = new ArrayList<>((List<Map<String, Object>>) system);
            Map<String, Object> extra = new HashMap<>();
            extra.put("type", "text");
            extra.put("text", CONFIDENCE_INSTRUCTION.trim());
            blocks.add(extra);
            return blocks;
        }
        return CONFIDENCE_INSTRUCTION.trim();
    }

    private double parseConfidence(String text) {
        if (text == null) return 0.0;
        Matcher m = CONFIDENCE_PATTERN.matcher(text);
        double last = 0.0;
        while (m.find()) {
            try { last = Double.parseDouble(m.group(1)); } catch (NumberFormatException ignored) {}
        }
        return last;
    }

    private String stripConfidenceTag(String text) {
        if (text == null) return "";
        return CONFIDENCE_PATTERN.matcher(text).replaceAll("").strip();
    }
}
