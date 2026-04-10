export function makeHandler(apiClient, pluginData) {
  return async function handleBeginIntegration(args) {
    const response = await apiClient.post("/journeys/begin", args);
    if (!response.error && pluginData) {
      pluginData.writeActiveSession({
        journey_id: response.journey_id,
        session_id: response.session_id,
        product_id: response.product_id,
        phase: "INTEGRATION",
      });
      pluginData.deleteFile("pending-phase.json");
    }
    return response;
  };
}
