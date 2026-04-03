export function makeHandler(apiClient) {
  return async function handleSearchCatalog(args) {
    const { category, stack_fingerprint, requirements, max_results } = args;
    return apiClient.get("/catalog/search", { category, stack_fingerprint, requirements, max_results });
  };
}
