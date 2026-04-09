#!/bin/bash
# SessionStart hook — registers session with Blazer API for journey correlation.
# Reads: stdin JSON with session_id, cwd
# Writes: $CLAUDE_PLUGIN_DATA/current-session.json (for other hooks)
# Calls: POST /sessions/register (only if consent granted and API key present)

set -euo pipefail

# Bail if jq is not available
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Ensure plugin data directory exists
mkdir -p "$CLAUDE_PLUGIN_DATA"

# Check for cached project context from a previous extract_stack_fingerprint call
PROJECT_CONTEXT="$CLAUDE_PLUGIN_DATA/project-context.json"
if [ ! -f "$PROJECT_CONTEXT" ]; then
  # No prior fingerprint — compute a project_hash from git remote or cwd
  GIT_REMOTE=$(cd "$CWD" && git remote get-url origin 2>/dev/null || true)
  if [ -n "$GIT_REMOTE" ]; then
    PROJECT_HASH="sha256:$(echo -n "$GIT_REMOTE" | shasum -a 256 | cut -d' ' -f1)"
  else
    PROJECT_HASH="sha256:$(echo -n "$CWD" | shasum -a 256 | cut -d' ' -f1)"
  fi
  echo "{\"project_hash\": \"$PROJECT_HASH\"}" > "$PROJECT_CONTEXT"
else
  PROJECT_HASH=$(jq -r '.project_hash' "$PROJECT_CONTEXT")
fi

# Write session info for other hooks to read (always — local state only)
MODEL=$(echo "$INPUT" | jq -r '.model // "unknown"')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')

jq -n \
  --arg sid "$SESSION_ID" \
  --arg ph "$PROJECT_HASH" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg model "$MODEL" \
  --arg transcript "$TRANSCRIPT_PATH" \
  '{session_id: $sid, project_hash: $ph, started_at: $ts, model: $model, transcript_path: $transcript}' \
  > "$CLAUDE_PLUGIN_DATA/current-session.json"

# Only report to API if (a) consent has been granted and (b) API key is configured
CONSENT_FILE="$CWD/.claude/blazer-consent.json"
if [ ! -f "$CONSENT_FILE" ]; then
  exit 0
fi
if [ -z "${Blazer_API_KEY:-}" ]; then
  exit 0
fi

# Report to API (fire-and-forget)
curl -s -X POST "${Blazer_API_URL:-https://api.userblazer.ai/v1}/sessions/register" \
  -H "Authorization: Bearer ${Blazer_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg ph "$PROJECT_HASH" \
    --arg sid "$SESSION_ID" \
    '{project_hash: $ph, claude_code_session_id: $sid}'
  )" > /dev/null 2>&1 || true

exit 0
