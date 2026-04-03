import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const PLUGIN_VERSION = pkg.version;
import { PluginData } from "./lib/plugin-data.js";
import { Auth } from "./auth.js";
import { ApiClient } from "./api-client.js";
import { makeHandler as makeExtractFingerprint } from "./tools/extract-stack-fingerprint.js";
import { makeHandler as makeSearchCatalog } from "./tools/search-catalog.js";
import { makeHandler as makeGetJourneyStatus } from "./tools/get-journey-status.js";
import { makeHandler as makeGetProductDetail } from "./tools/get-product-detail.js";
import { makeHandler as makeReportSessionContext } from "./tools/report-session-context.js";
import { makeHandler as makeBeginIntegration } from "./tools/begin-integration.js";
import { makeHandler as makeCompleteIntegration } from "./tools/complete-integration.js";
import { makeHandler as makeSubmitReview } from "./tools/submit-review.js";
import { makeHandler as makeAssessAlternatives } from "./tools/assess-alternatives.js";
import { makeHandler as makeBeginMigration } from "./tools/begin-migration.js";
import { makeHandler as makeCompleteMigration } from "./tools/complete-migration.js";

// Initialize singletons — PluginData requires CLAUDE_PLUGIN_DATA env var at runtime
let pluginData;
try {
  pluginData = new PluginData();
} catch {
  // Will be null if env var not set; tools that need it will handle this at call time
  pluginData = null;
}
const auth = new Auth(process.env.Blazer_API_KEY, process.env.Blazer_API_URL);
const apiClient = new ApiClient(auth, PLUGIN_VERSION);

// Tool names that do NOT require auth
const NO_AUTH_TOOLS = new Set(["extract_stack_fingerprint"]);

// Auth gate helper — returns null if OK, returns error content if not
function checkAuth(toolName) {
  if (NO_AUTH_TOOLS.has(toolName)) return null;
  const authResult = auth.check();
  if (authResult.error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(authResult),
        },
      ],
      isError: true,
    };
  }
  return null;
}

// Tool handlers
const toolHandlers = {
  extract_stack_fingerprint: makeExtractFingerprint(pluginData),
  search_catalog: makeSearchCatalog(apiClient),
  get_journey_status: makeGetJourneyStatus(apiClient, pluginData),
  get_product_detail: makeGetProductDetail(apiClient),
  report_session_context: makeReportSessionContext(apiClient),
  begin_integration: makeBeginIntegration(apiClient, pluginData),
  complete_integration: makeCompleteIntegration(apiClient, pluginData),
  submit_review: makeSubmitReview(apiClient),
  assess_alternatives: makeAssessAlternatives(apiClient),
  begin_migration: makeBeginMigration(apiClient, pluginData),
  complete_migration: makeCompleteMigration(apiClient, pluginData),
};

// Dispatch helper
async function dispatch(name, args) {
  const authError = checkAuth(name);
  if (authError) return authError;
  try {
    const result = await toolHandlers[name](args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "internal_error", message: err.message }) }], isError: true };
  }
}

// Create MCP server
const mcpServer = new McpServer(
  { name: "blazer-claude-plugin", version: PLUGIN_VERSION },
  { capabilities: { tools: {} } }
);

// 1. extract_stack_fingerprint
mcpServer.registerTool(
  "extract_stack_fingerprint",
  {
    description: "Analyze the current project directory and extract a stack fingerprint describing its technologies",
    inputSchema: {
      project_dir: z.string().describe("Absolute path to the project directory to analyze"),
      consent_confirmed: z.boolean().optional().describe("User has confirmed consent to analyze the project"),
    },
  },
  (args) => dispatch("extract_stack_fingerprint", args)
);

// 2. search_catalog
mcpServer.registerTool(
  "search_catalog",
  {
    description: "Search the Blazer catalog for SaaS products matching a category and optional stack/requirements",
    inputSchema: {
      category: z.string().describe("Product category to search (e.g. analytics, error-tracking)"),
      stack_fingerprint: z.record(z.any()).optional().describe("Stack fingerprint from extract_stack_fingerprint"),
      requirements: z.array(z.string()).optional().describe("Requirements to filter results"),
      max_results: z.number().int().optional().describe("Maximum number of results to return"),
    },
  },
  (args) => dispatch("search_catalog", args)
);

// 3. get_journey_status
mcpServer.registerTool(
  "get_journey_status",
  {
    description: "Get the current integration or migration journey status for a project",
    inputSchema: {
      project_hash: z.string().describe("SHA-256 hash identifying the project"),
      category: z.string().optional().describe("Filter journeys by category"),
    },
  },
  (args) => dispatch("get_journey_status", args)
);

// 4. begin_integration
mcpServer.registerTool(
  "begin_integration",
  {
    description: "Begin a new integration journey for a SaaS product",
    inputSchema: {
      product_id: z.string().describe("The product identifier from the Blazer catalog"),
      project_hash: z.string().describe("SHA-256 hash identifying the project"),
      category: z.string().describe("Product category"),
      stack_fingerprint: z.record(z.any()).optional().describe("Stack fingerprint for the project"),
      integration_goal: z.string().optional().describe("Description of what the integration should accomplish"),
      journey_id: z.string().optional().describe("Optional existing journey ID to resume"),
    },
  },
  (args) => dispatch("begin_integration", args)
);

// 5. complete_integration
mcpServer.registerTool(
  "complete_integration",
  {
    description: "Mark an integration journey as complete with an outcome",
    inputSchema: {
      journey_id: z.string().describe("The journey ID to complete"),
      outcome: z.enum(["success", "partial", "failed", "abandoned"]).describe("The outcome of the integration"),
      first_successful_call_at: z.string().optional().describe("ISO timestamp of the first successful API call"),
      notes: z.string().optional().describe("Optional notes about the integration outcome"),
    },
  },
  (args) => dispatch("complete_integration", args)
);

// 6. submit_review
mcpServer.registerTool(
  "submit_review",
  {
    description: "Submit a review and ratings for a completed integration journey",
    inputSchema: {
      journey_id: z.string().describe("The journey ID being reviewed"),
      ratings: z.record(z.any()).describe("Ratings object with numeric scores for various dimensions"),
      migration_ratings: z.record(z.any()).optional().describe("Ratings specific to migration aspects"),
      issues: z.array(z.record(z.any())).optional().describe("List of issues encountered during the journey"),
      would_recommend_for_stack: z.boolean().optional().describe("Whether the user would recommend this product for the current stack"),
      would_recommend_migration: z.boolean().optional().describe("Whether the user would recommend migrating to/from this product"),
    },
  },
  (args) => dispatch("submit_review", args)
);

// 7. get_product_detail
mcpServer.registerTool(
  "get_product_detail",
  {
    description: "Get detailed information about a specific product from the Blazer catalog",
    inputSchema: {
      product_id: z.string().describe("The product identifier from the Blazer catalog"),
      stack_fingerprint: z.record(z.any()).optional().describe("Stack fingerprint to get stack-specific guidance"),
    },
  },
  (args) => dispatch("get_product_detail", args)
);

// 8. report_session_context
mcpServer.registerTool(
  "report_session_context",
  {
    description: "Report context about the current Claude Code session for telemetry",
    inputSchema: {
      project_hash: z.string().describe("SHA-256 hash identifying the project"),
      claude_code_session_id: z.string().describe("The current Claude Code session identifier"),
      active_mcp_servers: z.array(z.string()).optional().describe("List of active MCP server names in this session"),
    },
  },
  (args) => dispatch("report_session_context", args)
);

// 9. assess_alternatives
mcpServer.registerTool(
  "assess_alternatives",
  {
    description: "Assess alternative products to a currently used product",
    inputSchema: {
      current_product_id: z.string().describe("The product identifier currently in use"),
      stack_fingerprint: z.record(z.any()).describe("Stack fingerprint for the project"),
      category: z.string().optional().describe("Product category to search alternatives in"),
      requirements: z.array(z.string()).optional().describe("Requirements for the alternative"),
      max_results: z.number().int().optional().describe("Maximum number of results to return"),
    },
  },
  (args) => dispatch("assess_alternatives", args)
);

// 10. begin_migration
mcpServer.registerTool(
  "begin_migration",
  {
    description: "Begin a migration journey from one product to another",
    inputSchema: {
      from_product_id: z.string().describe("The product identifier being migrated from"),
      to_product_id: z.string().describe("The product identifier being migrated to"),
      project_hash: z.string().describe("SHA-256 hash identifying the project"),
      category: z.string().describe("Product category"),
      stack_fingerprint: z.record(z.any()).optional().describe("Stack fingerprint for the project"),
      migration_plan: z.object({ parallel_run_planned: z.boolean().optional(), data_migration_needed: z.boolean().optional(), estimated_cutover_date: z.string().optional() }).optional().describe("Migration plan details"),
    },
  },
  (args) => dispatch("begin_migration", args)
);

// 11. complete_migration
mcpServer.registerTool(
  "complete_migration",
  {
    description: "Mark a migration journey as complete with an outcome",
    inputSchema: {
      journey_id: z.string().describe("The journey ID to complete"),
      outcome: z.enum(["success", "partial", "rolled-back", "abandoned"]).describe("The outcome of the migration"),
      old_product_removed: z.boolean().optional().describe("Whether the old product was fully removed"),
      data_migration_outcome: z.enum(["full", "partial", "skipped", "failed", "not-applicable"]).optional().describe("Outcome of any data migration"),
      parallel_run_duration_days: z.number().int().optional().describe("Number of days both products ran in parallel"),
      rollback_reason: z.string().optional().describe("Reason for rollback if outcome is rolled-back"),
      notes: z.string().optional().describe("Optional notes about the migration outcome"),
    },
  },
  (args) => dispatch("complete_migration", args)
);

// Expose the underlying Server for testing
const server = mcpServer.server;

// Start server when run directly
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

export { server, mcpServer, toolHandlers, pluginData, auth, apiClient };
