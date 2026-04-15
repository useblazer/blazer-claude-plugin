import { extractFingerprint } from "../lib/fingerprint-extractors.js";
import { computeProjectHash } from "../lib/project-hash.js";
import { ConsentManager } from "../lib/consent.js";

// DEPRECATED in favor of extract_fingerprint + submit_fingerprint (spec §7.1).
// Scheduled for removal in plugin v0.5. Emits a one-shot deprecation notice
// per process so repeat calls don't spam the user.
let deprecationNoticeEmitted = false;
const DEPRECATION_NOTICE = {
  code: "tool_deprecated",
  message: "extract_stack_fingerprint is deprecated. Use extract_fingerprint (local only) " +
    "or submit_fingerprint (upload + archetype matches). Scheduled for removal in plugin v0.5.",
  replacement: ["extract_fingerprint", "submit_fingerprint"],
};

export function makeHandler(pluginData) {
  return async function handleExtractStackFingerprint(args) {
    const { project_dir, consent_confirmed } = args;
    const consent = new ConsentManager(project_dir);

    if (!consent.hasConsent() && !consent_confirmed) {
      return {
        consent_required: true,
        message: "Blazer needs to analyze your project's technology stack to provide relevant recommendations. " +
          "The fingerprint contains ONLY technology choices (languages, frameworks, cloud provider, etc.) — " +
          "never source code, credentials, or business logic. " +
          "Please confirm by calling this tool again with consent_confirmed: true."
      };
    }

    if (consent_confirmed && !consent.hasConsent()) {
      consent.grant();
    }

    const [fingerprint, projectHash] = await Promise.all([
      extractFingerprint(project_dir),
      computeProjectHash(project_dir)
    ]);

    fingerprint.project_hash = projectHash;

    if (pluginData) {
      pluginData.writeProjectContext({ project_hash: projectHash, fingerprint });
    }

    const notice = deprecationNoticeEmitted ? undefined : DEPRECATION_NOTICE;
    if (notice) deprecationNoticeEmitted = true;
    return notice ? { ...fingerprint, deprecation: notice } : fingerprint;
  };
}

// For tests.
export function _resetDeprecationNotice() { deprecationNoticeEmitted = false; }
