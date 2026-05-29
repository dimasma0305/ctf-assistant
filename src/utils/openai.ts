import OpenAI from "openai";
import { config } from "dotenv";

config();

const { OPENAI_API_KEY } = process.env;

/**
 * Shared OpenAI client instance configured with DeepSeek API
 */
let openai: OpenAI;
if (OPENAI_API_KEY) {
  openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: "https://api.deepseek.com",
      // Cap SDK auto-retries: a transient 429/5xx otherwise re-sends the full
      // ~11.5K-token chat prefix up to 3x (default maxRetries=2), invisibly
      // amplifying cost + rate-limit pressure exactly when the API is degraded.
      maxRetries: 1,
      // Per-request ceiling so one hung call can't silently eat a whole turn's
      // budget (the chat loop also has its own 120s umbrella AbortController).
      timeout: 120_000,
    });
}
export { openai };

/**
 * Check if OpenAI API key is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}
