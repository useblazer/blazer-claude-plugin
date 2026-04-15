// pip extractor — reads requirements.txt (and requirements-*.txt files)
// plus the [project.dependencies] / [tool.poetry.dependencies] tables of
// pyproject.toml. Purls: pkg:pypi/<name>@<version>.
//
// We do NOT do full TOML parsing here — we scan for the two common
// dependency sections and extract name/version pairs with a simple
// line-level regex. This is good enough for the archetype matcher's
// needs; fully-generic pyproject parsing is a follow-up.

import fs from "node:fs";
import path from "node:path";

function readText(p) {
  try { return fs.readFileSync(p, "utf-8"); } catch { return null; }
}

function purl(name, version) {
  const normalized = name.toLowerCase().replace(/[_.]+/g, "-");
  return version ? `pkg:pypi/${normalized}@${version}` : `pkg:pypi/${normalized}`;
}

function parseRequirements(contents) {
  const results = [];
  for (const raw of contents.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    // Strip inline comments, environment markers, extras.
    line = line.split("#")[0].trim();
    line = line.split(";")[0].trim();
    line = line.replace(/\[[^\]]+\]/, "");
    // name[==|~=|>=|<=|!=]version
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:(==|~=|>=|<=|!=|>|<)\s*(\S+))?/);
    if (!m) continue;
    const name = m[1];
    const version = m[2] === "==" ? m[3] : null; // only pin on exact equality
    results.push({ name, version });
  }
  return results;
}

function parsePyprojectDependencies(contents) {
  const results = [];
  // PEP 621 list form: [project].dependencies = [ "foo==1.0", ... ]
  const peptMatch = contents.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (peptMatch) {
    const block = peptMatch[1];
    for (const s of block.matchAll(/"([^"]+)"|'([^']+)'/g)) {
      const entry = s[1] || s[2];
      const m = entry.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(==\s*(\S+))?/);
      if (m) results.push({ name: m[1], version: m[2] ? m[3] : null });
    }
  }

  // Poetry form: [tool.poetry.dependencies] table with name = "version" or name = {version="..."}
  let inPoetry = false;
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === "[tool.poetry.dependencies]") { inPoetry = true; continue; }
    if (!inPoetry) continue;
    if (/^\s*\[/.test(line)) break; // next table
    const m = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*"([^"]+)"/);
    if (m) {
      const name = m[1];
      if (name === "python") continue;
      const raw = m[2];
      const versionMatch = raw.match(/(\d+(?:\.\d+){0,2}(?:-[A-Za-z0-9.-]+)?)/);
      results.push({ name, version: versionMatch ? versionMatch[1] : null });
    }
  }
  return results;
}

export function extract(projectDir) {
  const packages = [];
  const evidence = [];

  const reqPath = path.join(projectDir, "requirements.txt");
  const reqText = readText(reqPath);
  if (reqText) {
    for (const { name, version } of parseRequirements(reqText)) {
      packages.push({
        purl: purl(name, version),
        scope: "runtime",
        direct: true,
        manifest: path.relative(projectDir, reqPath) || "requirements.txt",
        confidence: version ? 1.0 : 0.7,
      });
    }
    evidence.push({
      type: "manifest",
      source: path.relative(projectDir, reqPath) || "requirements.txt",
      matched: "requirements.txt",
      supports: ["package_manager", "runtime"],
    });
  }

  const pyprojectPath = path.join(projectDir, "pyproject.toml");
  const pyprojectText = readText(pyprojectPath);
  if (pyprojectText) {
    for (const { name, version } of parsePyprojectDependencies(pyprojectText)) {
      packages.push({
        purl: purl(name, version),
        scope: "runtime",
        direct: true,
        manifest: path.relative(projectDir, pyprojectPath) || "pyproject.toml",
        confidence: version ? 0.95 : 0.7, // slightly lower; we're not doing full TOML parse
      });
    }
    evidence.push({
      type: "manifest",
      source: path.relative(projectDir, pyprojectPath) || "pyproject.toml",
      matched: "pyproject.toml",
      supports: ["package_manager", "runtime"],
    });
  }

  return { packages, evidence };
}
