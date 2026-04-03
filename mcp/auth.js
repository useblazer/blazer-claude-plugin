const DEFAULT_API_URL = "https://api.userblazer.ai/v1";
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
        signup_url: "https://userblazer.ai/signup?ref=claude",
        message: "Blazer API key is not configured. Sign up at userblazer.ai and run: claude plugin config blazer Blazer_API_KEY <your-key>"
      };
    }

    if (!this.apiKey.startsWith(KEY_PREFIX)) {
      return {
        error: "auth_invalid_format",
        message: `API key must start with '${KEY_PREFIX}'. Check your key at userblazer.ai/keys`
      };
    }

    if (this._failed) {
      return {
        error: "auth_failed",
        message: this._failReason || "API key authentication failed. Check your key at userblazer.ai/keys and restart the session."
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
