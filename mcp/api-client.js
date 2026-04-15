export class ApiClient {
  constructor(auth, pluginVersion) {
    this.auth = auth;
    this.pluginVersion = pluginVersion;
    this._fetch = globalThis.fetch;
  }

  url(path) {
    return `${this.auth.apiUrl}${path}`;
  }

  buildBody(data) {
    return { ...data, plugin_version: this.pluginVersion };
  }

  async post(path, data) {
    return this._request("POST", path, data);
  }

  async get(path, params) {
    const url = new URL(this.url(path));
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : v);
      }
      url.searchParams.set("plugin_version", this.pluginVersion);
    }
    return this._request("GET", url.toString());
  }

  async _request(method, urlOrPath, data) {
    const fullUrl = urlOrPath.startsWith("http") ? urlOrPath : this.url(urlOrPath);
    const opts = {
      method,
      headers: this.auth.headers()
    };
    if (method === "POST" && data !== undefined) {
      opts.body = JSON.stringify(this.buildBody(data));
    }

    let response;
    try {
      response = await this._fetch(fullUrl, opts);
    } catch (err) {
      return {
        error: "api_unavailable",
        message: `Blazer API is unreachable: ${err.message}. Telemetry will be buffered locally and uploaded when connectivity is restored.`
      };
    }

    if (response.status === 401) {
      this.auth.setFailed("API key authentication failed (401)");
      return {
        error: "auth_failed",
        message: "API key authentication failed. Check your key at userblazer.ai/keys and restart the session."
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown error");
      return {
        error: "api_error",
        status: response.status,
        message: text
      };
    }

    try {
      return await response.json();
    } catch {
      return { error: "api_error", message: "Invalid JSON response from API" };
    }
  }

  // --- Fingerprint endpoints (see docs/fingerprint/implementation-spec.md §6) ---

  // Returns the raw response envelope — status, headers, body — so the
  // fingerprint submit flow can branch on 202+warnings / 400 / 410.
  //
  // Unlike the standard _request, this path does NOT merge plugin_version
  // into the JSON body — the fingerprint schema is strict
  // (additionalProperties: false) and would reject the unexpected key.
  // plugin_version travels as a query string instead so the existing
  // check_plugin_version middleware still sees it.
  async _rawRequest(method, urlOrPath, data) {
    const base = urlOrPath.startsWith("http") ? urlOrPath : this.url(urlOrPath);
    const sep = base.includes("?") ? "&" : "?";
    const fullUrl = `${base}${sep}plugin_version=${encodeURIComponent(this.pluginVersion)}`;
    const opts = { method, headers: this.auth.headers() };
    if (method === "POST" && data !== undefined) opts.body = JSON.stringify(data);
    let response;
    try { response = await this._fetch(fullUrl, opts); }
    catch (err) { return { error: "api_unavailable", message: err.message, status: 0, headers: {}, body: null }; }
    const headers = {};
    if (response.headers?.forEach) response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body = null;
    try { body = await response.json(); } catch { /* leave null */ }
    return { status: response.status, ok: response.ok, headers, body };
  }

  async fetchHashKey() {
    return this.get("/tenants/current/hash_key");
  }

  async submitFingerprint(body) {
    return this._rawRequest("POST", "/fingerprints", body);
  }

  async fetchFingerprint(id) {
    return this._rawRequest("GET", `/fingerprints/${encodeURIComponent(id)}`);
  }
}
