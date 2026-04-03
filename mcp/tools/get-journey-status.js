export function makeHandler(apiClient, pluginData) {
  return async function handleGetJourneyStatus(args) {
    let { project_hash, category } = args;

    if (!project_hash && pluginData) {
      const ctx = pluginData.readProjectContext();
      project_hash = ctx && ctx.project_hash;
    }

    if (!project_hash) {
      return { error: "missing_project_hash", message: "project_hash is required but was not provided and could not be read from project context." };
    }

    return apiClient.get("/journeys/status", { project_hash, category });
  };
}
