export function makeHandler(apiClient, pluginData) {
  return async function handleSearchCatalog(args) {
    const { category, stack_fingerprint, requirements, max_results } = args;

    // Set EVALUATION phase if no active journey exists
    if (pluginData) {
      const active = pluginData.readActiveSession();
      if (!active || !active.journey_id) {
        pluginData.writeJson("pending-phase.json", { phase: "EVALUATION" });
      }
    }

    return apiClient.get("/catalog/search", { category, stack_fingerprint, requirements, max_results });
  };
}
