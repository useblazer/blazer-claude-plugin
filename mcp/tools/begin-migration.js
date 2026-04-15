export function makeHandler(apiClient, pluginData) {
  return async function handleBeginMigration(args) {
    const response = await apiClient.post("/migrations/begin", args);
    if (!response.error && pluginData) {
      pluginData.writeActiveSession({
        journey_id: response.journey_id,
        session_id: response.session_id,
        product_id: response.to_product_id,
        // Telemetry hooks read active-session.phase to stamp each event.
        // Without this, every migration-phase tool call fires with phase=""
        // and the session summary stores phase: nil → "UNKNOWN" in the UI.
        phase: "MIGRATION",
      });
      pluginData.deleteFile("pending-phase.json");
    }
    return response;
  };
}
