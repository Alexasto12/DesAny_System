import type { Logger } from 'pino';
import { retry } from './retry.js';

const VERCEL_BASE_URL = 'https://api.vercel.com';

export interface VercelProject {
  id: string;
}

export interface VercelDeployment {
  id: string;
  url: string;
}

export interface VercelDeploymentStatus {
  readyState: string;
  url: string;
}

export interface VercelFile {
  file: string;
  data: Buffer;
}

export interface VercelClientOptions {
  token: string;
  teamId?: string;
  baseUrl?: string;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

export class VercelApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly url: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}

export class VercelClient {
  private readonly token: string;
  private readonly teamId: string | undefined;
  private readonly baseUrl: string;
  private readonly logger: Logger | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VercelClientOptions) {
    this.token = options.token;
    this.teamId = options.teamId;
    this.baseUrl = options.baseUrl ?? VERCEL_BASE_URL;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createProject(name: string): Promise<VercelProject> {
    const body = JSON.stringify({ name, framework: null });
    const res = await this.request<{ id: string }>('POST', '/v10/projects', body);
    return { id: res.id };
  }

  async createDeployment(projectId: string, files: VercelFile[]): Promise<VercelDeployment> {
    const payload = {
      name: projectId,
      project: projectId,
      target: 'production',
      files: files.map((f) => ({
        file: f.file,
        data: f.data.toString('base64'),
        encoding: 'base64',
      })),
    };
    const res = await this.request<{ id: string; url: string }>(
      'POST',
      '/v13/deployments',
      JSON.stringify(payload),
    );
    return { id: res.id, url: res.url };
  }

  async getDeployment(deploymentId: string): Promise<VercelDeploymentStatus> {
    const res = await this.request<{ readyState: string; url: string }>(
      'GET',
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
    return { readyState: res.readyState, url: res.url };
  }

  private buildUrl(path: string): string {
    const url = new URL(path, this.baseUrl);
    if (this.teamId) {
      url.searchParams.set('teamId', this.teamId);
    }
    return url.toString();
  }

  private async request<T>(method: string, path: string, body?: string): Promise<T> {
    const url = this.buildUrl(path);

    return retry(
      async () => {
        const start = Date.now();
        const res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body,
        });
        const latency = Date.now() - start;

        this.logger?.info(
          { method, url, status: res.status, latencyMs: latency },
          'vercel api call',
        );

        if (res.status === 429) {
          const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
          throw new VercelApiError(
            'Vercel rate limited',
            429,
            await safeBody(res),
            url,
            retryAfterMs,
          );
        }

        if (!res.ok) {
          throw new VercelApiError(
            `Vercel ${method} ${path} failed: ${res.status}`,
            res.status,
            await safeBody(res),
            url,
          );
        }

        return (await res.json()) as T;
      },
      {
        attempts: 3,
        baseMs: 2000,
        shouldRetry: (err) => {
          if (err instanceof VercelApiError) {
            return err.status === 429 || err.status >= 500;
          }
          return true;
        },
        delayFor: (err) => {
          if (err instanceof VercelApiError && err.status === 429 && err.retryAfterMs) {
            return err.retryAfterMs;
          }
          return undefined;
        },
        onRetry: (err, attempt, delayMs) => {
          this.logger?.warn(
            {
              method,
              url,
              attempt,
              delayMs,
              err: err instanceof Error ? err.message : String(err),
            },
            'retrying vercel request',
          );
        },
      },
    );
  }
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 2000;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 500);
  return 2000;
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}
