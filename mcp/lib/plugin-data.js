import fs from "node:fs";
import path from "node:path";

export class PluginData {
  constructor(dataDir) {
    this.dataDir = dataDir || process.env.CLAUDE_PLUGIN_DATA;
    if (!this.dataDir) {
      throw new Error("CLAUDE_PLUGIN_DATA environment variable is not set");
    }
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  readJson(filename) {
    const filePath = path.join(this.dataDir, filename);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  writeJson(filename, data) {
    const filePath = path.join(this.dataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  deleteFile(filename) {
    const filePath = path.join(this.dataDir, filename);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  readActiveSession() { return this.readJson("active-session.json"); }
  writeActiveSession(data) { this.writeJson("active-session.json", data); }
  clearActiveSession() { this.deleteFile("active-session.json"); }

  readProjectContext() { return this.readJson("project-context.json"); }
  writeProjectContext(data) { this.writeJson("project-context.json", data); }
}
