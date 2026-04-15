// extract_fingerprint — runs the local pipeline and returns the
// schema-conformant body WITHOUT submitting to Blazer. Useful for
// inspection, debugging, or offline use. Does not require the tenant
// hash key (no hashing happens here — that's a submit_fingerprint step).

import { buildFingerprintBody } from "../lib/fingerprint/pipeline.js";
import { FingerprintConsent, CONSENT_TEXT } from "../lib/fingerprint/consent.js";

export function makeHandler({ consent = new FingerprintConsent() } = {}) {
  return async function handleExtractFingerprint(args = {}) {
    const { project_dir, consent_confirmed } = args;

    if (!consent.hasConsent() && !consent_confirmed) {
      return {
        consent_required: true,
        message: CONSENT_TEXT +
          "\n\nConfirm consent by calling extract_fingerprint again with consent_confirmed: true.",
      };
    }

    if (consent_confirmed && !consent.hasConsent()) {
      consent.grant();
    }

    const { body, validationErrors, matchedRules } = buildFingerprintBody(project_dir);
    return {
      body,
      schema_validation_errors: validationErrors,
      matched_rules: matchedRules.length,
      note: "This tool does not submit to Blazer. Use submit_fingerprint to upload and get archetype matches.",
    };
  };
}
