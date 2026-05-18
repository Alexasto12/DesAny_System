// Local type shim for @desany/db.
// Until the package's dist/ is produced, this re-exports the schema tables
// directly from the workspace source (real drizzle Column types) and declares
// the runtime `db` object as a drizzle PgDatabase. At runtime the import is
// resolved by pnpm via node_modules/@desany/db → packages/db.

declare module '@desany/db' {
  export {
    leads,
    leadEnrichments,
    generatedSites,
    outreachMessages,
    pipelineJobs,
    type Lead,
    type LeadEnrichment,
    type GeneratedSite,
    type OutreachMessage,
    type PipelineJob,
  } from '../../../../packages/db/src/schema.js';

  import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
  import type * as schema from '../../../../packages/db/src/schema.js';
  export const db: NodePgDatabase<typeof schema>;
}
