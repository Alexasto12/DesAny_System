import { pgTable, serial, text, varchar, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
import { type InferSelectModel } from 'drizzle-orm';

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  source: varchar('source', { length: 50 }).notNull(),
  businessName: varchar('business_name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  website: varchar('website', { length: 255 }),
  email: varchar('email', { length: 255 }),
  rawData: jsonb('raw_data').default({}),
  scrapedAt: timestamp('scraped_at').defaultNow(),
  status: varchar('status', { length: 50 }).default('raw'),
});

export const leadEnrichments = pgTable('lead_enrichments', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id),
  topReviews: jsonb('top_reviews').default([]),
  servicesInferred: jsonb('services_inferred').default([]),
  colorPaletteSuggestion: jsonb('color_palette_suggestion').default({}),
  enrichedAt: timestamp('enriched_at').defaultNow(),
});

export const generatedSites = pgTable('generated_sites', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id),
  contentJson: jsonb('content_json').notNull(),
  templateVariant: varchar('template_variant', { length: 50 }).default('modern'),
  localPath: text('local_path'),
  vercelUrl: varchar('vercel_url', { length: 255 }),
  vercelProjectId: varchar('vercel_project_id', { length: 100 }),
  deployedAt: timestamp('deployed_at'),
  status: varchar('status', { length: 50 }).default('content-ready'),
});

export const outreachMessages = pgTable('outreach_messages', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id),
  siteId: integer('site_id').references(() => generatedSites.id),
  emailTo: varchar('email_to', { length: 255 }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  sentAt: timestamp('sent_at'),
  openedAt: timestamp('opened_at'),
  repliedAt: timestamp('replied_at'),
  status: varchar('status', { length: 50 }).default('pending'),
});

export const pipelineJobs = pgTable('pipeline_jobs', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').references(() => leads.id),
  stage: varchar('stage', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  attempts: integer('attempts').default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Lead = InferSelectModel<typeof leads>;
export type LeadEnrichment = InferSelectModel<typeof leadEnrichments>;
export type GeneratedSite = InferSelectModel<typeof generatedSites>;
export type OutreachMessage = InferSelectModel<typeof outreachMessages>;
export type PipelineJob = InferSelectModel<typeof pipelineJobs>;
