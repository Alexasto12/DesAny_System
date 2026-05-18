import { db, pipelineJobs } from '@desany/db';
import { eq } from 'drizzle-orm';

const MAX_ERROR_LENGTH = 4000;

export async function startPipelineJob(
  stage: string,
  leadId?: number,
): Promise<number> {
  const inserted = await db
    .insert(pipelineJobs)
    .values({
      stage,
      status: 'running',
      attempts: 1,
      leadId: leadId ?? null,
    })
    .returning({ id: pipelineJobs.id });
  return inserted[0]!.id;
}

export async function completePipelineJob(id: number): Promise<void> {
  await db
    .update(pipelineJobs)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(pipelineJobs.id, id));
}

export async function failPipelineJob(id: number, error: string): Promise<void> {
  await db
    .update(pipelineJobs)
    .set({
      status: 'failed',
      lastError: error.slice(0, MAX_ERROR_LENGTH),
      updatedAt: new Date(),
    })
    .where(eq(pipelineJobs.id, id));
}
