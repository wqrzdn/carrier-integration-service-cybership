export interface HttpClient {
  /* * Standard interface for our network calls. I've separated JSON posts from form posts
   * because carrier APIs are inconsistent-UPS auth needs form-encoding while their 
   * rating API needs JSON. By using this interface, the carrier logic doesn't have 
   * to care if we are using Axios, Fetch, or anything else under the hood.
   */
  post<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<T>;

  postForm<T>(
    url: string,
    params: Record<string, string>,
    headers?: Record<string, string>
  ): Promise<T>;
}