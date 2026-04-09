#!/bin/bash
# PostToolUse hook — captures completion timestamp, duration, and detects product calls.
# Reads: stdin JSON with tool_name, tool_input, tool_response, tool_use_id
# Writes: appends to $CLAUDE_PLUGIN_DATA/telemetry-{journey_id}.jsonl

set -euo pipefail

if ! command -v jq &>/dev/null; then exit 0; fi

INPUT=$(cat)
ACTIVE_SESSION_FILE="$CLAUDE_PLUGIN_DATA/active-session.json"
CURRENT_SESSION_FILE="$CLAUDE_PLUGIN_DATA/current-session.json"
LAST_COMPLETED_FILE="$CLAUDE_PLUGIN_DATA/last-completed-journey.json"

# Primary source: active session. Fallback: last-completed-journey (written by
# complete_integration / complete_migration just before they clear active-session).
if [ -f "$ACTIVE_SESSION_FILE" ]; then
  ACTIVE_SESSION=$(cat "$ACTIVE_SESSION_FILE")
elif [ -f "$LAST_COMPLETED_FILE" ]; then
  ACTIVE_SESSION=$(cat "$LAST_COMPLETED_FILE")
  rm -f "$LAST_COMPLETED_FILE"
else
  exit 0
fi

CURRENT_SESSION=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null || echo '{}')

JOURNEY_ID=$(echo "$ACTIVE_SESSION" | jq -r '.journey_id')
SESSION_ID=$(echo "$CURRENT_SESSION" | jq -r '.session_id // "unknown"')
PRODUCT_ID=$(echo "$ACTIVE_SESSION" | jq -r '.product_id')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // ""')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TIMESTAMP_EPOCH=$(date +%s)

# Compute duration from paired pre-event
DURATION_MS=0
if [ -n "$TOOL_USE_ID" ]; then
  TIMING_FILE="$CLAUDE_PLUGIN_DATA/tool-timing-${TOOL_USE_ID}"
  if [ -f "$TIMING_FILE" ]; then
    PRE_TS=$(cat "$TIMING_FILE")
    PRE_EPOCH=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$PRE_TS" +%s 2>/dev/null || date -u -d "$PRE_TS" +%s 2>/dev/null || echo "0")
    if [ "$PRE_EPOCH" -gt 0 ] 2>/dev/null; then
      DURATION_MS=$(( (TIMESTAMP_EPOCH - PRE_EPOCH) * 1000 ))
    fi
    rm -f "$TIMING_FILE"
  fi
fi

# Read current phase
PHASE=$(echo "$ACTIVE_SESSION" | jq -r '.phase // ""')
PENDING_PHASE_FILE="$CLAUDE_PLUGIN_DATA/pending-phase.json"
if [ -z "$PHASE" ] && [ -f "$PENDING_PHASE_FILE" ]; then
  PHASE=$(jq -r '.phase // ""' "$PENDING_PHASE_FILE")
fi

# Check if this tool call is to the product being integrated
IS_PRODUCT_CALL="false"
if echo "$TOOL_NAME" | grep -qi "$PRODUCT_ID"; then
  IS_PRODUCT_CALL="true"
fi

echo "$INPUT" | jq -c --arg ts "$TIMESTAMP" --arg jid "$JOURNEY_ID" --arg sid "$SESSION_ID" \
  --arg ipc "$IS_PRODUCT_CALL" --argjson dur "$DURATION_MS" --arg phase "$PHASE" \
  '{event: "post_tool_use", journey_id: $jid, session_id: $sid, tool_name: .tool_name, timestamp: $ts, is_product_call: ($ipc == "true"), success: true, duration_ms: $dur, phase: $phase}' \
  >> "$CLAUDE_PLUGIN_DATA/telemetry-${JOURNEY_ID}.jsonl"

exit 0
