const DISCORD_TOKEN_PATTERN =
  /(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.(?:[A-Za-z0-9_-]{10,}|\*{8,}))/g;

/**
 * Remove Discord credentials from diagnostic strings. discord.js sometimes
 * masks only the final token segment while leaving the first two segments in
 * debug output, so both complete and partially-masked token shapes are caught.
 */
export function redactDiscordSecrets(message: string, token?: string): string {
  let sanitized = String(message);

  if (token) {
    sanitized = sanitized.split(token).join("[REDACTED_DISCORD_TOKEN]");
  }

  sanitized = sanitized.replace(
    /(\bProvided token:\s*).*/gi,
    "$1[REDACTED_DISCORD_TOKEN]",
  );

  return sanitized.replace(DISCORD_TOKEN_PATTERN, "[REDACTED_DISCORD_TOKEN]");
}
