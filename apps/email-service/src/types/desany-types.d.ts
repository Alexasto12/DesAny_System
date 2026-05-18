// Local type shim for @desany/types.
// Re-exports the subset used by this service from the workspace source. The
// real package, once built, exports the same names from dist/.

declare module '@desany/types' {
  export type {
    Lead,
    GeneratedSite,
    OutreachMessage,
    OutreachStatus,
    SendOutreachJobPayload,
  } from '../../../../packages/types/src/index.js';
}
