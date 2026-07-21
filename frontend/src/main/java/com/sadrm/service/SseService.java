package com.sadrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sadrm.exception.AppException;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SseService implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);
    private static final String CHANNEL      = "sadrm:batch:events";
    private static final long SSE_TIMEOUT_MS = 5L * 60 * 1000; // 5 minutes
    private static final int  MAX_LISTENERS  = 200;
    private static final long HEARTBEAT_MS   = 25_000;

    private static final class EmitterEntry {
        final SseEmitter emitter;
        final String tenantId; // null = superadmin, receives all events
        EmitterEntry(SseEmitter emitter, String tenantId) {
            this.emitter  = emitter;
            this.tenantId = tenantId;
        }
    }

    private final ConcurrentHashMap<String, EmitterEntry> emitters = new ConcurrentHashMap<>();
    private final RedisTemplate<String, String> redisTemplate;
    private final RedisMessageListenerContainer listenerContainer;
    private final ObjectMapper objectMapper;

    public SseService(RedisTemplate<String, String> redisTemplate,
                      RedisMessageListenerContainer listenerContainer,
                      ObjectMapper objectMapper) {
        this.redisTemplate     = redisTemplate;
        this.listenerContainer = listenerContainer;
        this.objectMapper      = objectMapper;
    }

    @PostConstruct
    public void subscribeToRedis() {
        listenerContainer.addMessageListener(this, new ChannelTopic(CHANNEL));
    }

    public SseEmitter createEmitter(String clientId, String tenantId) {
        if (emitters.size() >= MAX_LISTENERS) {
            throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "SSE listener limit reached.");
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        emitter.onCompletion(() -> emitters.remove(clientId));
        emitter.onTimeout(()   -> { emitters.remove(clientId); emitter.complete(); });
        emitter.onError(e     -> emitters.remove(clientId));

        emitters.put(clientId, new EmitterEntry(emitter, tenantId));

        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            emitters.remove(clientId);
        }

        return emitter;
    }

    @Scheduled(fixedDelay = HEARTBEAT_MS)
    public void sendHeartbeat() {
        emitters.forEach((clientId, entry) -> {
            try {
                entry.emitter.send(SseEmitter.event().comment("heartbeat"));
            } catch (IOException e) {
                emitters.remove(clientId);
            }
        });
    }

    /**
     * Called when a batch changes. Publishes to Redis so ALL app instances
     * can forward the event to their own connected SSE clients.
     * tenantId is included so each instance forwards only to matching clients.
     */
    public void broadcastBatchUpdate(String batchId, String tenantId) {
        try {
            Map<String, Object> msg = new HashMap<>();
            msg.put("type",    "batch-updated");
            msg.put("batchId", batchId);
            if (tenantId != null) msg.put("tenantId", tenantId);
            redisTemplate.convertAndSend(CHANNEL, objectMapper.writeValueAsString(msg));
        } catch (Exception e) {
            log.error("Failed to publish SSE event to Redis: {}", e.getMessage());
        }
    }

    /** Called by Redis subscriber — forwards event to matching local SSE clients. */
    @Override
    public void onMessage(Message message, byte[] pattern) {
        String payload = new String(message.getBody());
        String eventTenantId = null;
        try {
            Map<?, ?> parsed = objectMapper.readValue(payload, Map.class);
            eventTenantId = (String) parsed.get("tenantId");
        } catch (Exception ignored) {
        }
        pushToLocalClients(payload, eventTenantId);
    }

    private void pushToLocalClients(String payload, String eventTenantId) {
        emitters.forEach((clientId, entry) -> {
            // Superadmin clients (tenantId=null) receive all events;
            // Tenant clients only receive events for their own tenant.
            boolean shouldReceive = entry.tenantId == null
                    || entry.tenantId.equals(eventTenantId);
            if (!shouldReceive) return;

            try {
                entry.emitter.send(SseEmitter.event().data(payload));
            } catch (IOException e) {
                emitters.remove(clientId);
            }
        });
    }
}
