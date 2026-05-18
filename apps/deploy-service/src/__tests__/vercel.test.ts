import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VercelApiError, VercelClient } from '../vercel.js';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('VercelClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('createProject posts to /v10/projects and returns id', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'prj_abc', name: 'desany-foo' }));
    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.createProject('desany-foo');

    expect(result).toEqual({ id: 'prj_abc' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/v10/projects');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer t');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'desany-foo', framework: null });
  });

  it('createProject appends teamId when set', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'prj_team' }));
    const client = new VercelClient({
      token: 't',
      teamId: 'team_123',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createProject('desany-bar');

    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('teamId=team_123');
  });

  it('createDeployment posts files as base64 and returns id+url', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 'dpl_xyz', url: 'desany-foo.vercel.app' }),
    );
    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const files = [
      { file: 'index.html', data: Buffer.from('<html>hi</html>') },
      { file: 'css/site.css', data: Buffer.from('body{}') },
    ];

    const result = await client.createDeployment('prj_abc', files);

    expect(result).toEqual({ id: 'dpl_xyz', url: 'desany-foo.vercel.app' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/v13/deployments');
    const payload = JSON.parse(init?.body as string);
    expect(payload.project).toBe('prj_abc');
    expect(payload.target).toBe('production');
    expect(payload.files).toHaveLength(2);
    expect(payload.files[0]).toEqual({
      file: 'index.html',
      data: Buffer.from('<html>hi</html>').toString('base64'),
      encoding: 'base64',
    });
  });

  it('retries on 429 with Retry-After delay', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'retry-after': '1', 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'prj_ok' }));

    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const promise = client.createProject('desany-foo');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ id: 'prj_ok' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to default delay when Retry-After is missing on 429', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 429, headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'prj_ok' }));

    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const promise = client.createProject('desany-foo');
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ id: 'prj_ok' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'prj_ok' }));

    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const promise = client.createProject('desany-foo');
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ id: 'prj_ok' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx (non-429) and throws VercelApiError', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'bad' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createProject('bad-name')).rejects.toBeInstanceOf(VercelApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('getDeployment returns readyState and url', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ readyState: 'READY', url: 'desany-foo.vercel.app' }),
    );
    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getDeployment('dpl_xyz');

    expect(result).toEqual({ readyState: 'READY', url: 'desany-foo.vercel.app' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain('/v13/deployments/dpl_xyz');
    expect(init?.method).toBe('GET');
  });

  it('getDeployment polls through BUILDING → READY', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ readyState: 'BUILDING', url: 'foo.vercel.app' }))
      .mockResolvedValueOnce(jsonResponse({ readyState: 'READY', url: 'foo.vercel.app' }));

    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const first = await client.getDeployment('dpl_xyz');
    expect(first.readyState).toBe('BUILDING');

    const second = await client.getDeployment('dpl_xyz');
    expect(second.readyState).toBe('READY');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts on persistent 429', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': '1', 'content-type': 'application/json' },
        }),
      );

    const client = new VercelClient({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });

    const promise = client.createProject('desany-foo');
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).rejects.toBeInstanceOf(VercelApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
