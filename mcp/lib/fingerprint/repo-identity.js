// Discover repo identity (URL + commit SHA + branch) from a project
// directory using `git` directly, so tool callers don't have to pass them.
//
// Falls back to a stable, project-scoped synthetic identifier when the
// directory isn't a git repo or has no remote — the HMAC identifier still
// correlates the same project across submissions for the same tenant, even
// without a real URL.

import { execFileSync } from "node:child_process";
import os from "node:os";

function safeGit(projectDir, args) {
  try {
    return execFileSync("git", ["-C", projectDir, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// Returns a string suitable for passing to Canonical.repoUrl().
// Priority:
//   1. `git remote get-url origin` (exact git plumbing, handles both forms)
//   2. `git config --get remote.origin.url` (fallback for older git)
//   3. Synthetic `local://<hostname>/<absolute-path>` — stable per project
//      but explicitly flagged as synthetic (the scheme is non-https, so the
//      repo_hash won't accidentally collide with a real remote).
export function resolveRepoUrl(projectDir) {
  const direct = safeGit(projectDir, ["remote", "get-url", "origin"]);
  if (direct) return direct;
  const legacy = safeGit(projectDir, ["config", "--get", "remote.origin.url"]);
  if (legacy) return legacy;

  // No git remote — synthesize a local identifier. Hostname keeps it
  // somewhat machine-unique; absolute path keeps it stable across runs
  // on the same machine. Tenant-keyed HMAC still prevents cross-tenant
  // correlation.
  const hostname = os.hostname() || "local";
  return `local://${hostname}${projectDir}`;
}

// Returns the full 40-char commit SHA or "" if unavailable.
export function resolveCommit(projectDir) {
  const sha = safeGit(projectDir, ["rev-parse", "HEAD"]);
  return /^[a-f0-9]{40}$/i.test(sha) ? sha : "";
}

// Returns the current branch name or "" if detached/unavailable.
// We do NOT submit branch_hash by default — see spec §7.2. Callers that
// explicitly want branch correlation can pass the returned value into
// submit_fingerprint's `branch` arg.
export function resolveBranch(projectDir) {
  const branch = safeGit(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return branch && branch !== "HEAD" ? branch : "";
}
