export function makeHandler(apiClient, pluginData) {
  return async function handleAssessAlternatives(args) {
    if (pluginData) {
      const active = pluginData.readActiveSession();
      if (!active || !active.journey_id) {
        pluginData.writeJson("pending-phase.json", { phase: "ASSESSMENT" });
      } else {
        pluginData.updateActiveSessionPhase("ASSESSMENT");
      }
    }

    return apiClient.get("/catalog/assess-alternatives", args);
  };
}
