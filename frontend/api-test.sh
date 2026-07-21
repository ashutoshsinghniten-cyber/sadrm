#!/bin/bash
# SADRM API — curl test script
# Run with: bash api-test.sh
# Requires: curl, jq (optional — for pretty JSON output)

BASE="http://localhost"
TOKEN=""

echo "=================================================="
echo " SADRM API TEST"
echo " Base URL: $BASE"
echo "=================================================="

# ── helper ────────────────────────────────────────────
pretty() { command -v jq &>/dev/null && echo "$1" | jq . || echo "$1"; }
divider() { echo; echo "── $1 ──────────────────────────────────────────"; }

# ==================================================
# AUTH
# ==================================================

divider "LOGIN"
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"Admin@2026"}')
pretty "$LOGIN"
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo ""
echo "Token saved: ${TOKEN:0:40}..."

divider "REGISTER (new user — 409 if already exists)"
pretty "$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"Test@1234"}')"

divider "LIST USERNAMES (public)"
pretty "$(curl -s "$BASE/api/auth/users")"

divider "VERIFY TOKEN (me)"
pretty "$(curl -s "$BASE/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")"

# ==================================================
# ADMIN — USER MANAGEMENT
# ==================================================

divider "ADMIN — LIST ALL USERS"
pretty "$(curl -s "$BASE/api/auth/admin/users" \
  -H "Authorization: Bearer $TOKEN")"

divider "ADMIN — CREATE USER"
pretty "$(curl -s -X POST "$BASE/api/auth/admin/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"username":"johndoe","password":"Pass@1234","role":"user"}')"

divider "ADMIN — CHANGE ROLE (user → admin)"
pretty "$(curl -s -X PATCH "$BASE/api/auth/admin/users/johndoe/role" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"role":"admin"}')"

divider "ADMIN — REVOKE USER"
pretty "$(curl -s -X PATCH "$BASE/api/auth/admin/users/johndoe/revoke" \
  -H "Authorization: Bearer $TOKEN")"

divider "ADMIN — ACTIVATE USER"
pretty "$(curl -s -X PATCH "$BASE/api/auth/admin/users/johndoe/activate" \
  -H "Authorization: Bearer $TOKEN")"

# ==================================================
# DATA — BATCHES
# ==================================================

divider "GET ALL BATCHES"
pretty "$(curl -s "$BASE/api/data/batches" \
  -H "Authorization: Bearer $TOKEN")"

divider "UPSERT SINGLE BATCH (PATCH)"
pretty "$(curl -s -X PATCH "$BASE/api/data/batches/BATCH_0001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"id":"BATCH_0001","status":"hitl-review","records":[]}')"

divider "REPLACE ALL BATCHES (PUT — atomic)"
pretty "$(curl -s -X PUT "$BASE/api/data/batches" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '[{"id":"BATCH_0001","status":"hitl-review","records":[]}]')"

# ==================================================
# DATA — ARCHIVED RECORDS
# ==================================================

divider "GET ALL ARCHIVED RECORDS"
pretty "$(curl -s "$BASE/api/data/archived-records" \
  -H "Authorization: Bearer $TOKEN")"

divider "REPLACE ALL ARCHIVED RECORDS (PUT — atomic)"
pretty "$(curl -s -X PUT "$BASE/api/data/archived-records" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '[{"id":"REC_0000001","recordId":"0000001","pages":[]}]')"

# ==================================================
# RUNTIME — AI
# ==================================================

divider "RUNTIME HEALTH CHECK"
pretty "$(curl -s "$BASE/api/runtime/health")"

echo ""
echo "=================================================="
echo " DONE"
echo "=================================================="
