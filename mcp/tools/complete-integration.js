export function makeHandler(apiClient, pluginData) {
  return async function handleCompleteIntegration(args) {
    const response = await apiClient.post("/journeys/complete", args);
    if (!response.error && pluginData) {
      pluginData.clearActiveSession();
    }
    return response;
  };
}
