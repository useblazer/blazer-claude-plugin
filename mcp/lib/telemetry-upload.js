import fs from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Aggregates telemetry for a completed journey and uploads the session summary.
 * Called directly from complete_integration / complete_migration so the data
 * appears on the journey immediately — not deferred to SessionEnd.
 */
export async function uploadSessionTelemetry(apiClient, pluginData, journeyId) {
  if (!pluginData || !apiClient) return;

  const dataDir = pluginData.dataDir;

  // Read current session metadata
  const currentSession = pluginData.readJson("current-session.json");
  if (!currentSession) return;

  const sessionId = currentSession.session_id || "unknown";
  const model = currentSession.model || "";
  const transcriptPath = currentSession.transcript_path || "";

  // Read telemetry events for this journey, filtered to current session
  const telemetryFile = path.join(dataDir, `telemetry-${journeyId}.jsonl`);
  let sessionEvents;
  try {
    const raw = fs.readFileSync(telemetryFile, "utf-8");
    sessionEvents = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter((e) => e && e.session_id === sessionId);
  } catch {
    return; // No telemetry file for this journey
  }

  if (sessionEvents.length === 0) return;

  // Basic aggregates
  const totalCalls = sessionEvents.length;
  const errors = sessionEvents.filter((e) => e.success === false).length;
  const productCalls = sessionEvents.filter((e) => e.is_product_call === true).length;
  const firstEvent = sessionEvents[0].timestamp;
  const lastEvent = sessionEvents[sessionEvents.length - 1].timestamp;
  const toolExecTime = sessionEvents.reduce((sum, e) => sum + Math.max(0, e.duration_ms || 0), 0);

  // Session phase (last non-empty)
  const sessionPhase = sessionEvents
    .filter((e) => e.phase)
    .map((e) => e.phase)
    .pop() || "";

  // Per-phase breakdown
  const phaseMap = {};
  for (const evt of sessionEvents) {
    const p = evt.phase;
    if (!p) continue;
    if (!phaseMap[p]) {
      phaseMap[p] = { tool_calls: 0, errors: 0, product_tool_calls: 0, tool_execution_time_ms: 0 };
    }
    phaseMap[p].tool_calls++;
    if (evt.success === false) phaseMap[p].errors++;
    if (evt.is_product_call === true) phaseMap[p].product_tool_calls++;
    phaseMap[p].tool_execution_time_ms += Math.max(0, evt.duration_ms || 0);
  }

  // Parse transcript for token usage
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const tokens = await parseTranscriptTokens(transcriptPath);
      totalOutputTokens = tokens.output;
      cacheReadTokens = tokens.cacheRead;
      cacheCreationTokens = tokens.cacheCreation;
      totalInputTokens = tokens.rawInput + cacheReadTokens + cacheCreationTokens;
    } catch {
      // Token parsing failed — continue with zeros
    }
  }

  const payload = {
    journey_id: journeyId,
    session_id: sessionId,
    claude_session_id: sessionId,
    first_event: firstEvent,
    last_event: lastEvent,
    total_tool_calls: totalCalls,
    error_count: errors,
    product_tool_calls: productCalls,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_creation_tokens: cacheCreationTokens,
    tool_execution_time_ms: toolExecTime,
    model,
    session_phase: sessionPhase,
    phases: phaseMap,
  };

  const result = await apiClient.post("/telemetry/session-summary", payload);

  // Mark this journey+session as uploaded so session-end.sh won't double-send
  if (!result.error) {
    const markerFile = path.join(dataDir, `uploaded-${journeyId}-${sessionId}`);
    try { fs.writeFileSync(markerFile, ""); } catch { /* best-effort */ }
  }
}

/**
 * Stream-parse a Claude Code transcript JSONL for token usage.
 * Reads line-by-line to avoid loading the entire file into memory.
 */
function parseTranscriptTokens(filePath) {
  return new Promise((resolve, reject) => {
    let rawInput = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheCreation = 0;

    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

    rl.on("line", (line) => {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "assistant" || !entry.message?.usage?.output_tokens) return;
        const u = entry.message.usage;
        rawInput += u.input_tokens || 0;
        output += u.output_tokens || 0;
        cacheRead += u.cache_read_input_tokens || 0;
        cacheCreation += u.cache_creation_input_tokens || 0;
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => resolve({ rawInput, output, cacheRead, cacheCreation }));
    rl.on("error", reject);
  });
}
