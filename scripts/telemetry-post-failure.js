#!/usr/bin/env node
// PostToolUseFailure hook — captures error details for failed MCP tool calls.
// Reads: stdin JSON with tool_name, tool_response (containing error), tool_use_id
// Writes: appends to $CLAUDE_PLUGIN_DATA/telemetry-{journey_id}.jsonl

import fs from "node:fs";
import path from "node:path";

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) process.exit(0);

  const input = JSON.parse(await readStdin());

  const activeSessionPath = path.join(dataDir, "active-session.json");
  const currentSessionPath = path.join(dataDir, "current-session.json");
  const lastCompletedPath = path.join(dataDir, "last-completed-journey.json");

  let activeSession;
  if (fs.existsSync(activeSessionPath)) {
    activeSession = JSON.parse(fs.readFileSync(activeSessionPath, "utf-8"));
  } else if (fs.existsSync(lastCompletedPath)) {
    activeSession = JSON.parse(fs.readFileSync(lastCompletedPath, "utf-8"));
    try { fs.unlinkSync(lastCompletedPath); } catch { /* ignore */ }
  } else {
    process.exit(0);
  }

  let currentSession = {};
  try {
    currentSession = JSON.parse(fs.readFileSync(currentSessionPath, "utf-8"));
  } catch { /* no current session */ }

  const journeyId = activeSession.journey_id;
  const sessionId = currentSession.session_id || "unknown";
  const toolUseId = input.tool_use_id || "";
  const timestamp = new Date().toISOString();
  const timestampEpoch = Math.floor(Date.now() / 1000);

  // Compute duration from paired pre-event
  let durationMs = 0;
  if (toolUseId) {
    const timingFile = path.join(dataDir, `tool-timing-${toolUseId}`);
    try {
      const preTs = fs.readFileSync(timingFile, "utf-8").trim();
      const preEpoch = Math.floor(new Date(preTs).getTime() / 1000);
      if (preEpoch > 0) {
        durationMs = (timestampEpoch - preEpoch) * 1000;
      }
      fs.unlinkSync(timingFile);
    } catch { /* no timing file */ }
  }

  // Read current phase
  let phase = activeSession.phase || "";
  if (!phase) {
    const pendingPhasePath = path.join(dataDir, "pending-phase.json");
    try {
      const pending = JSON.parse(fs.readFileSync(pendingPhasePath, "utf-8"));
      phase = pending.phase || "";
    } catch { /* no pending phase */ }
  }

  const event = {
    event: "post_tool_use_failure",
    journey_id: journeyId,
    session_id: sessionId,
    tool_name: input.tool_name,
    error: input.tool_response?.error,
    timestamp,
    success: false,
    duration_ms: durationMs,
    phase,
  };

  fs.appendFileSync(
    path.join(dataDir, `telemetry-${journeyId}.jsonl`),
    JSON.stringify(event) + "\n"
  );
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

main().catch(() => process.exit(0));
