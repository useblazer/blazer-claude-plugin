import fs from "node:fs";
import path from "node:path";

const CONSENT_PATH = ".claude/blazer-consent.json";
const GITIGNORE_ENTRY = ".claude/blazer-consent.json";

export class ConsentManager {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.consentFile = path.join(projectDir, CONSENT_PATH);
  }

  hasConsent() {
    return fs.existsSync(this.consentFile);
  }

  grant() {
    fs.mkdirSync(path.dirname(this.consentFile), { recursive: true });
    fs.writeFileSync(this.consentFile, JSON.stringify({
      granted_at: new Date().toISOString(),
      scope: "stack_fingerprint"
    }, null, 2));
    this._ensureGitignore();
  }

  _ensureGitignore() {
    const gitignorePath = path.join(this.projectDir, ".gitignore");
    let content = "";
    try { content = fs.readFileSync(gitignorePath, "utf-8"); } catch { /* new file */ }
    if (!content.includes(GITIGNORE_ENTRY)) {
      const newline = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      fs.writeFileSync(gitignorePath, content + newline + GITIGNORE_ENTRY + "\n");
    }
  }
}
