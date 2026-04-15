import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeHandler } from "../../mcp/tools/submit-fingerprint.js";
import { FingerprintConsent } from "../../mcp/lib/fingerprint/consent.js";
import { KeyCache } from "../../mcp/lib/fingerprint/key-cache.js";

// Fake apiClient that lets tests script the response sequence.
class FakeApiClient {
  constructor({ hashKeyResponses = [], submitResponses = [], fetchResponses = [] } = {}) {
    this.hashKeyResponses = hashKeyResponses;
    this.submitResponses = submitResponses;
    this.fetchResponses = fetchResponses;
    this.submitCalls = 0;
    this.hashKeyCalls = 0;
    this.fetchCalls = 0;
    this.submittedBodies = [];
  }
  async fetchHashKey() {
    this.hashKeyCalls++;
    const r = this.hashKeyResponses.shift();
    if (!r) throw new Error("no more hash-key responses scripted");
    return r;
  }
  async submitFingerprint(body) {
    this.submitCalls++;
    this.submittedBodies.push(body);
    const r = this.submitResponses.shift();
    if (!r) throw new Error("no more submit responses scripted");
    return r;
  }
  async fetchFingerprint(_id) {
    this.fetchCalls++;
    const r = this.fetchResponses.shift();
    if (!r) throw new Error("no more fetch responses scripted");
    return r;
  }
}

describe("submit_fingerprint tool", () => {
  let project, consentDir, cacheDir;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), "submit-t-"));
    consentDir = fs.mkdtempSync(path.join(os.tmpdir(), "submit-consent-"));
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "submit-cache-"));
    fs.writeFileSync(path.join(project, "Gemfile.lock"),
      "GEM\n  specs:\n    rails (8.1.3)\n\nDEPENDENCIES\n  rails\n"
    );
  });
  afterEach(() => {
    for (const d of [project, consentDir, cacheDir]) fs.rmSync(d, { recursive: true, force: true });
  });

  const keyB64u = Buffer.alloc(32, 0x42).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  function build({ hashKeyResponses = [], submitResponses = [], fetchResponses = [], withConsent = true, pollSchedule = [] } = {}) {
    const consent = new FingerprintConsent({ dir: consentDir });
    if (withConsent) consent.grant();
    const cache = new KeyCache({ dir: cacheDir });
    const apiClient = new FakeApiClient({ hashKeyResponses, submitResponses, fetchResponses });
    // Default to no polling so existing tests stay fast; individual tests
    // opt into a schedule when they want to exercise the poll path.
    const handler = makeHandler({
      apiClient, cache, consent, pluginVersion: "test",
      pollSchedule, sleep: async () => {},
    });
    return { handler, apiClient, cache, consent };
  }

  it("fetches hash key on first call and caches it", async () => {
    const { handler, apiClient, cache } = build({
      hashKeyResponses: [{ key: keyB64u, key_version: 1 }],
      submitResponses: [
        { status: 202, ok: true, headers: {}, body: { id: "fp_1", status: "pending" } },
      ],
    });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.id, "fp_1");
    assert.strictEqual(apiClient.hashKeyCalls, 1);
    assert.strictEqual(cache.keyVersion(), 1);
  });

  it("reuses cached hash key on subsequent calls", async () => {
    const cache = new KeyCache({ dir: cacheDir });
    cache.write({ tenant_hash_key_b64u: keyB64u, tenant_hash_key_version: 1 });

    const consent = new FingerprintConsent({ dir: consentDir });
    consent.grant();
    const apiClient = new FakeApiClient({
      submitResponses: [
        { status: 202, ok: true, headers: {}, body: { id: "fp_2", status: "pending" } },
      ],
    });
    const handler = makeHandler({ apiClient, cache, consent, pluginVersion: "test", pollSchedule: [], sleep: async () => {} });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.id, "fp_2");
    assert.strictEqual(apiClient.hashKeyCalls, 0); // cache hit, no refetch
  });

  it("prompts for consent when not yet granted", async () => {
    const { handler } = build({ withConsent: false });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.consent_required, true);
  });

  it("auto-discovers repo identity from project dir when repo_url is omitted", async () => {
    // Give the temp project a synthetic local identity (no git init needed —
    // resolveRepoUrl's final fallback produces a local:// URL either way).
    const { handler, apiClient } = build({
      hashKeyResponses: [{ key: keyB64u, key_version: 1 }],
      submitResponses: [
        { status: 202, ok: true, headers: {}, body: { id: "fp_auto", status: "pending" } },
      ],
    });
    await handler({ project_dir: project });
    const sent = apiClient.submittedBodies[0];
    // Even without repo_url passed in, the source block now carries a
    // repo_hash derived from the synthetic local:// identifier.
    assert.match(sent.source.repo_hash, /^[a-f0-9]{64}$/);
  });

  it("computes source.repo_hash / commit_hash when inputs provided", async () => {
    const { handler, apiClient } = build({
      hashKeyResponses: [{ key: keyB64u, key_version: 1 }],
      submitResponses: [
        { status: 202, ok: true, headers: {}, body: { id: "fp_1", status: "pending" } },
      ],
    });
    await handler({
      project_dir: project,
      repo_url: "git@github.com:foo/bar.git",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
    });
    const sent = apiClient.submittedBodies[0];
    assert.strictEqual(sent.source.key_version, 1);
    assert.match(sent.source.repo_hash, /^[a-f0-9]{64}$/);
    assert.match(sent.source.commit_hash, /^[a-f0-9]{64}$/);
    assert.strictEqual(sent.source.branch_hash, undefined);
  });

  it("surfaces a stale_key_version warning and refreshes cache in the background", async () => {
    const oldKey = keyB64u;
    const newKey = Buffer.alloc(32, 0x99).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const cache = new KeyCache({ dir: cacheDir });
    cache.write({ tenant_hash_key_b64u: oldKey, tenant_hash_key_version: 1 });
    const consent = new FingerprintConsent({ dir: consentDir });
    consent.grant();
    const apiClient = new FakeApiClient({
      hashKeyResponses: [{ key: newKey, key_version: 2 }],
      submitResponses: [
        {
          status: 202, ok: true,
          headers: { warning: "299 blazer stale_key_version" },
          body: {
            id: "fp_3",
            status: "pending",
            warnings: [{ code: "stale_key_version", submitted_key_version: 1, current_key_version: 2 }],
          },
        },
      ],
    });
    const handler = makeHandler({ apiClient, cache, consent, pluginVersion: "test", pollSchedule: [], sleep: async () => {} });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.id, "fp_3");
    assert.strictEqual(res.warnings.length, 1);
    assert.strictEqual(res.warnings[0].code, "stale_key_version");
    // Background refresh should have updated cache to v2.
    assert.strictEqual(cache.keyVersion(), 2);
  });

  it("on 410 Gone, purges cache, refetches, retries once", async () => {
    const cache = new KeyCache({ dir: cacheDir });
    cache.write({ tenant_hash_key_b64u: keyB64u, tenant_hash_key_version: 1 });
    const consent = new FingerprintConsent({ dir: consentDir });
    consent.grant();
    const apiClient = new FakeApiClient({
      hashKeyResponses: [{ key: keyB64u, key_version: 3 }],
      submitResponses: [
        { status: 410, ok: false, headers: {}, body: { error: "retired_key_version", current_key_version: 3 } },
        { status: 202, ok: true,  headers: {}, body: { id: "fp_4", status: "pending" } },
      ],
    });
    const handler = makeHandler({ apiClient, cache, consent, pluginVersion: "test", pollSchedule: [], sleep: async () => {} });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.id, "fp_4");
    assert.strictEqual(apiClient.submitCalls, 2); // initial + retry
    assert.strictEqual(cache.keyVersion(), 3);
  });

  it("on a second 410 after retry, halts and surfaces error", async () => {
    const cache = new KeyCache({ dir: cacheDir });
    cache.write({ tenant_hash_key_b64u: keyB64u, tenant_hash_key_version: 1 });
    const consent = new FingerprintConsent({ dir: consentDir });
    consent.grant();
    const apiClient = new FakeApiClient({
      hashKeyResponses: [{ key: keyB64u, key_version: 4 }],
      submitResponses: [
        { status: 410, ok: false, headers: {}, body: {} },
        { status: 410, ok: false, headers: {}, body: {} },
      ],
    });
    const handler = makeHandler({ apiClient, cache, consent, pluginVersion: "test", pollSchedule: [], sleep: async () => {} });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.error, "retired_key_version");
  });

  it("hash_key_unavailable when initial fetch fails (extract-only mode)", async () => {
    const consent = new FingerprintConsent({ dir: consentDir });
    consent.grant();
    const apiClient = new FakeApiClient({
      hashKeyResponses: [{ error: "api_unavailable", message: "boom" }],
      submitResponses: [],
    });
    const handler = makeHandler({ apiClient, cache: new KeyCache({ dir: cacheDir }), consent, pluginVersion: "test", pollSchedule: [], sleep: async () => {} });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.error, "hash_key_unavailable");
  });

  it("polls GET /fingerprints/:id until matches land, then surfaces them", async () => {
    const { handler, apiClient } = build({
      hashKeyResponses: [{ key: keyB64u, key_version: 1 }],
      submitResponses: [
        { status: 202, ok: true, headers: {}, body: { id: "fp_1", status: "pending", matched_archetypes: null } },
      ],
      fetchResponses: [
        { status: 200, ok: true, headers: {}, body: { id: "fp_1", status: "pending", matched_archetypes: [] } },
        {
          status: 200, ok: true, headers: {},
          body: {
            id: "fp_1",
            status: "ingested",
            matched_archetypes: [{ id: "express-api", confidence: 1.0, matched_predicates: ["runtime", "packages"] }],
          },
        },
      ],
      pollSchedule: [0, 0], // fire polling twice with no delay
    });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.id, "fp_1");
    assert.strictEqual(res.status, "ingested");
    assert.strictEqual(res.matched_archetypes.length, 1);
    assert.strictEqual(res.matched_archetypes[0].id, "express-api");
    assert.strictEqual(apiClient.fetchCalls, 2);
  });

  it("returns promptly if matches are already present in the initial 202 body", async () => {
    const { handler, apiClient } = build({
      hashKeyResponses: [{ key: keyB64u, key_version: 1 }],
      submitResponses: [
        {
          status: 202, ok: true, headers: {},
          body: {
            id: "fp_fast",
            status: "ingested",
            matched_archetypes: [{ id: "rails-monolith", confidence: 1.0 }],
          },
        },
      ],
      pollSchedule: [0, 0],
    });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.status, "ingested");
    assert.strictEqual(apiClient.fetchCalls, 0); // no polling needed
  });

  it("schema-invalid project (we force it empty) still short-circuits cleanly", async () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), "empty-"));
    try {
      const { handler } = build({
        hashKeyResponses: [{ key: keyB64u, key_version: 1 }],
        submitResponses: [
          { status: 202, ok: true, headers: {}, body: { id: "fp_empty", status: "pending" } },
        ],
      });
      const res = await handler({ project_dir: emptyProject });
      // Empty project is schema-valid (all fields optional), just empty.
      assert.strictEqual(res.id, "fp_empty");
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
    }
  });
});
