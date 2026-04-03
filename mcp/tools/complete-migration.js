export function makeHandler(apiClient, pluginData) {
  return async function handleCompleteMigration(args) {
    const response = await apiClient.post("/migrations/complete", args);
    if (!response.error && pluginData) {
      pluginData.clearActiveSession();
    }
    return response;
  };
}
