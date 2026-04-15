// Convenience wrapper that pairs canonicalization with hashing using a
// cached tenant hash key. The key itself comes from the Blazer API
// (GET /api/v1/tenants/current/hash_key) — see ADR 0001.

import { repoUrl, commitSha, branch, hmacHex } from "./canonical.js";

/**
 * Build the `source` block of a fingerprint submission using the tenant's
 * hash key. `key` is raw 32 bytes (Buffer/Uint8Array). Callers decode the
 * base64url wire format before passing in.
 *
 * Omitting `repoUrl`, `commit`, or `branchName` is allowed (fields are
 * optional per fingerprint.schema.json).
 */
export function buildSource({ key, keyVersion, repoUrl: rawRepoUrl, commit, branchName, detector, detectorVersion }) {
  const source = {
    hash_algorithm: "hmac-sha256",
    key_version: keyVersion,
  };

  if (rawRepoUrl) source.repo_hash   = hmacHex(key, repoUrl(rawRepoUrl));
  if (commit)     source.commit_hash = hmacHex(key, commitSha(commit));
  if (branchName) source.branch_hash = hmacHex(key, branch(branchName));

  if (detector)        source.detector         = detector;
  if (detectorVersion) source.detector_version = detectorVersion;

  return source;
}
