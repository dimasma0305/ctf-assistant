import OpenAI from "openai";
import { config } from "dotenv";

config();

const { OPENAI_API_KEY } = process.env;

/**
 * Shared OpenAI client instance configured with DeepSeek API
 */
export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: "https://api.deepseek.com"
});

/**
 * Check if OpenAI API key is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}
