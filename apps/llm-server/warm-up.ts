// Warm-up script for the DesAny LLM server.
// Runs three sample prompts against the OpenAI-compatible endpoint and prints
// per-request latency. Useful after a cold boot to pre-compile CUDA graphs.
//
// Usage:
//   tsx warm-up.ts
//   LLM_BASE_URL=http://llm-server:8000/v1 LLM_MODEL_NAME=qwen3-moe tsx warm-up.ts

import OpenAI from 'openai';

const baseURL = process.env.LLM_BASE_URL ?? 'http://localhost:8000/v1';
const model = process.env.LLM_MODEL_NAME ?? 'qwen3-moe';
const apiKey = process.env.LLM_API_KEY ?? 'sk-not-needed';

const client = new OpenAI({ baseURL, apiKey });

interface Prompt {
  label: string;
  user: string;
  maxTokens: number;
  responseFormat?: { type: 'json_object' };
}

const prompts: Prompt[] = [
  {
    label: 'hero headline',
    user: 'Write a one-sentence hero headline for a hair salon in Los Angeles. Return only the headline, no quotes.',
    maxTokens: 64,
  },
  {
    label: 'about section',
    user: 'Write a 3-sentence "About" section for a small family-owned bakery in Brooklyn that has been open since 1998. Friendly, warm tone.',
    maxTokens: 256,
  },
  {
    label: 'services JSON',
    user:
      'Return ONLY a JSON object with a single key "services" whose value is an array of exactly 5 service names a typical Los Angeles hair salon would offer. ' +
      'Example shape: {"services": ["...", "...", "...", "...", "..."]}. No prose, no markdown.',
    maxTokens: 256,
    responseFormat: { type: 'json_object' },
  },
];

async function runOne(p: Prompt): Promise<void> {
  const started = performance.now();
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: p.user }],
    max_tokens: p.maxTokens,
    temperature: 0.7,
    ...(p.responseFormat ? { response_format: p.responseFormat } : {}),
  });
  const ms = performance.now() - started;
  const content = completion.choices[0]?.message?.content?.trim() ?? '';
  const usage = completion.usage;

  console.log(`\n--- ${p.label} (${ms.toFixed(0)} ms) ---`);
  if (usage) {
    console.log(
      `tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`,
    );
  }
  console.log(content);
}

async function main(): Promise<void> {
  console.log(`Warming up ${baseURL} (model=${model})`);
  const overallStart = performance.now();
  for (const p of prompts) {
    try {
      await runOne(p);
    } catch (err) {
      console.error(`\n[warm-up] FAILED on "${p.label}":`, err);
      process.exitCode = 1;
      return;
    }
  }
  const totalMs = performance.now() - overallStart;
  console.log(`\nWarm-up complete in ${totalMs.toFixed(0)} ms.`);
}

await main();
