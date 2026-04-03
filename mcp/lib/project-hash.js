import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

export async function computeProjectHash(projectDir) {
  let source;
  try {
    source = execSync("git remote get-url origin", { cwd: projectDir, encoding: "utf-8" }).trim();
  } catch {
    source = projectDir;
  }
  const hash = createHash("sha256").update(source).digest("hex");
  return `sha256:${hash}`;
}
