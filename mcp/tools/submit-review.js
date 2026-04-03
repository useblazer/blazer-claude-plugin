export function makeHandler(apiClient) {
  return async function handleSubmitReview(args) {
    return apiClient.post("/reviews", args);
  };
}
