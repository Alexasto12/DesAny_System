// Test-only stub for @desany/db so tests can run without the package being built.
// Real production code resolves @desany/db via the workspace's pnpm symlink + dist.
// Individual tests override these exports with vi.mock(...) as needed.

export const db = {} as unknown as Record<string, unknown>;
export const outreachMessages = {
  sentAt: { name: 'sent_at' },
  status: { name: 'status' },
  id: { name: 'id' },
  openedAt: { name: 'opened_at' },
  leadId: { name: 'lead_id' },
  siteId: { name: 'site_id' },
  emailTo: { name: 'email_to' },
  subject: { name: 'subject' },
  body: { name: 'body' },
} as const;
export const leads = {} as const;
export const generatedSites = {} as const;
