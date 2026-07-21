package com.sadrm.controller;

import com.sadrm.dto.SendBackPageRequest;
import com.sadrm.exception.AppException;
import com.sadrm.security.TenantValidator;
import com.sadrm.service.ArchivedRecordService;
import com.sadrm.service.BatchPageService;
import com.sadrm.service.BatchService;
import com.sadrm.service.RecordLockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/data")
@Tag(name = "Data", description = "Batches, archived records, batch pages, and record locks — all tenant-scoped")
@SecurityRequirement(name = "BearerAuth")
public class DataController {

    private final BatchService batchService;
    private final ArchivedRecordService archivedRecordService;
    private final BatchPageService batchPageService;
    private final RecordLockService recordLockService;

    public DataController(BatchService batchService,
                          ArchivedRecordService archivedRecordService,
                          BatchPageService batchPageService,
                          RecordLockService recordLockService) {
        this.batchService          = batchService;
        this.archivedRecordService = archivedRecordService;
        this.batchPageService      = batchPageService;
        this.recordLockService     = recordLockService;
    }

    // ── BATCHES ──────────────────────────────────────────────────────────────

    @GetMapping("/batches")
    @PreAuthorize("hasAuthority('BATCH_READ')")
    @Operation(summary = "Get batches", description = "Requires BATCH_READ. Supports ?summary=1, ?status=, ?limit=, ?offset=")
    public ResponseEntity<?> getBatches(
            @RequestParam(value = "summary",  required = false) String summary,
            @RequestParam(value = "status",   required = false) String status,
            @RequestParam(value = "limit",    required = false) Integer limit,
            @RequestParam(value = "offset",   required = false) Integer offset) {

        if ("1".equals(summary)) {
            return ResponseEntity.ok(batchService.getSummary(status, limit, offset));
        }
        return ResponseEntity.ok(batchService.getAll(status, limit, offset));
    }

    @PutMapping("/batches")
    @PreAuthorize("hasAuthority('BATCH_CREATE')")
    @Operation(
        summary = "Bulk upsert batches",
        description = "Requires BATCH_CREATE. Add ?replace=1 + header X-Allow-Bulk-Replace: true for destructive full replace."
    )
    public ResponseEntity<Map<String, Object>> putBatches(
            @RequestBody List<Map<String, Object>> items,
            @RequestParam(value = "replace", required = false) String replaceParam,
            @RequestHeader(value = "X-Allow-Bulk-Replace", required = false) String replaceSig) {

        boolean allowReplace = "1".equals(replaceParam) && "true".equals(replaceSig);
        if (items == null) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Expected an array of batches.");
        }
        String bodyTenantId = items.stream()
                .filter(item -> item.get("tenantId") instanceof String)
                .map(item -> (String) item.get("tenantId"))
                .findFirst().orElse(null);
        TenantValidator.validate(bodyTenantId);
        return ResponseEntity.ok(batchService.bulkUpsert(items, allowReplace));
    }

    @GetMapping("/batches/{batchId}")
    @PreAuthorize("hasAuthority('BATCH_READ')")
    @Operation(summary = "Get batch by ID", description = "Requires BATCH_READ.")
    public ResponseEntity<Map<String, Object>> getBatch(@PathVariable String batchId) {
        return ResponseEntity.ok(batchService.getById(batchId));
    }

    @PatchMapping("/batches/{batchId}")
    @PreAuthorize("hasAuthority('BATCH_UPDATE')")
    @Operation(summary = "Patch batch", description = "Requires BATCH_UPDATE. Merges fields. Also fires SSE batch-updated event.")
    public ResponseEntity<Map<String, Object>> patchBatch(
            @PathVariable String batchId,
            @RequestBody Map<String, Object> body) {

        if (body == null || body.isEmpty()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Expected a batch object.");
        }
        TenantValidator.validate(body.get("tenantId") instanceof String ? (String) body.get("tenantId") : null);
        return ResponseEntity.ok(batchService.patch(batchId, body));
    }

    // ── ARCHIVED RECORDS ─────────────────────────────────────────────────────

    @GetMapping("/archived-records")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_READ')")
    @Operation(
        summary = "Get archived records",
        description = "Requires ARCHIVED_RECORD_READ. Paginated: ?offset=0&limit=100 (default 100, max 500). " +
                      "Optional: ?q=searchText&bank=FirstBank,Chase&sortBy=recent|amount-desc|amount-asc|donor-asc"
    )
    public ResponseEntity<Map<String, Object>> getArchivedRecords(
            @RequestParam(value = "offset",  defaultValue = "0")      int offset,
            @RequestParam(value = "limit",   defaultValue = "100")     int limit,
            @RequestParam(value = "q",       required = false)         String q,
            @RequestParam(value = "bank",    required = false)         String bank,
            @RequestParam(value = "sortBy",  defaultValue = "recent")  String sortBy) {

        return ResponseEntity.ok(archivedRecordService.getAll(offset, limit, q, bank, sortBy));
    }

    @PutMapping("/archived-records")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_CREATE')")
    @Operation(summary = "Bulk upsert archived records", description = "Requires ARCHIVED_RECORD_CREATE.")
    public ResponseEntity<Map<String, Object>> putArchivedRecords(
            @RequestBody List<Map<String, Object>> items,
            @RequestParam(value = "replace", required = false) String replaceParam,
            @RequestHeader(value = "X-Allow-Bulk-Replace", required = false) String replaceSig) {

        boolean allowReplace = "1".equals(replaceParam) && "true".equals(replaceSig);
        if (items == null) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Expected an array of archived records.");
        }
        String bodyTenantId = items.stream()
                .filter(item -> item.get("tenantId") instanceof String)
                .map(item -> (String) item.get("tenantId"))
                .findFirst().orElse(null);
        TenantValidator.validate(bodyTenantId);
        return ResponseEntity.ok(archivedRecordService.bulkUpsert(items, allowReplace));
    }

    @PostMapping("/archived-records/bulk")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_UPDATE')")
    @Operation(
        summary = "Bulk archive records (additive)",
        description = "Requires ARCHIVED_RECORD_UPDATE. Upserts multiple records in one transaction with a " +
                      "single cache invalidation. Never deletes existing records. Use this instead of " +
                      "individual PATCH calls when archiving a batch."
    )
    public ResponseEntity<Map<String, Object>> bulkArchiveRecords(
            @RequestBody List<Map<String, Object>> items) {

        if (items == null || items.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("ok",    true);
            empty.put("count", 0);
            return ResponseEntity.ok(empty);
        }
        String bodyTenantId = items.stream()
                .filter(item -> item.get("tenantId") instanceof String)
                .map(item -> (String) item.get("tenantId"))
                .findFirst().orElse(null);
        TenantValidator.validate(bodyTenantId);
        Map<String, Object> result = archivedRecordService.bulkUpsert(items, false);
        result.put("count", items.size());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/archived-records/{id}")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_READ')")
    @Operation(summary = "Get single archived record", description = "Requires ARCHIVED_RECORD_READ. Returns full record with modificationHistory.")
    public ResponseEntity<Map<String, Object>> getArchivedRecord(@PathVariable String id) {
        Map<String, Object> record = archivedRecordService.getById(id);
        if (record == null) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record not found: " + id);
        }
        return ResponseEntity.ok(record);
    }

    @GetMapping("/archived-records/{id}/history")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_READ')")
    @Operation(summary = "Get modification history for archived record", description = "Requires ARCHIVED_RECORD_READ. Returns modificationHistory array.")
    public ResponseEntity<Map<String, Object>> getArchivedRecordHistory(@PathVariable String id) {
        Map<String, Object> record = archivedRecordService.getById(id);
        if (record == null) {
            throw new AppException(HttpStatus.NOT_FOUND, "Archived record not found: " + id);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("id",                  id);
        result.put("lastModifiedAt",       record.get("lastModifiedAt"));
        result.put("lastModifiedBy",       record.get("lastModifiedBy"));
        result.put("archivedAt",           record.get("archivedAt"));
        result.put("archivedBy",           record.get("archivedBy"));
        result.put("modificationHistory",  record.getOrDefault("modificationHistory", List.of()));
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/archived-records/{id}")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_UPDATE')")
    @Operation(summary = "Patch archived record", description = "Requires ARCHIVED_RECORD_UPDATE. Merges fields.")
    public ResponseEntity<Map<String, Object>> patchArchivedRecord(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {

        if (body == null || body.isEmpty()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Expected a record object.");
        }
        TenantValidator.validate(body.get("tenantId") instanceof String ? (String) body.get("tenantId") : null);
        return ResponseEntity.ok(archivedRecordService.patch(id, body));
    }

    @PatchMapping("/archived-records/{id}/send-back")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_UPDATE')")
    @Operation(
        summary = "Send back archived record for rework",
        description = "Requires ARCHIVED_RECORD_UPDATE. Marks the archived record as sent-back and records " +
                      "the destination (hitl | qc | preprep) and reason. Preserves existing history."
    )
    public ResponseEntity<Map<String, Object>> sendBackArchivedRecord(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {

        if (body == null) {
            throw new AppException(HttpStatus.BAD_REQUEST, "Expected { destination, reason }.");
        }
        String destination = body.get("destination") instanceof String ? (String) body.get("destination") : "hitl";
        String reason = body.get("reason") instanceof String ? (String) body.get("reason") : "";
        return ResponseEntity.ok(archivedRecordService.sendBack(id, destination, reason));
    }

    @PatchMapping("/archived-records/{id}/send-back-page")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_UPDATE')")
    @Operation(
        summary = "Send back a specific page of an archived record for rework",
        description = "Requires ARCHIVED_RECORD_UPDATE. Marks only the specified page (by filename) as sent-back " +
                      "within the archived record. The overall archived record status and all other pages remain " +
                      "unchanged. Body: { filename, destination (hitl|qc|preprep), reason }."
    )
    public ResponseEntity<Map<String, Object>> sendBackArchivedRecordPage(
            @PathVariable String id,
            @RequestBody @Valid SendBackPageRequest body) {

        return ResponseEntity.ok(archivedRecordService.sendBackPage(
                id,
                body.getFilename(),
                body.getDestination(),
                body.getReason() != null ? body.getReason() : ""
        ));
    }

    @DeleteMapping("/archived-records/{id}")
    @PreAuthorize("hasAuthority('ARCHIVED_RECORD_DELETE')")
    @Operation(summary = "Delete archived record", description = "Requires ARCHIVED_RECORD_DELETE. Permanently removes the record and invalidates cache.")
    public ResponseEntity<Map<String, Object>> deleteArchivedRecord(@PathVariable String id) {
        return ResponseEntity.ok(archivedRecordService.delete(id));
    }

    // ── BATCH PAGES ──────────────────────────────────────────────────────────

    @PostMapping(value = "/batch-pages", consumes = "multipart/form-data")
    @PreAuthorize("hasAuthority('BATCH_PAGE_CREATE')")
    @Operation(
        summary = "Upload page (multipart)",
        description = "Requires BATCH_PAGE_CREATE. PDF triggers async WebP preview generation. S3 path: batch-pages/{tenantId}/{batchId}/{recordId}/preview/{filename}"
    )
    public ResponseEntity<Map<String, Object>> uploadBatchPageFile(
            @RequestParam("batchId")   String batchId,
            @RequestParam("recordId")  String recordId,
            @RequestParam(value = "filename", required = false) String filename,
            @RequestParam(value = "tenantId", required = false) String tenantId,
            @RequestParam("file")      MultipartFile file) {

        TenantValidator.validate(tenantId);
        if (file == null || file.isEmpty()) {
            throw new AppException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        String resolvedFilename = (filename != null && !filename.isBlank())
                ? filename
                : file.getOriginalFilename();

        Map<String, Object> pageResult = batchPageService.uploadPageFile(batchId, recordId, resolvedFilename, file);
        return ResponseEntity.ok(pageResult);
    }

    @GetMapping("/batch-pages/{batchId}/{recordId}")
    @PreAuthorize("hasAuthority('BATCH_PAGE_READ')")
    @Operation(summary = "Get all pages for a record", description = "Requires BATCH_PAGE_READ. Returns pages sorted by page number with presigned S3 URLs.")
    public ResponseEntity<Map<String, Object>> getBatchPages(
            @PathVariable String batchId,
            @PathVariable String recordId) {
        return ResponseEntity.ok(batchPageService.getPages(batchId, recordId));
    }

    @GetMapping("/batch-pages/{batchId}/{recordId}/{filename}")
    @PreAuthorize("hasAuthority('BATCH_PAGE_READ')")
    @Operation(summary = "Get single page", description = "Requires BATCH_PAGE_READ.")
    public ResponseEntity<Map<String, Object>> getBatchPage(
            @PathVariable String batchId,
            @PathVariable String recordId,
            @PathVariable String filename) {
        return ResponseEntity.ok(batchPageService.getPage(batchId, recordId, filename));
    }

    // ── RECORD LOCKS ─────────────────────────────────────────────────────────

    @GetMapping("/record-locks/{batchId}")
    @PreAuthorize("hasAuthority('RECORD_LOCK_READ')")
    @Operation(summary = "Get active locks for batch", description = "Requires RECORD_LOCK_READ.")
    public ResponseEntity<List<Map<String, Object>>> getRecordLocks(@PathVariable String batchId) {
        return ResponseEntity.ok(recordLockService.getActiveLocks(batchId));
    }

    @PostMapping("/record-locks/{batchId}/{recordId}")
    @PreAuthorize("hasAuthority('RECORD_LOCK_CREATE')")
    @Operation(
        summary = "Acquire record lock",
        description = "Requires RECORD_LOCK_CREATE. Returns 409 if another user holds the lock. Re-acquiring own lock refreshes TTL."
    )
    public ResponseEntity<Map<String, Object>> acquireLock(
            @PathVariable String batchId,
            @PathVariable String recordId,
            @RequestBody(required = false) Map<String, String> body) {

        if (body != null) TenantValidator.validate(body.get("tenantId"));
        String lockedBy = (body != null && body.get("username") != null)
                ? body.get("username")
                : "unknown";
        return ResponseEntity.ok(recordLockService.acquireLock(batchId, recordId, lockedBy));
    }

    @DeleteMapping("/record-locks/{batchId}/{recordId}")
    @PreAuthorize("hasAuthority('RECORD_LOCK_DELETE')")
    @Operation(summary = "Release record lock", description = "Requires RECORD_LOCK_DELETE.")
    public ResponseEntity<Map<String, Object>> releaseLock(
            @PathVariable String batchId,
            @PathVariable String recordId) {

        recordLockService.releaseLock(batchId, recordId);
        Map<String, Object> result = new HashMap<>();
        result.put("ok", true);
        return ResponseEntity.ok(result);
    }
}
