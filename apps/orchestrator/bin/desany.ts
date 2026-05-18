#!/usr/bin/env node
import { Command } from 'commander';

const DEFAULT_API = process.env.DESANY_API_URL ?? 'http://localhost:3000';

interface HttpError {
  status: number;
  body: unknown;
}

async function apiFetch(
  apiBase: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const url = `${apiBase.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err: HttpError = { status: res.status, body };
    throw err;
  }
  return body;
}

function printJSON(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function handleError(err: unknown): never {
  const httpErr = err as HttpError;
  if (httpErr && typeof httpErr === 'object' && 'status' in httpErr) {
    process.stderr.write(
      `HTTP ${httpErr.status}: ${JSON.stringify(httpErr.body)}\n`,
    );
    process.exit(2);
  }
  const e = err as Error;
  process.stderr.write(`Error: ${e?.message ?? String(err)}\n`);
  process.exit(1);
}

const program = new Command();

program
  .name('desany')
  .description('DesAny orchestrator CLI — talks to the HTTP API.')
  .option('--api <url>', 'orchestrator base URL', DEFAULT_API)
  .version('0.1.0');

const campaign = program.command('campaign').description('Manage campaigns');

campaign
  .command('create')
  .description('Create a campaign and enqueue the scrape job')
  .requiredOption('--category <c>', 'business category, e.g. "hair salons"')
  .requiredOption('--city <c>', 'city to scrape, e.g. "Los Angeles"')
  .option('--limit <n>', 'maximum number of leads', '50')
  .action(async (opts) => {
    const apiBase = program.opts().api as string;
    try {
      const result = await apiFetch(apiBase, '/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          category: opts.category,
          city: opts.city,
          limit: Number.parseInt(opts.limit, 10),
        }),
      });
      printJSON(result);
    } catch (err) {
      handleError(err);
    }
  });

campaign
  .command('status <id>')
  .description('Show campaign aggregate status')
  .action(async (id: string) => {
    const apiBase = program.opts().api as string;
    try {
      const result = await apiFetch(apiBase, `/campaigns/${encodeURIComponent(id)}`);
      printJSON(result);
    } catch (err) {
      handleError(err);
    }
  });

const leadsCmd = program.command('leads').description('Inspect leads');

leadsCmd
  .command('list')
  .description('List leads')
  .option('--status <s>', 'filter by lead status')
  .option('--limit <n>', 'page size', '50')
  .option('--offset <n>', 'offset', '0')
  .action(async (opts) => {
    const apiBase = program.opts().api as string;
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.limit) params.set('limit', opts.limit);
    if (opts.offset) params.set('offset', opts.offset);
    const qs = params.toString();
    try {
      const result = await apiFetch(apiBase, `/leads${qs ? `?${qs}` : ''}`);
      printJSON(result);
    } catch (err) {
      handleError(err);
    }
  });

leadsCmd
  .command('show <leadId>')
  .description('Show full lead detail')
  .action(async (leadId: string) => {
    const apiBase = program.opts().api as string;
    try {
      const result = await apiFetch(apiBase, `/leads/${encodeURIComponent(leadId)}`);
      printJSON(result);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('retry <leadId>')
  .description('Re-enqueue a failed lead from its current failed stage')
  .action(async (leadId: string) => {
    const apiBase = program.opts().api as string;
    try {
      const result = await apiFetch(
        apiBase,
        `/leads/${encodeURIComponent(leadId)}/retry`,
        { method: 'POST' },
      );
      printJSON(result);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('queues')
  .description('Show queue depths')
  .action(async () => {
    const apiBase = program.opts().api as string;
    try {
      const m = (await apiFetch(apiBase, '/metrics')) as { queueDepths: unknown };
      printJSON(m.queueDepths);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('metrics')
  .description('Show full metrics JSON')
  .action(async () => {
    const apiBase = program.opts().api as string;
    try {
      const result = await apiFetch(apiBase, '/metrics');
      printJSON(result);
    } catch (err) {
      handleError(err);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => handleError(err));
