# Stack Fingerprint Schema v1

The stack fingerprint is a structured representation of a project's technology
choices. It is extracted from project files (package.json, Dockerfile, *.csproj,
terraform files, CI configs, etc.) and NEVER contains source code, credentials,
or business logic.

## Schema

```json
{
  "schema_version": "1",
  "project_hash": "sha256:a1b2c3...",
  "languages": [
    { "name": "csharp", "version": "12", "runtime": "dotnet-8.0" }
  ],
  "frameworks": [
    { "name": "aspnet-core", "version": "8.0" },
    { "name": "react", "version": "18.3" }
  ],
  "cloud": {
    "provider": "aws",
    "compute": ["ecs-fargate"],
    "regions": ["us-east-1"]
  },
  "iac": {
    "tool": "terraform",
    "version": "1.7"
  },
  "auth": {
    "provider": "auth0"
  },
  "databases": [
    { "type": "postgresql", "version": "16", "managed": true, "service": "rds" }
  ],
  "messaging": {
    "broker": "sqs",
    "patterns": ["async-event"]
  },
  "ci_cd": {
    "platform": "github-actions"
  },
  "existing_integrations": [
    { "product": "datadog", "category": "monitoring" },
    { "product": "stripe", "category": "payments" }
  ],
  "deployment_model": "saas",
  "architecture_hints": ["event-driven", "microservices", "vpc-isolated"]
}
```

## Project Hash

The `project_hash` is computed as:
1. If the project has a git remote: `SHA-256(git remote origin URL)`
2. If no git remote: `SHA-256(absolute path of project root)`

This hash is stable across sessions (same project = same hash) but is
non-reversible — the server cannot determine the project name, URL, or
path from the hash. It is used solely for journey correlation.

## Extraction Sources

| Dimension            | Files Inspected                                           |
| -------------------- | --------------------------------------------------------- |
| Languages/frameworks | package.json, *.csproj, Gemfile, go.mod, pyproject.toml   |
| Cloud/compute        | terraform/*.tf, cloudformation/*.yaml, Dockerfile, docker-compose |
| IaC                  | terraform/*.tf, .terraform.lock.hcl, pulumi.yaml          |
| Auth                 | SDK imports, config files, environment variable names      |
| Databases            | connection strings (host/type only), ORM configs, migrations |
| Messaging            | SDK imports, IaC resource definitions                      |
| CI/CD                | .github/workflows/, .gitlab-ci.yml, Jenkinsfile           |
| Existing integrations| SDK imports, config files, IaC resource definitions        |

## Privacy Boundary

The fingerprint extractor MUST NOT capture:
- Source code or business logic
- API keys, tokens, passwords, or connection string credentials
- File contents beyond metadata (e.g., reads package.json deps, not src/*.ts)
- User data, PII, or anything in .env files
- Git history, commit messages, or branch names
