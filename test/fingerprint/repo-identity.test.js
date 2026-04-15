import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveRepoUrl, resolveCommit, resolveBranch } from "../../mcp/lib/fingerprint/repo-identity.js";

function git(cwd, ...args) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: ["ignore", "pipe", "ignore"] });
}

describe("repo-identity", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-id-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("resolveRepoUrl returns the origin remote URL when set", () => {
    git(dir, "init", "-q");
    git(dir, "remote", "add", "origin", "git@github.com:foo/bar.git");
    assert.strictEqual(resolveRepoUrl(dir), "git@github.com:foo/bar.git");
  });

  it("resolveRepoUrl falls back to local:// synthetic when no remote", () => {
    git(dir, "init", "-q");
    const url = resolveRepoUrl(dir);
    assert.match(url, /^local:\/\//);
    assert.ok(url.endsWith(dir));
  });

  it("resolveRepoUrl falls back to local:// when the dir isn't a git repo at all", () => {
    const url = resolveRepoUrl(dir);
    assert.match(url, /^local:\/\//);
  });

  it("resolveCommit returns the 40-char HEAD SHA in a repo with commits", () => {
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "demo@example.com");
    git(dir, "config", "user.name", "Demo");
    fs.writeFileSync(path.join(dir, "file.txt"), "hi");
    git(dir, "add", "file.txt");
    git(dir, "commit", "-q", "-m", "first");
    const sha = resolveCommit(dir);
    assert.match(sha, /^[a-f0-9]{40}$/);
  });

  it("resolveCommit returns empty string when no commits yet", () => {
    git(dir, "init", "-q");
    assert.strictEqual(resolveCommit(dir), "");
  });

  it("resolveBranch returns the branch name, not 'HEAD'", () => {
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "d@x.com");
    git(dir, "config", "user.name", "D");
    fs.writeFileSync(path.join(dir, "f"), "x");
    git(dir, "add", "f");
    git(dir, "commit", "-q", "-m", "c");
    assert.strictEqual(resolveBranch(dir), "main");
  });
});
