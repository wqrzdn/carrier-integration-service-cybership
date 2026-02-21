export interface HttpClient {
  /* * standard interface for our network calls. i separated json posts from form posts
   * because carrier apis are inconsistent. ups auth needs form encoding while their 
   * rating api needs json. by using this interface the carrier logic does not 
   * have to care if we are using axios fetch or anything else under the hood.
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