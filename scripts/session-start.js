#!/usr/bin/env node
// SessionStart hook — registers session with Blazer API for journey correlation.
// Reads: stdin JSON with session_id, cwd
// Writes: $CLAUDE_PLUGIN_DATA/current-session.json (for other hooks)
// Calls: POST /sessions/register (only if consent granted and API key present)

import fs from "node:fs";
import path from "node:path";
import { computeProjectHash } from "../mcp/lib/project-hash.js";

async function main() {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) process.exit(0);

  const input = JSON.parse(await readStdin());
  const sessionId = input.session_id;
  const cwd = input.cwd;

  fs.mkdirSync(dataDir, { recursive: true });

  // Check for cached project context from a previous extract_stack_fingerprint call
  const projectContextPath = path.join(dataDir, "project-context.json");
  let projectHash;
  try {
    const cached = JSON.parse(fs.readFileSync(projectContextPath, "utf-8"));
    projectHash = cached.project_hash;
  } catch {
    projectHash = await computeProjectHash(cwd);
    fs.writeFileSync(projectContextPath, JSON.stringify({ project_hash: projectHash }));
  }

  // Write session info for other hooks to read
  const model = input.model || "unknown";
  const transcriptPath = input.transcript_path || "";

  const sessionData = {
    session_id: sessionId,
    project_hash: projectHash,
    started_at: new Date().toISOString(),
    model,
    transcript_path: transcriptPath,
  };
  fs.writeFileSync(path.join(dataDir, "current-session.json"), JSON.stringify(sessionData, null, 2));

  // Only report to API if consent granted and API key present
  const consentFile = path.join(cwd, ".claude", "blazer-consent.json");
  if (!fs.existsSync(consentFile)) process.exit(0);

  const apiKey = process.env.Blazer_API_KEY;
  if (!apiKey) process.exit(0);

  const apiUrl = process.env.Blazer_API_URL || "https://api.userblazer.ai/v1";

  // Fire-and-forget API call
  try {
    await fetch(`${apiUrl}/sessions/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_hash: projectHash,
        claude_code_session_id: sessionId,
      }),
    });
  } catch {
    // Ignore — fire-and-forget
  }
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
