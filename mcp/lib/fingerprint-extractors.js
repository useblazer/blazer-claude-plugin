import fs from "node:fs";
import path from "node:path";

const KNOWN_SDKS = {
  "@sentry/node": ["sentry", "error-tracking"],
  "@sentry/browser": ["sentry", "error-tracking"],
  "stripe": ["stripe", "payments"],
  "@auth0/nextjs-auth0": ["auth0", "auth"],
  "auth0": ["auth0", "auth"],
  "@datadog/browser-rum": ["datadog", "monitoring"],
  "dd-trace": ["datadog", "monitoring"],
  "mixpanel": ["mixpanel", "product-analytics"],
  "posthog-node": ["posthog", "product-analytics"],
  "@segment/analytics-node": ["segment", "product-analytics"],
  "newrelic": ["newrelic", "monitoring"],
  "twilio": ["twilio", "communications"],
  "@sendgrid/mail": ["sendgrid", "email"],
  "resend": ["resend", "email"],
  "algolia": ["algolia", "search"],
  "@elastic/elasticsearch": ["elasticsearch", "search"],
  "launchdarkly-node-server-sdk": ["launchdarkly", "feature-flags"],
};

const KNOWN_FRAMEWORKS = {
  "express": "express",
  "fastify": "fastify",
  "next": "nextjs",
  "react": "react",
  "vue": "vue",
  "@angular/core": "angular",
  "svelte": "svelte",
  "@nestjs/core": "nestjs",
};

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function globFiles(dir, pattern, maxDepth = 5, maxFiles = 1000) {
  // Simple recursive file finder matching by extension or name
  const results = [];
  function walk(current, depth) {
    if (depth > maxDepth || results.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          walk(fullPath, depth + 1);
        }
      } else if (pattern(entry.name, fullPath)) {
        results.push(fullPath);
      }
    }
  }
  walk(dir, 0);
  return results;
}

function extractFromPackageJson(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  const pkg = readJsonFile(pkgPath);
  if (!pkg) return { languages: [], frameworks: [], existing_integrations: [] };

  const languages = [{ name: "javascript" }];

  // Check for TypeScript in devDependencies or dependencies
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (allDeps["typescript"]) {
    languages.push({ name: "typescript" });
  }

  const frameworks = [];
  const seenFrameworks = new Set();
  for (const [dep] of Object.entries(allDeps)) {
    if (KNOWN_FRAMEWORKS[dep] && !seenFrameworks.has(KNOWN_FRAMEWORKS[dep])) {
      frameworks.push({ name: KNOWN_FRAMEWORKS[dep] });
      seenFrameworks.add(KNOWN_FRAMEWORKS[dep]);
    }
  }

  const existing_integrations = [];
  const seenProducts = new Set();
  let authProvider = null;
  for (const [dep] of Object.entries(allDeps)) {
    if (KNOWN_SDKS[dep]) {
      const [product, category] = KNOWN_SDKS[dep];
      if (!seenProducts.has(product)) {
        existing_integrations.push({ product, category, package: dep });
        seenProducts.add(product);
      }
      if (category === "auth" && !authProvider) {
        authProvider = product;
      }
    }
  }

  return { languages, frameworks, existing_integrations, authProvider };
}

function extractFromTerraform(projectDir) {
  const tfFiles = globFiles(projectDir, (name) => name.endsWith(".tf"));

  const cloud = { provider: null, compute: [], regions: [] };
  const databases = [];
  const messaging = { broker: null, patterns: [] };

  for (const filePath of tfFiles) {
    const content = readTextFile(filePath);
    if (!content) continue;

    // Detect cloud provider
    if (!cloud.provider) {
      if (content.includes('provider "aws"') || content.includes("provider \"aws\"")) {
        cloud.provider = "aws";
      } else if (content.includes('provider "google"') || content.includes('provider "azurerm"')) {
        cloud.provider = content.includes('provider "google"') ? "gcp" : "azure";
      }
    }

    // Detect regions
    const regionMatches = content.matchAll(/region\s*=\s*"([^"]+)"/g);
    for (const match of regionMatches) {
      const region = match[1];
      if (!cloud.regions.includes(region)) {
        cloud.regions.push(region);
      }
    }

    // Detect compute resources
    const computePatterns = [
      { pattern: /resource\s+"aws_ecs/, name: "ecs" },
      { pattern: /resource\s+"aws_lambda/, name: "lambda" },
      { pattern: /resource\s+"aws_eks/, name: "eks" },
      { pattern: /resource\s+"aws_instance/, name: "ec2" },
      { pattern: /resource\s+"google_container_cluster/, name: "gke" },
      { pattern: /resource\s+"google_cloud_run/, name: "cloud-run" },
      { pattern: /resource\s+"azurerm_kubernetes_cluster/, name: "aks" },
    ];
    for (const { pattern, name } of computePatterns) {
      if (pattern.test(content) && !cloud.compute.includes(name)) {
        cloud.compute.push(name);
      }
    }

    // Detect databases from terraform resources
    const dbPatterns = [
      { pattern: /resource\s+"aws_db_instance[^"]*"[^{]*\{[^}]*engine\s*=\s*"postgres/s, type: "postgresql" },
      { pattern: /resource\s+"aws_db_instance[^"]*"[^{]*\{[^}]*engine\s*=\s*"mysql/s, type: "mysql" },
      { pattern: /resource\s+"aws_dynamodb_table/, type: "dynamodb" },
      { pattern: /resource\s+"aws_elasticache/, type: "redis" },
      { pattern: /resource\s+"google_sql_database_instance/, type: "cloud-sql" },
      { pattern: /resource\s+"azurerm_postgresql_server/, type: "postgresql" },
    ];
    for (const { pattern, type } of dbPatterns) {
      if (pattern.test(content) && !databases.some(d => d.type === type)) {
        databases.push({ type });
      }
    }

    // Detect messaging broker
    const msgPatterns = [
      { pattern: /resource\s+"aws_sqs_queue/, broker: "sqs" },
      { pattern: /resource\s+"aws_sns_topic/, broker: "sns" },
      { pattern: /resource\s+"google_pubsub_topic/, broker: "pubsub" },
    ];
    for (const { pattern, broker } of msgPatterns) {
      if (pattern.test(content) && !messaging.broker) {
        messaging.broker = broker;
      }
    }
  }

  return { cloud, databases, messaging };
}

function extractCiCd(projectDir) {
  // GitHub Actions
  const ghWorkflows = path.join(projectDir, ".github", "workflows");
  try {
    const files = fs.readdirSync(ghWorkflows);
    if (files.some(f => f.endsWith(".yml") || f.endsWith(".yaml"))) {
      return { platform: "github-actions" };
    }
  } catch { /* not found */ }

  // GitLab CI
  if (fs.existsSync(path.join(projectDir, ".gitlab-ci.yml"))) {
    return { platform: "gitlab-ci" };
  }

  // Jenkins
  if (fs.existsSync(path.join(projectDir, "Jenkinsfile"))) {
    return { platform: "jenkins" };
  }

  return { platform: null };
}

function extractDeploymentModel(projectDir) {
  if (fs.existsSync(path.join(projectDir, "Dockerfile"))) {
    return "container";
  }
  if (fs.existsSync(path.join(projectDir, "serverless.yml")) || fs.existsSync(path.join(projectDir, "serverless.yaml"))) {
    return "serverless";
  }
  return null;
}

export async function extractFingerprint(projectDir) {
  const { languages, frameworks, existing_integrations, authProvider } = extractFromPackageJson(projectDir);
  const { cloud, databases, messaging } = extractFromTerraform(projectDir);
  const ci_cd = extractCiCd(projectDir);
  const deployment_model = extractDeploymentModel(projectDir);

  return {
    schema_version: "1",
    languages,
    frameworks,
    cloud,
    iac: detectIac(projectDir),
    auth: { provider: authProvider ?? null },
    databases,
    messaging,
    ci_cd,
    existing_integrations,
    deployment_model,
    architecture_hints: [],
  };
}

function detectIac(projectDir) {
  const tfFiles = globFiles(projectDir, (name) => name.endsWith(".tf"));
  if (tfFiles.length > 0) return { tool: "terraform", version: null };

  if (fs.existsSync(path.join(projectDir, "cdk.json"))) return { tool: "cdk", version: null };
  if (fs.existsSync(path.join(projectDir, "pulumi.yaml"))) return { tool: "pulumi", version: null };

  return { tool: null, version: null };
}
