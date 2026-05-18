// Prompt builders for the DesAny LLM pipeline.
// Versioning policy: bump PROMPT_VERSION whenever a prompt is changed in a way
// that could shift outputs. Prompt hashes derived from these strings are logged
// upstream, so any change here should accompany a version bump.

export const PROMPT_VERSION = '2026-05-15.1';

const STYLE_RULES = [
  'Tone: professional, warm, locally rooted.',
  "Avoid generic AI-sounding phrases like 'unlock your potential' or 'elevate your experience'.",
  'Write like a human copywriter who knows the neighborhood, not a marketing bot.',
  'Use concrete nouns and short, declarative sentences. No filler.',
].join(' ');

const JSON_RULES = [
  'Return ONLY valid JSON, no markdown code fences, no commentary, no preamble.',
  'Do not wrap the response in ```json blocks. Output must start with `{` and end with `}`.',
  'Every string must be plain UTF-8; no smart quotes inside JSON keys.',
].join(' ');

export interface ReviewSummaryInput {
  reviews: string[];
}

export function buildReviewSummaryPrompt(reviews: string[]): { system: string; user: string } {
  const system = [
    'You are a small-business analyst summarizing customer reviews into structured data.',
    'You read between the lines: what services do customers mention, what tone do reviewers use, what colors fit the brand vibe?',
    STYLE_RULES,
    JSON_RULES,
    'Output schema (semantic description):',
    '- services: array of 3-8 short service names that customers actually mention (e.g., "haircuts", "beard trim", "kids cuts"). Plain lowercase nouns.',
    '- tone: a single short phrase describing the vibe (e.g., "friendly neighborhood", "upscale and quiet", "fast and reliable", "trendy urban").',
    '- palette: an object with three hex colors {primary, secondary, accent} chosen to fit the tone. Always start with `#`, six hex digits.',
  ].join('\n');

  const trimmed = reviews.slice(0, 10).map((r, i) => `Review ${i + 1}: ${r}`).join('\n');

  const example = {
    services: ['classic haircuts', 'beard trim', 'hot towel shave', 'kids cuts'],
    tone: 'friendly neighborhood barbershop',
    palette: { primary: '#1a1a1a', secondary: '#c9a96e', accent: '#f5f1ea' },
  };

  const exampleReviews = [
    'Best barber in town! Mike always knows exactly what I want and the hot towel shave is the highlight of my week.',
    'Took my son here for his first haircut. They were patient and kind. Will be back!',
    'Solid old-school cuts. The decor is classic, smells like aftershave and coffee. Five stars.',
  ].map((r, i) => `Review ${i + 1}: ${r}`).join('\n');

  const user = [
    'Example input:',
    exampleReviews,
    '',
    'Example output:',
    JSON.stringify(example),
    '',
    'Now do the same for these real reviews:',
    trimmed,
  ].join('\n');

  return { system, user };
}

export interface LandingContentPromptInput {
  businessName: string;
  category: string;
  city: string;
  phone?: string;
  email?: string;
  address?: string;
  topReviews?: Array<{ text: string; rating: number }>;
  servicesInferred?: string[];
  toneHint?: string;
}

export function buildLandingContentPrompt(input: LandingContentPromptInput): { system: string; user: string } {
  const system = [
    'You are a senior landing-page copywriter for local service businesses.',
    'You produce a complete LandingContent JSON object that will be rendered into a Next.js page.',
    STYLE_RULES,
    JSON_RULES,
    '',
    'Field-by-field description of the JSON you must return:',
    '- hero.headline: a single sentence, max ~10 words, that names the business value clearly. Example: "Classic cuts and clean fades in downtown Austin."',
    '- hero.subheadline: one supporting sentence, 12-20 words. Example: "Walk-ins welcome. Old-school barbering since 1998, right on South Congress."',
    '- services: an array of 3 to 6 items. Each item has {name, description, icon?}. `name` is a short noun (e.g. "Beard Trim"), `description` is 1-2 sentences, `icon` is an optional lucide-react icon name (e.g. "Scissors", "Coffee", "Sparkles").',
    '- testimonials: array of 2 to 4 items. Each is {text, author, rating} where rating is an integer 1-5. Use the supplied reviews when given; lightly tighten them but do NOT fabricate names if none provided — use plausible first-name + last-initial like "Maria K.".',
    '- about: 2-4 sentences describing the business in first person plural ("We have been..."). No bullet points, plain prose.',
    '- cta.text: imperative call-to-action button label (e.g. "Book a chair", "Call us now", "Get a free quote"). 2-4 words.',
    '- cta.action: one of "phone", "email", or "contact-form". Choose "phone" if phone is given and category is walk-in friendly, "email" if email is the better channel, otherwise "contact-form".',
    '- cta.target: phone number, email address, or the string "#contact" for contact-form.',
    '- contact: object with optional phone, email, address, mapsEmbedUrl. Echo what was provided; do not invent.',
    '- colors.primary, colors.secondary, colors.accent: hex strings starting with "#", 6 hex chars each.',
    '- styleVariant: exactly one of "modern", "elegant", or "bold". Pick based on category:',
    '    * Upscale / luxury / fine dining / law / wealth management → "elegant"',
    '    * Urban / young-adult / barbershop / streetwear / nightlife / fitness → "bold"',
    '    * Neutral / professional services / clinics / contractors / SaaS-adjacent → "modern"',
    '',
    'Determinism: prefer concrete details from the input over invented ones. If the same input is sent twice, your output should be nearly identical.',
  ].join('\n');

  const exampleInput: LandingContentPromptInput = {
    businessName: "Joe's Barbershop",
    category: 'barbershop',
    city: 'Austin',
    phone: '+1-512-555-0142',
    email: 'hello@joesbarber.com',
    address: '212 South Congress Ave, Austin, TX',
    topReviews: [
      { text: 'Best fade in town. Joe is a master.', rating: 5 },
      { text: 'Super friendly, great vibe. Always come back.', rating: 5 },
    ],
    servicesInferred: ['fades', 'beard trim', 'hot towel shave', 'kids cuts'],
    toneHint: 'friendly neighborhood barbershop',
  };

  const exampleOutput = {
    hero: {
      headline: 'Classic cuts and clean fades on South Congress.',
      subheadline: "Joe's has been the neighborhood barbershop for two decades. Walk in, sit down, leave looking sharp.",
    },
    services: [
      { name: 'Signature Fade', description: 'Skin, low, mid, or high — taper of your choice, blended by hand.', icon: 'Scissors' },
      { name: 'Beard Trim', description: 'Shape, line up, and condition. We use a straight razor for the edges.', icon: 'Scissors' },
      { name: 'Hot Towel Shave', description: 'Old-school straight-razor shave with steamed towels and balm.', icon: 'Sparkles' },
      { name: 'Kids Cuts', description: 'Patient cuts for first-timers. Lollipop included.', icon: 'Smile' },
    ],
    testimonials: [
      { text: 'Best fade in town. Joe is a master.', author: 'Marcus T.', rating: 5 },
      { text: 'Super friendly, great vibe. Always come back.', author: 'Diego R.', rating: 5 },
    ],
    about:
      "Joe's Barbershop has been cutting hair on South Congress since 2003. We are a family-run shop that takes pride in classic technique and good conversation. Whether you need a quick clean-up or a full hot-towel shave, we treat every chair like it is the only one in the room.",
    cta: { text: 'Call to book', action: 'phone', target: '+1-512-555-0142' },
    contact: {
      phone: '+1-512-555-0142',
      email: 'hello@joesbarber.com',
      address: '212 South Congress Ave, Austin, TX',
    },
    colors: { primary: '#1a1a1a', secondary: '#c9a96e', accent: '#f5f1ea' },
    styleVariant: 'bold',
  };

  const user = [
    'Example input:',
    JSON.stringify(exampleInput),
    '',
    'Example output:',
    JSON.stringify(exampleOutput),
    '',
    'Now produce the same shape of output for this real input:',
    JSON.stringify(input),
  ].join('\n');

  return { system, user };
}
