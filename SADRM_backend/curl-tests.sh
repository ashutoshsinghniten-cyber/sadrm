#!/usr/bin/env bash
# =============================================================================
# SADRM Backend — Full Endpoint Curl Test Collection
# Run with Git Bash on Windows:  bash curl-tests.sh
# =============================================================================

BASE="http://localhost:8080"
TOKEN=""          # auto-filled after login
ADMIN_TOKEN=""    # auto-filled after admin login

# Pretty print helper
sep() { echo; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; echo "▶  $1"; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }


# ─────────────────────────────────────────────────────────────────────────────
# 1. HEALTH
# ─────────────────────────────────────────────────────────────────────────────
sep "GET /api/health"
curl -s -X GET "$BASE/api/health" | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 2. AUTH
# ─────────────────────────────────────────────────────────────────────────────

sep "POST /api/auth/register  (first user → auto admin)"
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}' | jq .

sep "POST /api/auth/register  (second user → plain user)"
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"Test@1234"}' | jq .

sep "POST /api/auth/login  (admin)"
LOGIN_RESP=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}')
echo "$LOGIN_RESP" | jq .
ADMIN_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.token')
echo "ADMIN_TOKEN=$ADMIN_TOKEN"

sep "POST /api/auth/login  (testuser)"
LOGIN_RESP2=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"Test@1234"}')
echo "$LOGIN_RESP2" | jq .
TOKEN=$(echo "$LOGIN_RESP2" | jq -r '.token')
echo "USER_TOKEN=$TOKEN"

sep "POST /api/auth/login  (wrong password → 401)"
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrongpassword"}' | jq .

sep "GET /api/auth/users  (public — no token needed)"
curl -s -X GET "$BASE/api/auth/users" | jq .

sep "GET /api/auth/me  (with user token)"
curl -s -X GET "$BASE/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

sep "GET /api/auth/me  (with admin token)"
curl -s -X GET "$BASE/api/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/auth/me  (no token → 401)"
curl -s -X GET "$BASE/api/auth/me" | jq .

sep "GET /api/auth/admin/users  (admin only)"
curl -s -X GET "$BASE/api/auth/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/auth/admin/users  (non-admin → 403)"
curl -s -X GET "$BASE/api/auth/admin/users" \
  -H "Authorization: Bearer $TOKEN" | jq .

sep "POST /api/auth/admin/users  (create new user via admin)"
curl -s -X POST "$BASE/api/auth/admin/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"username":"operator1","password":"Oper@1234","role":"user"}' | jq .

sep "PATCH /api/auth/admin/users/testuser/revoke"
curl -s -X PATCH "$BASE/api/auth/admin/users/testuser/revoke" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "PATCH /api/auth/admin/users/testuser/activate"
curl -s -X PATCH "$BASE/api/auth/admin/users/testuser/activate" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "PATCH /api/auth/admin/users/testuser/role  (change to admin)"
curl -s -X PATCH "$BASE/api/auth/admin/users/testuser/role" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"role":"admin"}' | jq .

sep "PATCH /api/auth/admin/users/testuser/role  (change back to user)"
curl -s -X PATCH "$BASE/api/auth/admin/users/testuser/role" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"role":"user"}' | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 3. BATCHES
# ─────────────────────────────────────────────────────────────────────────────

sep "PUT /api/data/batches  (bulk upsert — insert 2 batches)"
curl -s -X PUT "$BASE/api/data/batches" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '[
    {
      "id": "BATCH-001",
      "data": {
        "id": "BATCH-001",
        "status": "pending",
        "name": "Test Batch 001",
        "records": [
          {"recordId": "R001", "name": "John Doe", "amount": 100},
          {"recordId": "R002", "name": "Jane Smith", "amount": 200}
        ]
      }
    },
    {
      "id": "BATCH-002",
      "data": {
        "id": "BATCH-002",
        "status": "in_progress",
        "name": "Test Batch 002",
        "records": [
          {"recordId": "R003", "name": "Bob Jones", "amount": 50}
        ]
      }
    }
  ]' | jq .

sep "GET /api/data/batches  (all batches)"
curl -s -X GET "$BASE/api/data/batches" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/data/batches?status=pending  (filter by status)"
curl -s -X GET "$BASE/api/data/batches?status=pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/data/batches?summary=1  (summary view)"
curl -s -X GET "$BASE/api/data/batches?summary=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/data/batches/BATCH-001  (single batch)"
curl -s -X GET "$BASE/api/data/batches/BATCH-001" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "PATCH /api/data/batches/BATCH-001  (update status)"
curl -s -X PATCH "$BASE/api/data/batches/BATCH-001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"data": {"status": "in_progress", "notes": "Processing started"}}' | jq .

sep "PUT /api/data/batches?replace=1  (bulk replace — requires header)"
curl -s -X PUT "$BASE/api/data/batches?replace=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Allow-Bulk-Replace: true" \
  -d '[
    {
      "id": "BATCH-001",
      "data": {
        "id": "BATCH-001",
        "status": "completed",
        "name": "Test Batch 001 — Replaced",
        "records": []
      }
    }
  ]' | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 4. ARCHIVED RECORDS
# ─────────────────────────────────────────────────────────────────────────────

sep "PUT /api/data/archived-records  (bulk upsert)"
curl -s -X PUT "$BASE/api/data/archived-records" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '[
    {
      "id": "AR-001",
      "data": {
        "id": "AR-001",
        "donorName": "Alice Brown",
        "amount": 500,
        "date": "2024-01-15",
        "batchId": "BATCH-001"
      }
    },
    {
      "id": "AR-002",
      "data": {
        "id": "AR-002",
        "donorName": "Charlie Davis",
        "amount": 250,
        "date": "2024-01-16",
        "batchId": "BATCH-001"
      }
    }
  ]' | jq .

sep "GET /api/data/archived-records  (paginated, default offset=0 limit=10)"
curl -s -X GET "$BASE/api/data/archived-records" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/data/archived-records?offset=0&limit=1  (limit=1)"
curl -s -X GET "$BASE/api/data/archived-records?offset=0&limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "PATCH /api/data/archived-records/AR-001  (update record)"
curl -s -X PATCH "$BASE/api/data/archived-records/AR-001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"data": {"donorName": "Alice Brown", "amount": 600, "verified": true}}' | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 5. BATCH PAGES
# ─────────────────────────────────────────────────────────────────────────────

sep "POST /api/data/batch-pages  (upload a page as base64)"
# Tiny 1x1 white PNG in base64
curl -s -X POST "$BASE/api/data/batch-pages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "batchId": "BATCH-001",
    "recordId": "R001",
    "filename": "page-1.png",
    "fileBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }' | jq .

sep "GET /api/data/batch-pages/BATCH-001/R001/page-1.png"
curl -s -X GET "$BASE/api/data/batch-pages/BATCH-001/R001/page-1.png" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 6. RECORD LOCKS
# ─────────────────────────────────────────────────────────────────────────────

sep "POST /api/data/record-locks/BATCH-001/R001  (acquire lock)"
curl -s -X POST "$BASE/api/data/record-locks/BATCH-001/R001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"username":"admin"}' | jq .

sep "POST /api/data/record-locks/BATCH-001/R001  (acquire same lock again — same user, OK)"
curl -s -X POST "$BASE/api/data/record-locks/BATCH-001/R001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"username":"admin"}' | jq .

sep "POST /api/data/record-locks/BATCH-001/R001  (different user → 409 Conflict)"
curl -s -X POST "$BASE/api/data/record-locks/BATCH-001/R001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"username":"testuser"}' | jq .

sep "GET /api/data/record-locks/BATCH-001  (all active locks for batch)"
curl -s -X GET "$BASE/api/data/record-locks/BATCH-001" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "DELETE /api/data/record-locks/BATCH-001/R001  (release lock)"
curl -s -X DELETE "$BASE/api/data/record-locks/BATCH-001/R001" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "GET /api/data/record-locks/BATCH-001  (locks after release — should be empty)"
curl -s -X GET "$BASE/api/data/record-locks/BATCH-001" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 7. SSE EVENTS STREAM
# ─────────────────────────────────────────────────────────────────────────────

sep "GET /api/data/events  (SSE — via Authorization header, runs 5 sec)"
echo "Connecting to SSE stream for 5 seconds..."
curl -s -N \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Accept: text/event-stream" \
  "$BASE/api/data/events" &
SSE_PID=$!
sleep 5
kill $SSE_PID 2>/dev/null
echo "[SSE stream closed]"

sep "GET /api/data/events?token=TOKEN  (SSE — via query param, runs 3 sec)"
echo "Connecting via ?token= for 3 seconds..."
curl -s -N \
  -H "Accept: text/event-stream" \
  "$BASE/api/data/events?token=$ADMIN_TOKEN" &
SSE_PID2=$!
sleep 3
kill $SSE_PID2 2>/dev/null
echo "[SSE stream closed]"

sep "GET /api/data/events  (no token → 401)"
curl -s -X GET "$BASE/api/data/events" | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 8. RUNTIME (AI PROXY)
# ─────────────────────────────────────────────────────────────────────────────

sep "GET /api/runtime/health  (public — no token)"
curl -s -X GET "$BASE/api/runtime/health" | jq .

sep "POST /api/runtime/extraction  (AI proxy — needs AI_RUNTIME_API_KEY configured)"
curl -s -X POST "$BASE/api/runtime/extraction" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Extract donor name and amount from: John Doe donated $100 on Jan 15."
      }
    ],
    "system": "You are a data extraction assistant. Return JSON only.",
    "maxTokens": 256
  }' | jq .


# ─────────────────────────────────────────────────────────────────────────────
# 9. ERROR / EDGE CASES
# ─────────────────────────────────────────────────────────────────────────────

sep "GET /api/data/batches/NON-EXISTENT-BATCH  (404)"
curl -s -X GET "$BASE/api/data/batches/NON-EXISTENT-BATCH" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

sep "POST /api/auth/login  (validation error — empty body)"
curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

sep "PUT /api/data/batches  (missing body → 400)"
curl -s -X PUT "$BASE/api/data/batches" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d 'null' | jq .

sep "PATCH /api/data/batches/BATCH-001  (empty body → 400)"
curl -s -X PATCH "$BASE/api/data/batches/BATCH-001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{}' | jq .

sep "ANY endpoint with expired/invalid token → 401"
curl -s -X GET "$BASE/api/auth/me" \
  -H "Authorization: Bearer invalid.token.here" | jq .


echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ALL TESTS COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
