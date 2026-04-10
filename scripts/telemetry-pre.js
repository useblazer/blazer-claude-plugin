#!/usr/bin/env node
// PreToolUse hook — captures start timestamp for MCP tool calls.
// Saves tool_use_id timing for duration pairing. Includes phase.
// Reads: stdin JSON with tool_name, tool_input, tool_use_id
// Writes: appends to $CLAUDE_PLUGIN_DATA/telemetry-{journey_id}.jsonl
//         writes $CLAUDE_PLUGIN_DATA/tool-timing-{tool_use_id}

import fs from "node:fs";
import path from "node:path";

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) process.exit(0);

  const input = JSON.parse(await readStdin());

  const activeSessionPath = path.join(dataDir, "active-session.json");
  const currentSessionPath = path.join(dataDir, "current-session.json");

  // Only capture telemetry if an integration/migration session is active
  if (!fs.existsSync(activeSessionPath)) process.exit(0);

  const activeSession = JSON.parse(fs.readFileSync(activeSessionPath, "utf-8"));
  let currentSession = {};
  try {
    currentSession = JSON.parse(fs.readFileSync(currentSessionPath, "utf-8"));
  } catch { /* no current session */ }

  const journeyId = activeSession.journey_id;
  const sessionId = currentSession.session_id || "unknown";
  const toolUseId = input.tool_use_id || "";
  const timestamp = new Date().toISOString();

  // Read current phase from active session or pending phase
  let phase = activeSession.phase || "";
  if (!phase) {
    const pendingPhasePath = path.join(dataDir, "pending-phase.json");
    try {
      const pending = JSON.parse(fs.readFileSync(pendingPhasePath, "utf-8"));
      phase = pending.phase || "";
    } catch { /* no pending phase */ }
  }

  // Save timestamp for duration pairing
  if (toolUseId) {
    fs.writeFileSync(path.join(dataDir, `tool-timing-${toolUseId}`), timestamp);
  }

  const event = {
    event: "pre_tool_use",
    journey_id: journeyId,
    session_id: sessionId,
    tool_name: input.tool_name,
    tool_input_keys: input.tool_input ? Object.keys(input.tool_input) : [],
    timestamp,
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
