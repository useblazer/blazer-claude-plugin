// Closes the loop on a greenfield selection. The agent calls this with
// outcome="confirmed" once it has written the recommended guidance to
// the project (CLAUDE.md or the editor-equivalent), or outcome="rejected"
// if the user declined the pick.
//
// Server-side this drives ArchetypeSelection lifecycle and powers the
// admin dashboard's "what % of recommendations were confirmed" metric.
export function makeHandler(apiClient) {
  return async function handleRecordArchetypeOutcome(args) {
    const { selection_id, outcome } = args;
    if (!selection_id) {
      return { error: "validation_error", message: "selection_id is required" };
    }
    if (!["confirmed", "rejected"].includes(outcome)) {
      return { error: "validation_error", message: "outcome must be 'confirmed' or 'rejected'" };
    }
    return apiClient.post(
      `/archetype_selections/${encodeURIComponent(selection_id)}/outcome`,
      { outcome }
    );
  };
}
