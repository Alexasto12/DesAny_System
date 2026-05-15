export type LeadStatus = 'raw' | 'scraped' | 'enriched' | 'failed';
export type SiteStatus = 'content-ready' | 'deployed' | 'deploy-failed' | 'archived';
export type OutreachStatus = 'pending' | 'sent' | 'opened' | 'replied' | 'no-email';
export type JobStage = 'scrape' | 'enrich' | 'generate-content' | 'build-site' | 'send-outreach';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Lead {
  id: number;
  source: string;
  businessName: string;
  category: string;
  city: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  rawData: Record<string, unknown>;
  scrapedAt: Date;
  status: LeadStatus;
}

export interface LeadEnrichment {
  id: number;
  leadId: number;
  topReviews: Array<{ text: string; rating: number; author: string }>;
  servicesInferred: string[];
  colorPaletteSuggestion: { primary: string; secondary: string; accent: string };
  enrichedAt: Date;
}

export interface LandingContent {
  hero: {
    headline: string;
    subheadline: string;
  };
  services: Array<{
    name: string;
    description: string;
    icon?: string;
  }>;
  testimonials: Array<{
    text: string;
    author: string;
    rating: number;
  }>;
  about: string;
  cta: {
    text: string;
    action: 'phone' | 'email' | 'contact-form';
    target: string;
  };
  contact: {
    phone?: string;
    email?: string;
    address?: string;
    mapsEmbedUrl?: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  styleVariant: 'modern' | 'elegant' | 'bold';
}

export interface GeneratedSite {
  id: number;
  leadId: number;
  contentJson: LandingContent;
  templateVariant: string;
  localPath: string | null;
  vercelUrl: string | null;
  vercelProjectId: string | null;
  deployedAt: Date | null;
  status: SiteStatus;
}

export interface OutreachMessage {
  id: number;
  leadId: number;
  siteId: number;
  emailTo: string;
  subject: string;
  body: string;
  sentAt: Date | null;
  openedAt: Date | null;
  repliedAt: Date | null;
  status: OutreachStatus;
}

export interface PipelineJob {
  id: number;
  leadId: number;
  stage: JobStage;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Queue job payloads
export interface ScrapeJobPayload {
  category: string;
  city: string;
  limit: number;
}

export interface EnrichJobPayload {
  leadId: number;
}

export interface GenerateContentJobPayload {
  leadId: number;
}

export interface BuildSiteJobPayload {
  siteId: number;
}

export interface SendOutreachJobPayload {
  siteId: number;
}
