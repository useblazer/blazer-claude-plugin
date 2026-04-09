#!/bin/bash
# SessionEnd hook — aggregates per-session telemetry and uploads to Blazer API.
# Enhanced: includes token usage (from transcript), per-tool duration, and per-phase breakdowns.
# Reads: $CLAUDE_PLUGIN_DATA/telemetry-*.jsonl, current-session.json, transcript JSONL
# Calls: POST /telemetry/session-summary (per journey with events in this session)

set -u

if ! command -v jq &>/dev/null; then exit 0; fi

CURRENT_SESSION_FILE="$CLAUDE_PLUGIN_DATA/current-session.json"
if [ ! -f "$CURRENT_SESSION_FILE" ]; then exit 0; fi

CURRENT_SESSION=$(cat "$CURRENT_SESSION_FILE")
SESSION_ID=$(echo "$CURRENT_SESSION" | jq -r '.session_id // "unknown"')
MODEL=$(echo "$CURRENT_SESSION" | jq -r '.model // ""')
TRANSCRIPT_PATH=$(echo "$CURRENT_SESSION" | jq -r '.transcript_path // ""')

API_URL="${Blazer_API_URL:-https://api.userblazer.ai/v1}"

# --- Parse transcript for token usage ---
TOTAL_INPUT_TOKENS=0
TOTAL_OUTPUT_TOKENS=0
CACHE_READ_TOKENS=0
CACHE_CREATION_TOKENS=0

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Stream line-by-line instead of slurping entire transcript into memory.
  # Extract per-line token fields, then sum with awk.
  read -r RAW_INPUT TOTAL_OUTPUT_TOKENS CACHE_READ_TOKENS CACHE_CREATION_TOKENS < <(
    jq -c 'select(.type == "assistant" and .message.usage.output_tokens != null) |
      .message.usage |
      [(.input_tokens // 0), (.output_tokens // 0), (.cache_read_input_tokens // 0), (.cache_creation_input_tokens // 0)]' \
      "$TRANSCRIPT_PATH" 2>/dev/null \
    | awk -F'[,\\[\\]]' '{i+=$2; o+=$3; cr+=$4; cc+=$5} END {print i+0, o+0, cr+0, cc+0}'
  ) || true

  RAW_INPUT=${RAW_INPUT:-0}
  TOTAL_OUTPUT_TOKENS=${TOTAL_OUTPUT_TOKENS:-0}
  CACHE_READ_TOKENS=${CACHE_READ_TOKENS:-0}
  CACHE_CREATION_TOKENS=${CACHE_CREATION_TOKENS:-0}

  # Total input = raw input + cache_read + cache_creation
  TOTAL_INPUT_TOKENS=$((RAW_INPUT + CACHE_READ_TOKENS + CACHE_CREATION_TOKENS))
fi

# --- Process per-journey telemetry ---
for TELEMETRY_FILE in "$CLAUDE_PLUGIN_DATA"/telemetry-*.jsonl; do
  [ -f "$TELEMETRY_FILE" ] || continue

  JOURNEY_ID=$(basename "$TELEMETRY_FILE" | sed 's/telemetry-//;s/.jsonl//')

  # Filter to this session's events only
  SESSION_EVENTS=$(grep "\"session_id\":\"$SESSION_ID\"" "$TELEMETRY_FILE" || true)

  if [ -z "$SESSION_EVENTS" ]; then
    continue
  fi

  # Skip if already uploaded by the MCP completion tool
  if [ -f "$CLAUDE_PLUGIN_DATA/uploaded-${JOURNEY_ID}-${SESSION_ID}" ]; then
    rm -f "$CLAUDE_PLUGIN_DATA/uploaded-${JOURNEY_ID}-${SESSION_ID}"
    continue
  fi

  # Basic aggregates (existing)
  TOTAL_CALLS=$(echo "$SESSION_EVENTS" | wc -l | tr -d ' ')
  ERRORS=$(echo "$SESSION_EVENTS" | grep -c '"success":false' || echo "0")
  PRODUCT_CALLS=$(echo "$SESSION_EVENTS" | grep -c '"is_product_call":true' || echo "0")
  FIRST_TS=$(echo "$SESSION_EVENTS" | head -1 | jq -r '.timestamp')
  LAST_TS=$(echo "$SESSION_EVENTS" | tail -1 | jq -r '.timestamp')

  # Determine session phase (last non-empty phase from events)
  SESSION_PHASE=$(echo "$SESSION_EVENTS" | jq -r 'select(.phase != null and .phase != "") | .phase' | tail -1)
  SESSION_PHASE=${SESSION_PHASE:-""}

  # Sum tool execution durations
  TOOL_EXEC_TIME=$(echo "$SESSION_EVENTS" | jq -s '[.[].duration_ms // 0] | add // 0' 2>/dev/null || echo "0")

  # Per-phase aggregates (compact to single line for safe --argjson passing)
  PHASES=$(echo "$SESSION_EVENTS" | jq -sc '
    group_by(.phase) |
    map(select(.[0].phase != null and .[0].phase != "")) |
    map({
      key: .[0].phase,
      value: {
        tool_calls: length,
        errors: ([.[] | select(.success == false)] | length),
        product_tool_calls: ([.[] | select(.is_product_call == true)] | length),
        tool_execution_time_ms: ([.[].duration_ms // 0] | add // 0)
      }
    }) |
    from_entries
  ' 2>/dev/null || echo '{}')

  # Ensure numeric values are valid (strip whitespace, defensive defaults)
  TOTAL_CALLS=$(echo "${TOTAL_CALLS:-0}" | tr -d '[:space:]')
  ERRORS=$(echo "${ERRORS:-0}" | tr -d '[:space:]')
  PRODUCT_CALLS=$(echo "${PRODUCT_CALLS:-0}" | tr -d '[:space:]')
  TOOL_EXEC_TIME=$(echo "${TOOL_EXEC_TIME:-0}" | tr -d '[:space:]')
  TOTAL_INPUT_TOKENS=$(echo "${TOTAL_INPUT_TOKENS:-0}" | tr -d '[:space:]')
  TOTAL_OUTPUT_TOKENS=$(echo "${TOTAL_OUTPUT_TOKENS:-0}" | tr -d '[:space:]')
  CACHE_READ_TOKENS=$(echo "${CACHE_READ_TOKENS:-0}" | tr -d '[:space:]')
  CACHE_CREATION_TOKENS=$(echo "${CACHE_CREATION_TOKENS:-0}" | tr -d '[:space:]')
  PHASES=${PHASES:-'{}'}

  # Upload session summary (skip if no API key)
  if [ -n "${Blazer_API_KEY:-}" ]; then
    PAYLOAD=$(jq -n \
        --arg jid "$JOURNEY_ID" \
        --arg sid "$SESSION_ID" \
        --arg csid "$SESSION_ID" \
        --arg first "$FIRST_TS" \
        --arg last "$LAST_TS" \
        --argjson total "$TOTAL_CALLS" \
        --argjson errors "$ERRORS" \
        --argjson product "$PRODUCT_CALLS" \
        --argjson input_tokens "$TOTAL_INPUT_TOKENS" \
        --argjson output_tokens "$TOTAL_OUTPUT_TOKENS" \
        --argjson cache_read "$CACHE_READ_TOKENS" \
        --argjson cache_creation "$CACHE_CREATION_TOKENS" \
        --argjson tool_exec "$TOOL_EXEC_TIME" \
        --arg model "$MODEL" \
        --arg session_phase "$SESSION_PHASE" \
        --argjson phases "$PHASES" \
        '{
          journey_id: $jid,
          session_id: $sid,
          claude_session_id: $csid,
          first_event: $first,
          last_event: $last,
          total_tool_calls: $total,
          error_count: $errors,
          product_tool_calls: $product,
          total_input_tokens: $input_tokens,
          total_output_tokens: $output_tokens,
          cache_read_tokens: $cache_read,
          cache_creation_tokens: $cache_creation,
          tool_execution_time_ms: $tool_exec,
          model: $model,
          session_phase: $session_phase,
          phases: $phases
        }' 2>/dev/null) || true

    if [ -n "$PAYLOAD" ]; then
      curl -s -X POST "${API_URL}/telemetry/session-summary" \
        -H "Authorization: Bearer ${Blazer_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" > /dev/null 2>&1 || true
    fi
  fi
done

# Clean up session file, pending phase, and timing files (but NOT telemetry — journey may continue)
rm -f "$CLAUDE_PLUGIN_DATA/current-session.json"
rm -f "$CLAUDE_PLUGIN_DATA/pending-phase.json"
rm -f "$CLAUDE_PLUGIN_DATA/last-completed-journey.json"
rm -f "$CLAUDE_PLUGIN_DATA"/tool-timing-*
rm -f "$CLAUDE_PLUGIN_DATA"/uploaded-*

exit 0
