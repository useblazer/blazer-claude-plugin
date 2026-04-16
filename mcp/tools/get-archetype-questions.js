// Fetches the greenfield-recommender schema (questions + accepted answer
// values + schema_version) so the agent can ask the user verbatim and
// then map each answer to one of the allowed `value` strings.
//
// The schema lives entirely on the server. Plugin is a thin wrapper —
// when we want to tune questions or add new ones, we ship a YAML edit,
// not a plugin release.
export function makeHandler(apiClient) {
  return async function handleGetArchetypeQuestions() {
    return apiClient.get("/greenfield/schema");
  };
}
