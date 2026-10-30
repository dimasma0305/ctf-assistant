/**
 * Central LLM model registry — the single source of truth for which DeepSeek
 * model each role uses. Previously these were string literals scattered across
 * 6+ files (chat, botState, userProfile, cron, taskFollowupCron, event), so a
 * model swap meant chasing every call site and risking drift between them.
 *
 * Changing the model can invalidate its prompt cache, so keep role defaults
 * together. Explicit environment overrides remain available for experiments.
 */
import { config } from 'dotenv';
config();
// GPT-6.1 Sol is the general ChatGPT-plan target. Deep security/OSINT work is
// delegated to the isolated runner where the manager chooses its model.
export const DEFAULT_MODEL = process.env.AI_PROVIDER === 'chatgpt'
    ? process.env.CHATGPT_MODEL?.trim() || 'gpt-6.1-sol' : 'deepseek-flash';

export const MODELS = {
    /** Main user-facing agentic chat loop: native tool-calling + full persona. */
    chat: process.env.AI_CHAT_MODEL?.trim() || DEFAULT_MODEL,
    /** Background / utility completions — state distill, profile distill, cron
     *  mabar drafts, task follow-up drafts, CTF event blurbs. Latency-tolerant,
     *  no tool-calling. */
    light: DEFAULT_MODEL,
    /** Native image input; independent from a text-only AI_CHAT_MODEL override. */
    vision: process.env.AI_VISION_MODEL?.trim() || DEFAULT_MODEL,
    /** Read-only research planning and evidence synthesis, separate from chat voice. */
    research: process.env.AI_RESEARCH_MODEL?.trim() || DEFAULT_MODEL,
    /** Semantic benchmark evaluator; historical run records retain their model. */
    judge: process.env.AI_JUDGE_MODEL?.trim() || DEFAULT_MODEL,
} as const;

export type ModelRole = keyof typeof MODELS;

// DeepSeek's tool-enabled thinking mode requires reasoning_content to be
// round-tripped. Effort is independently configurable from the model name.
export const CHAT_REASONING_EFFORT = ['low', 'high', 'max'].includes(process.env.AI_REASONING_EFFORT || '')
    ? process.env.AI_REASONING_EFFORT! : 'high';
