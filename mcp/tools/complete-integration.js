import { uploadSessionTelemetry } from "../lib/telemetry-upload.js";

export function makeHandler(apiClient, pluginData) {
  return async function handleCompleteIntegration(args) {
    // Save journey context before clearing so the PostToolUse hook can still
    // record the completion event (it fires AFTER this handler returns).
    if (pluginData) {
      const active = pluginData.readActiveSession();
      if (active) {
        pluginData.writeJson("last-completed-journey.json", active);
      }
    }

    const response = await apiClient.post("/journeys/complete", args);
    if (!response.error && pluginData) {
      // Upload telemetry now — don't wait for SessionEnd
      await uploadSessionTelemetry(apiClient, pluginData, args.journey_id).catch(() => {});
      pluginData.clearActiveSession();
    }
    return response;
  };
}
