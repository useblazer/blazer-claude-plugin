// submit_fingerprint — runs extract, attaches a hashed `source` block
// using the cached tenant hash key, and POSTs to /api/v1/fingerprints.
//
// Handles the three key-lifecycle response paths (spec §6.2 / §7.4):
//   - 202 success → return body.
//   - 202 + stale_key_version warning → refetch key, overwrite cache,
//     surface the warning. Do NOT resubmit (server accepted the payload).
//   - 410 Gone → purge cache, refetch, retry ONCE under the new key.
//
// If hash-key fetch fails at any point we return a structured error
// rather than silently drop the submission.

import { buildFingerprintBody } from "../lib/fingerprint/pipeline.js";
import { FingerprintConsent, CONSENT_TEXT } from "../lib/fingerprint/consent.js";
import { KeyCache } from "../lib/fingerprint/key-cache.js";
import { buildSource } from "../lib/fingerprint/hasher.js";
import { resolveRepoUrl, resolveCommit } from "../lib/fingerprint/repo-identity.js";

async function ensureHashKey(apiClient, cache) {
  const cached = cache.read();
  if (cached) return { key: cache.keyBytes(), keyVersion: cached.tenant_hash_key_version };

  const fetched = await apiClient.fetchHashKey();
  if (fetched.error) return { error: fetched };

  cache.write({
    tenant_hash_key_b64u: fetched.key,
    tenant_hash_key_version: fetched.key_version,
  });
  return { key: cache.keyBytes(), keyVersion: fetched.key_version };
}

async function refreshHashKey(apiClient, cache) {
  const fetched = await apiClient.fetchHashKey();
  if (fetched.error) return { error: fetched };
  cache.write({
    tenant_hash_key_b64u: fetched.key,
    tenant_hash_key_version: fetched.key_version,
  });
  return { key: cache.keyBytes(), keyVersion: fetched.key_version };
}

// Poll GET /fingerprints/:id with exponential backoff until the server
// flips status off "pending" (ingested or failed) or until the cap.
// Returns the most recently observed body — never throws.
//
// Default schedule: 250ms, 500ms, 1s, 2s, 4s, 2s — total ~10s, matching
// the max described in spec §7.1.
const DEFAULT_POLL_SCHEDULE_MS = [250, 500, 1000, 2000, 4000, 2000];

async function pollForMatches(apiClient, id, initialBody, schedule = DEFAULT_POLL_SCHEDULE_MS, sleep = defaultSleep) {
  if (!id) return initialBody || {};
  let last = initialBody || {};
  if (last.status && last.status !== "pending") return last;

  for (const delayMs of schedule) {
    await sleep(delayMs);
    const resp = await apiClient.fetchFingerprint(id);
    if (resp?.body) last = resp.body;
    if (last.status && last.status !== "pending") return last;
  }
  return last;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeHandler({
  apiClient,
  cache    = new KeyCache(),
  consent  = new FingerprintConsent(),
  pluginVersion = "unknown",
  pollSchedule  = DEFAULT_POLL_SCHEDULE_MS,
  sleep         = defaultSleep,
} = {}) {
  return async function handleSubmitFingerprint(args = {}) {
    const { project_dir, repo_url, commit, branch: branchName, consent_confirmed } = args;

    if (!consent.hasConsent() && !consent_confirmed) {
      return {
        consent_required: true,
        message: CONSENT_TEXT +
          "\n\nConfirm consent by calling submit_fingerprint again with consent_confirmed: true.",
      };
    }
    if (consent_confirmed && !consent.hasConsent()) consent.grant();

    // Auto-discover repo identity from the project dir when the caller
    // didn't pass explicit values. This keeps the demo (and any project
    // without a manually-provided URL) working: we use the git remote if
    // present, and fall back to a stable synthetic local:// URL otherwise.
    const effectiveRepoUrl = repo_url || resolveRepoUrl(project_dir);
    const effectiveCommit  = commit   || resolveCommit(project_dir) || null;

    const { body: extractedBody, validationErrors } = buildFingerprintBody(project_dir);
    if (validationErrors.length > 0) {
      return { error: "schema_validation_failed", errors: validationErrors };
    }

    const ensured = await ensureHashKey(apiClient, cache);
    if (ensured.error) {
      return {
        error: "hash_key_unavailable",
        message: "Could not fetch the tenant hash key — submit is disabled until this is resolved. Use extract_fingerprint for offline inspection.",
        cause: ensured.error,
      };
    }

    let submittedBody = null;
    const doSubmit = (key, keyVersion) => {
      const source = buildSource({
        key,
        keyVersion,
        repoUrl: effectiveRepoUrl,
        commit: effectiveCommit,
        branchName,
        detector: "blazer-claude-plugin",
        detectorVersion: pluginVersion,
      });
      submittedBody = { ...extractedBody, source };
      return apiClient.submitFingerprint(submittedBody);
    };

    let response = await doSubmit(ensured.key, ensured.keyVersion);

    if (response.status === 410) {
      // Past-grace key: purge + refetch + retry once.
      cache.clear();
      const refreshed = await refreshHashKey(apiClient, cache);
      if (refreshed.error) {
        return {
          error: "hash_key_unavailable",
          message: "Server rejected the old key (410 Gone) and refetch failed. Try again later.",
          cause: refreshed.error,
        };
      }
      response = await doSubmit(refreshed.key, refreshed.keyVersion);
      if (response.status === 410) {
        return {
          error: "retired_key_version",
          message: "Re-fetched the current hash key and the server still rejected it. Halting further submissions this session.",
        };
      }
    }

    if (response.status === 202 || response.status === 200) {
      const warnings = Array.isArray(response.body?.warnings) ? response.body.warnings : [];
      const staleWarning = warnings.find((w) => w.code === "stale_key_version");
      if (staleWarning) {
        // Submission succeeded. Quietly refresh the cache so the next
        // submission uses the current version.
        await refreshHashKey(apiClient, cache).catch(() => null);
      }

      const enriched = await pollForMatches(apiClient, response.body?.id, response.body, pollSchedule, sleep);
      return {
        id: enriched.id,
        status: enriched.status,
        matched_archetypes: enriched.matched_archetypes ?? null,
        facets_summary: enriched.facets_summary,
        status_url: response.body?.status_url,
        warnings,
        // Echo the submitted body so downstream tools (catalog search,
        // assess_alternatives, begin_integration) can pass it as the
        // stack_fingerprint parameter without re-extracting.
        body: submittedBody,
      };
    }

    return {
      error: response.body?.error || "api_error",
      status: response.status,
      message: response.body?.message || "Unexpected response from /fingerprints",
      body: response.body,
    };
  };
}
