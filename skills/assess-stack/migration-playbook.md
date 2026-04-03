# Migration Playbook

Reference patterns for migrating from one SaaS product to another within
an agentic workflow.

## Migration Phases

### Phase 1: Preparation
- Review the new product's SDK and API surface
- Identify all usage points of the old product in the codebase
  (imports, API calls, configuration, environment variables)
- Plan the data migration strategy (if applicable)
- Determine if a parallel run is needed or if a direct cutover is safe

### Phase 2: Integration
- Install the new product's SDK alongside the old one
- Implement the new product's integration mirroring existing functionality
- DO NOT remove the old product yet
- Configure environment variables for the new product
- Add the new product to IaC if applicable

### Phase 3: Parallel Run (when applicable)
- Both products are active simultaneously
- Verify functional equivalence:
  - Analytics: compare event counts, user tracking
  - Monitoring: compare alert coverage, metric accuracy
  - Auth: verify login flows work identically
  - Error tracking: compare error capture rates
- Duration depends on confidence level needed (typically 1-7 days)

### Phase 4: Data Migration (when applicable)
Not all migrations involve data migration. Assess whether:
- Historical data needs to be preserved
- The new product supports data import from the old one
- A custom migration script is needed
- Data can be migrated incrementally or requires a one-time batch

### Phase 5: Cutover
- Route all traffic/calls to the new product
- Disable (but do not yet remove) the old product's integration
- Monitor for regressions

### Phase 6: Cleanup
- Remove the old product's SDK and dependencies
- Remove old configuration and environment variables
- Update IaC to remove old product resources
- Update documentation and runbooks

## Migration Complexity Factors

| Factor                    | Low Complexity        | High Complexity           |
| ------------------------- | --------------------- | ------------------------- |
| SDK replacement           | Drop-in compatible    | Completely different API   |
| Data migration            | Not needed            | Large historical dataset   |
| Configuration             | Env vars only         | Complex multi-service config |
| Parallel run              | Not needed            | Required for compliance    |
| Rollback plan             | Simple revert         | Data already migrated      |
| Team impact               | Automated migration   | Dashboard/workflow changes |
| Downstream dependencies   | None                  | Other services depend on it |

## Rollback Strategy

Always have a rollback plan before beginning cutover:
1. Keep old product credentials and configuration until migration is verified
2. If using IaC, keep old resources in a disabled state
3. For data migrations, ensure the old product retains its data during the transition period
4. Document the rollback steps before beginning cutover
