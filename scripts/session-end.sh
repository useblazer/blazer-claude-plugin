#!/bin/bash
# SessionEnd hook — aggregates per-session telemetry and uploads to Blazer API.
# Reads: $CLAUDE_PLUGIN_DATA/telemetry-*.jsonl, current-session.json
# Calls: POST /telemetry/session-summary (per journey with events in this session)
# Retains telemetry files on upload failure for retry next session.

set -euo pipefail

if ! command -v jq &>/dev/null; then exit 0; fi

CURRENT_SESSION_FILE="$CLAUDE_PLUGIN_DATA/current-session.json"
if [ ! -f "$CURRENT_SESSION_FILE" ]; then exit 0; fi

CURRENT_SESSION=$(cat "$CURRENT_SESSION_FILE")
SESSION_ID=$(echo "$CURRENT_SESSION" | jq -r '.session_id // "unknown"')

API_URL="${Blazer_API_URL:-https://api.userblazer.ai/v1}"

for TELEMETRY_FILE in "$CLAUDE_PLUGIN_DATA"/telemetry-*.jsonl; do
  [ -f "$TELEMETRY_FILE" ] || continue

  JOURNEY_ID=$(basename "$TELEMETRY_FILE" | sed 's/telemetry-//;s/.jsonl//')

  # Compute aggregates for THIS session's events only
  SESSION_EVENTS=$(grep "\"session_id\":\"$SESSION_ID\"" "$TELEMETRY_FILE" || true)

  if [ -z "$SESSION_EVENTS" ]; then
    continue
  fi

  TOTAL_CALLS=$(echo "$SESSION_EVENTS" | wc -l | tr -d ' ')
  ERRORS=$(echo "$SESSION_EVENTS" | grep -c '"success":false' || echo "0")
  PRODUCT_CALLS=$(echo "$SESSION_EVENTS" | grep -c '"is_product_call":true' || echo "0")
  FIRST_TS=$(echo "$SESSION_EVENTS" | head -1 | jq -r '.timestamp')
  LAST_TS=$(echo "$SESSION_EVENTS" | tail -1 | jq -r '.timestamp')

  # Upload session summary (skip if no API key)
  if [ -n "${Blazer_API_KEY:-}" ]; then
    curl -s -X POST "${API_URL}/telemetry/session-summary" \
      -H "Authorization: Bearer ${Blazer_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n \
        --arg jid "$JOURNEY_ID" \
        --arg sid "$SESSION_ID" \
        --arg first "$FIRST_TS" \
        --arg last "$LAST_TS" \
        --argjson total "$TOTAL_CALLS" \
        --argjson errors "$ERRORS" \
        --argjson product "$PRODUCT_CALLS" \
        '{journey_id: $jid, session_id: $sid, first_event: $first, last_event: $last, total_tool_calls: $total, error_count: $errors, product_tool_calls: $product}'
      )" > /dev/null 2>&1 || true
    # Note: if upload fails, telemetry files are retained for retry next session
  fi
done

# Clean up session file (but NOT telemetry — journey may continue)
rm -f "$CLAUDE_PLUGIN_DATA/current-session.json"

exit 0
