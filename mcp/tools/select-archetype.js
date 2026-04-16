// Submits the agent's collected answers to the greenfield recommender.
// Returns the picked archetype, alternatives, the architecture guidance
// markdown to write into the project, and a `selection_id` the agent
// passes to record_archetype_outcome once it has written the file.
export function makeHandler(apiClient) {
  return async function handleSelectArchetype(args) {
    const { answers, schema_version } = args;
    return apiClient.post("/greenfield/recommend", { answers, schema_version });
  };
}
