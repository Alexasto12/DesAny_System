CREATE TABLE IF NOT EXISTS "generated_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"content_json" jsonb NOT NULL,
	"template_variant" varchar(50) DEFAULT 'modern',
	"local_path" text,
	"vercel_url" varchar(255),
	"vercel_project_id" varchar(100),
	"deployed_at" timestamp,
	"status" varchar(50) DEFAULT 'content-ready'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_enrichments" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"top_reviews" jsonb DEFAULT '[]'::jsonb,
	"services_inferred" jsonb DEFAULT '[]'::jsonb,
	"color_palette_suggestion" jsonb DEFAULT '{}'::jsonb,
	"enriched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" varchar(50) NOT NULL,
	"business_name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"city" varchar(100) NOT NULL,
	"phone" varchar(20),
	"website" varchar(255),
	"email" varchar(255),
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"scraped_at" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'raw'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"site_id" integer,
	"email_to" varchar(255) NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"replied_at" timestamp,
	"status" varchar(50) DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"stage" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_enrichments" ADD CONSTRAINT "lead_enrichments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_site_id_generated_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."generated_sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
