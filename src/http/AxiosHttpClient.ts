import axios, { AxiosError } from 'axios';
import { HttpClient } from './HttpClient';
import { HttpError } from './HttpError';

/*
 * This is a thin wrapper around Axios that implements our HttpClient interface. 
 * I’ve added a 'normalize' helper here to catch raw Axios errors and turn them into 
 * our own HttpError type. This is important because if we ever swap Axios for Fetch 
 * or another library, we won't have to change the error handling logic in our 
 * carrier classes-they only ever see our custom error format.
 */ 
export class AxiosHttpClient implements HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number
  ) {}

  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    try {
      const response = await axios.post<T>(`${this.baseUrl}${path}`, body, {
        headers,
        timeout: this.timeoutMs,
      });
      return response.data;
    } catch (err) {
      throw this.normalize(err);
    }
  }

  async postForm<T>(path: string, params: Record<string, string>, headers?: Record<string, string>): Promise<T> {
    try {
      const response = await axios.post<T>(
        `${this.baseUrl}${path}`,
        new URLSearchParams(params).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...headers,
          },
          timeout: this.timeoutMs,
        }
      );
      return response.data;
    } catch (err) {
      throw this.normalize(err);
    }
  }

  private normalize(err: unknown): HttpError | Error {
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError;
      
      if (!axiosErr.response) {
        const networkError = new Error(`Network error: ${axiosErr.message}`);
        (networkError as any).cause = err;
        return networkError;
      }
      
      return new HttpError(axiosErr.response.status, axiosErr.response.data, err);
    }
    
    return err instanceof Error ? err : new Error(String(err));
  }
}