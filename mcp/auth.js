const DEFAULT_API_URL = "https://api.useblazer.ai/v1";
const KEY_PREFIX = "sk-bzr_";

export class Auth {
  constructor(apiKey, apiUrl) {
    this.apiKey = apiKey || "";
    this.apiUrl = apiUrl || DEFAULT_API_URL;
    this._failed = false;
    this._failReason = "";
  }

  check() {
    if (!this.apiKey) {
      return {
        error: "auth_required",
        signup_url: "https://useblazer.ai/signup?ref=claude",
        message: "Blazer API key is not configured. Get a free key at https://useblazer.ai/keys, then open the plugin settings in Claude Code and paste it into the 'Blazer API Key' field (or re-run `/plugin install blazer` to be prompted)."
      };
    }

    if (!this.apiKey.startsWith(KEY_PREFIX)) {
      return {
        error: "auth_invalid_format",
        message: `API key must start with '${KEY_PREFIX}'. Check your key at useblazer.ai/keys`
      };
    }

    if (this._failed) {
      return {
        error: "auth_failed",
        message: this._failReason || "API key authentication failed. Check your key at useblazer.ai/keys and restart the session."
      };
    }

    return { ok: true };
  }

  setFailed(reason) {
    this._failed = true;
    this._failReason = reason;
  }

  headers() {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }
}
