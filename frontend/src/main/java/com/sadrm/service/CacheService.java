package com.sadrm.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class CacheService {

    private static final Logger log = LoggerFactory.getLogger(CacheService.class);

    private final RedisTemplate<String, String> redisTemplate;

    public CacheService(RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void set(String key, String value, Duration ttl) {
        try {
            redisTemplate.opsForValue().set(key, value, ttl);
        } catch (Exception e) {
            log.warn("Cache set failed for key={}: {}", key, e.getMessage());
        }
    }

    public Optional<String> get(String key) {
        try {
            String value = redisTemplate.opsForValue().get(key);
            return Optional.ofNullable(value);
        } catch (Exception e) {
            log.warn("Cache get failed for key={}: {}", key, e.getMessage());
            return Optional.empty();
        }
    }

    public void delete(String key) {
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            log.warn("Cache delete failed for key={}: {}", key, e.getMessage());
        }
    }

    /**
     * Deletes all keys matching {@code pattern} using Redis SCAN instead of KEYS.
     *
     * KEYS blocks the entire Redis server for O(N) while it scans the keyspace.
     * SCAN iterates incrementally (count hint per call) so other clients are never blocked.
     * Keys are collected first, then deleted in batches of 500 to keep DEL commands small.
     */
    public void deleteByPattern(String pattern) {
        try {
            ScanOptions options = ScanOptions.scanOptions().match(pattern).count(200).build();
            List<String> toDelete = new ArrayList<>();
            try (Cursor<String> cursor = redisTemplate.scan(options)) {
                cursor.forEachRemaining(toDelete::add);
            }
            if (toDelete.isEmpty()) return;
            // Batch deletes to avoid a single oversized DEL command.
            int batchSize = 500;
            for (int i = 0; i < toDelete.size(); i += batchSize) {
                redisTemplate.delete(toDelete.subList(i, Math.min(i + batchSize, toDelete.size())));
            }
            log.debug("Cache pattern delete: pattern={} keys={}", pattern, toDelete.size());
        } catch (Exception e) {
            log.warn("Cache pattern delete failed for pattern={}: {}", pattern, e.getMessage());
        }
    }

    public boolean exists(String key) {
        try {
            Boolean result = redisTemplate.hasKey(key);
            return Boolean.TRUE.equals(result);
        } catch (Exception e) {
            log.warn("Cache exists check failed for key={}: {}", key, e.getMessage());
            return false;
        }
    }
}
