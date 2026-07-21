package com.sadrm.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.zip.GZIPOutputStream;

@Service
public class WorkflowSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowSnapshotService.class);

    private final S3Service s3Service;
    private final ObjectMapper objectMapper;

    @Value("${app.workflow-snapshot-history:false}")
    private boolean snapshotHistoryEnabled;

    public WorkflowSnapshotService(S3Service s3Service, ObjectMapper objectMapper) {
        this.s3Service    = s3Service;
        this.objectMapper = objectMapper;
    }

    /**
     * Builds snapshot metadata without doing any network/S3 work.
     * Use this in request path so DB rows can still keep the latest snapshot pointer.
     */
    public Map<String, Object> createSnapshotInfo(String kind, String id) {
        String savedAt    = Instant.now().toString();
        String safeKind   = safeSegment(kind);
        String safeId     = safeSegment(id);
        String snapshotId = nowTimestamp() + "_" + UUID.randomUUID();

        String baseKey    = "workflow-snapshots/" + safeKind + "/" + safeId;
        String latestKey  = baseKey + "/latest.json.gz";
        String historyKey = baseKey + "/history/" + snapshotId + ".json.gz";

        Map<String, Object> result = new HashMap<>();
        result.put("snapshotId",      snapshotId);
        result.put("kind",            kind);
        result.put("id",              id);
        result.put("latestKey",       latestKey);
        result.put("historyKey",      snapshotHistoryEnabled ? historyKey : null);
        result.put("savedAt",         savedAt);
        result.put("historyEnabled",  snapshotHistoryEnabled);
        result.put("contentEncoding", "gzip");
        return result;
    }

    /**
     * Saves a workflow state snapshot to S3 synchronously.
     * Returns snapshot metadata map, or null if S3 is unavailable.
     * Never throws — S3 failures are logged and do not block DB writes.
     */
    public Map<String, Object> persist(String kind, String id, String payloadJson) {
        Map<String, Object> snapshotInfo = createSnapshotInfo(kind, id);
        boolean uploaded = uploadPrepared(snapshotInfo, payloadJson);
        return uploaded ? snapshotInfo : null;
    }

    /**
     * Saves a prepared snapshot in the async executor so API writes are not blocked by S3.
     */
    @Async("taskExecutor")
    public CompletableFuture<Void> persistPreparedAsync(Map<String, Object> snapshotInfo, String payloadJson) {
        uploadPrepared(snapshotInfo, payloadJson);
        return CompletableFuture.completedFuture(null);
    }

    private boolean uploadPrepared(Map<String, Object> snapshotInfo, String payloadJson) {
        try {
            String cleanJson = removeBinaryFields(payloadJson);
            ObjectNode envelope = objectMapper.createObjectNode();
            envelope.put("snapshotId", String.valueOf(snapshotInfo.get("snapshotId")));
            envelope.put("kind",       String.valueOf(snapshotInfo.get("kind")));
            envelope.put("id",         String.valueOf(snapshotInfo.get("id")));
            envelope.put("savedAt",    String.valueOf(snapshotInfo.get("savedAt")));
            envelope.set("payload", objectMapper.readTree(cleanJson));

            byte[] body = gzip(objectMapper.writeValueAsBytes(envelope));
            String latestKey = String.valueOf(snapshotInfo.get("latestKey"));
            Object historyKeyObj = snapshotInfo.get("historyKey");

            s3Service.uploadWithRetry(latestKey, body, "application/json; charset=utf-8", "gzip", 2);
            if (Boolean.TRUE.equals(snapshotInfo.get("historyEnabled")) && historyKeyObj != null) {
                s3Service.uploadWithRetry(String.valueOf(historyKeyObj), body, "application/json; charset=utf-8", "gzip", 2);
            }
            return true;
        } catch (Exception e) {
            log.error("S3 snapshot failed [{}/{}]: {}", snapshotInfo.get("kind"), snapshotInfo.get("id"), e.getMessage());
            return false;
        }
    }

    private byte[] gzip(byte[] data) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
                gzip.write(data);
            }
            return out.toByteArray();
        } catch (Exception e) {
            return new String(data, StandardCharsets.UTF_8).getBytes(StandardCharsets.UTF_8);
        }
    }

    private String removeBinaryFields(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            return objectMapper.writeValueAsString(stripBinary(node));
        } catch (Exception e) {
            return json;
        }
    }

    private JsonNode stripBinary(JsonNode node) {
        if (node.isArray()) {
            ArrayNode arr = objectMapper.createArrayNode();
            for (JsonNode item : node) arr.add(stripBinary(item));
            return arr;
        }
        if (node.isObject()) {
            ObjectNode obj = objectMapper.createObjectNode();
            node.fields().forEachRemaining(entry -> {
                if (!entry.getKey().equals("file") && !entry.getKey().equals("fileBase64")) {
                    obj.set(entry.getKey(), stripBinary(entry.getValue()));
                }
            });
            return obj;
        }
        return node;
    }

    private String safeSegment(String value) {
        if (value == null) return "unknown";
        String clean = value.replaceAll("[^a-zA-Z0-9._=-]+", "_")
                            .replaceAll("^_+|_+$", "");
        if (clean.isBlank()) clean = "unknown";
        return clean.substring(0, Math.min(clean.length(), 180));
    }

    private String nowTimestamp() {
        return Instant.now().toString().replace(":", "-").replace(".", "-");
    }
}
