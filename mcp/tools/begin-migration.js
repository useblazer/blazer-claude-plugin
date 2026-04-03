export function makeHandler(apiClient, pluginData) {
  return async function handleBeginMigration(args) {
    const response = await apiClient.post("/migrations/begin", args);
    if (!response.error && pluginData) {
      pluginData.writeActiveSession({
        journey_id: response.journey_id,
        session_id: response.session_id,
        product_id: response.to_product_id,
      });
    }
    return response;
  };
}
