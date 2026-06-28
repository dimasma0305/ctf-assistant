/**
 * Central LLM model registry — the single source of truth for which DeepSeek
 * model each role uses. Previously these were string literals scattered across
 * 6+ files (chat, botState, userProfile, cron, taskFollowupCron, event), so a
 * model swap meant chasing every call site and risking drift between them.
 *
 * CACHE NOTE (read before changing `chat`): `chat` backs the main agentic chat
 * loop. Its (system_prompt + tools) prefix is ~25K tokens and leans on DeepSeek
 * prefix caching (~97% hit) to stay cheap. Each model has its OWN cache
 * namespace, so changing this value forces a one-time full-prefix cache-miss on
 * the first turn after deploy, then it warms back up. Don't churn it casually.
 */
export const MODELS = {
    /** Main user-facing agentic chat loop: native tool-calling + full persona. */
    chat: 'deepseek-v4-flash',
    /** Background / utility completions — state distill, profile distill, cron
     *  mabar drafts, task follow-up drafts, CTF event blurbs. Latency-tolerant,
     *  no tool-calling. */
    light: 'deepseek-v4-flash',
} as const;

export type ModelRole = keyof typeof MODELS;
