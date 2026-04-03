export function makeHandler(apiClient) {
  return async function handleAssessAlternatives(args) {
    return apiClient.get("/catalog/assess-alternatives", args);
  };
}
