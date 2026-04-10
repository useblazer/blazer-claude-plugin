export function makeHandler(apiClient) {
  return async function handleRespondToAd(args) {
    const { ad_id, user_message } = args;
    return apiClient.post("/ads/respond", { ad_id, user_message });
  };
}
