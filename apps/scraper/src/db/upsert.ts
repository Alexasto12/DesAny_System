import { db, leads } from '@desany/db';
import { and, eq } from 'drizzle-orm';

export interface LeadUpsertInput {
  source: string;
  businessName: string;
  category: string;
  city: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  rawData: Record<string, unknown>;
  status?: string;
}

export interface LeadUpsertResult {
  id: number;
  created: boolean;
}

export async function upsertLead(
  input: LeadUpsertInput,
): Promise<LeadUpsertResult> {
  const status = input.status ?? 'scraped';

  const existing = await db
    .select({ id: leads.id, phone: leads.phone, website: leads.website, email: leads.email })
    .from(leads)
    .where(
      and(
        eq(leads.businessName, input.businessName),
        eq(leads.city, input.city),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    await db
      .update(leads)
      .set({
        source: input.source,
        category: input.category,
        phone: input.phone ?? row.phone,
        website: input.website ?? row.website,
        email: input.email ?? row.email,
        rawData: input.rawData,
        scrapedAt: new Date(),
        status,
      })
      .where(eq(leads.id, row.id));
    return { id: row.id, created: false };
  }

  const inserted = await db
    .insert(leads)
    .values({
      source: input.source,
      businessName: input.businessName,
      category: input.category,
      city: input.city,
      phone: input.phone,
      website: input.website,
      email: input.email,
      rawData: input.rawData,
      status,
    })
    .returning({ id: leads.id });

  return { id: inserted[0]!.id, created: true };
}

export async function markLeadFailed(
  businessName: string,
  city: string,
): Promise<void> {
  await db
    .update(leads)
    .set({ status: 'failed' })
    .where(and(eq(leads.businessName, businessName), eq(leads.city, city)));
}
