export function makeHandler(apiClient) {
  return async function handleReportSessionContext(args) {
    const { project_hash, active_mcp_servers, claude_code_session_id } = args;
    return apiClient.post("/sessions/register", { project_hash, active_mcp_servers, claude_code_session_id });
  };
}
