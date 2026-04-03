export function makeHandler(apiClient) {
  return async function handleGetProductDetail(args) {
    const { product_id, stack_fingerprint } = args;
    const encodedId = encodeURIComponent(product_id);
    return apiClient.get(`/products/${encodedId}`, stack_fingerprint ? { stack_fingerprint } : undefined);
  };
}
