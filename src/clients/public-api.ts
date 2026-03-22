import axios, { type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { Agent as HttpsAgent } from 'https';
import type { AuthConfig } from '../auth/client.js';

const httpsAgent = new HttpsAgent({ keepAlive: true });

const instances = new WeakMap<AuthConfig, AxiosInstance>();

export function publicClient(config: AuthConfig): AxiosInstance {
  const existing = instances.get(config);
  if (existing) return existing;

  const client = axios.create({
    baseURL: process.env.FIGMA_PUBLIC_BASE_URL || 'https://api.figma.com',
    httpsAgent,
    headers: {
      'X-Figma-Token': config.pat || '',
      'Accept': 'application/json',
    },
    timeout: 30000,
  });

  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount, error) => {
      const retryAfter = error.response?.headers?.['retry-after'];
      if (retryAfter) {
        const delay = parseInt(retryAfter, 10) * 1000;
        if (delay > 0 && delay < 300000) return delay;
      }
      // Exponential backoff with jitter: 1s, 2s, 4s + random jitter
      const base = Math.pow(2, retryCount - 1) * 1000;
      const jitter = base * 0.5 * Math.random();
      return base + jitter;
    },
    retryCondition: (error) => {
      const status = error.response?.status;
      if (status === 401 || status === 403) return false;
      if (status === 429) {
        const method = error.config?.method?.toUpperCase();
        return ['GET', 'HEAD', 'OPTIONS'].includes(method || '');
      }
      return axiosRetry.isNetworkOrIdempotentRequestError(error);
    },
  });

  instances.set(config, client);
  return client;
}
