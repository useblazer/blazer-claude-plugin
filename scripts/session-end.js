#!/usr/bin/env node
// SessionEnd hook — aggregates per-session telemetry and uploads to Blazer API.
// Includes token usage (from transcript), per-tool duration, and per-phase breakdowns.
// Reads: $CLAUDE_PLUGIN_DATA/telemetry-*.jsonl, current-session.json, transcript JSONL
// Calls: POST /telemetry/session-summary (per journey with events in this session)

import fs from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) process.exit(0);

  const currentSessionPath = path.join(dataDir, "current-session.json");
  if (!fs.existsSync(currentSessionPath)) process.exit(0);

  let currentSession;
  try {
    currentSession = JSON.parse(fs.readFileSync(currentSessionPath, "utf-8"));
  } catch {
    process.exit(0);
  }

  const sessionId = currentSession.session_id || "unknown";
  const model = currentSession.model || "";
  const transcriptPath = currentSession.transcript_path || "";
  const apiUrl = process.env.BLAZER_API_URL || process.env.Blazer_API_URL || "https://api.userblazer.ai/v1";
  const apiKey = process.env.BLAZER_API_KEY || process.env.Blazer_API_KEY || "";

  // --- Parse transcript for token usage ---
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

  // --- Process per-journey telemetry ---
  const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("telemetry-") && f.endsWith(".jsonl"));

  for (const filename of files) {
    const journeyId = filename.replace("telemetry-", "").replace(".jsonl", "");
    const telemetryFile = path.join(dataDir, filename);

    let lines;
    try {
      lines = fs.readFileSync(telemetryFile, "utf-8").split("\n").filter((l) => l.trim());
    } catch {
      continue;
    }

    // Filter to this session's events only
    const sessionEvents = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        if (evt.session_id === sessionId) sessionEvents.push(evt);
      } catch { /* skip malformed */ }
    }

    if (sessionEvents.length === 0) continue;

    // Skip if already uploaded by the MCP completion tool
    const uploadedMarker = path.join(dataDir, `uploaded-${journeyId}-${sessionId}`);
    if (fs.existsSync(uploadedMarker)) {
      try { fs.unlinkSync(uploadedMarker); } catch { /* ignore */ }
      continue;
    }

    // Basic aggregates
    const totalCalls = sessionEvents.length;
    const errors = sessionEvents.filter((e) => e.success === false).length;
    const productCalls = sessionEvents.filter((e) => e.is_product_call === true).length;
    const firstTs = sessionEvents[0].timestamp;
    const lastTs = sessionEvents[sessionEvents.length - 1].timestamp;
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

    // Upload session summary
    if (apiKey) {
      const payload = {
        journey_id: journeyId,
        session_id: sessionId,
        claude_session_id: sessionId,
        first_event: firstTs,
        last_event: lastTs,
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

      try {
        await fetch(`${apiUrl}/telemetry/session-summary`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // Upload failed — best effort
      }
    }
  }

  // Clean up session file, pending phase, and timing files (but NOT telemetry — journey may continue)
  const cleanupPatterns = ["current-session.json", "pending-phase.json", "last-completed-journey.json"];
  for (const name of cleanupPatterns) {
    try { fs.unlinkSync(path.join(dataDir, name)); } catch { /* ignore */ }
  }
  // Clean up tool-timing-* and uploaded-* files
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith("tool-timing-") || f.startsWith("uploaded-")) {
      try { fs.unlinkSync(path.join(dataDir, f)); } catch { /* ignore */ }
    }
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

main().catch(() => process.exit(0));
