import { describe, expect, test } from "bun:test";
import { redactDiscordSecrets } from "./redactSecrets";

describe("redactDiscordSecrets()", () => {
  const token =
    "MTAwMDAwMDAwMDAwMDAwMDAwMA.ABC123.synthetic_secret_value_1234567890";

  test("removes a complete Discord token", () => {
    const output = redactDiscordSecrets(`Authorization: Bot ${token}`, token);
    expect(output).toBe("Authorization: Bot [REDACTED_DISCORD_TOKEN]");
    expect(output).not.toContain("ABC123");
    expect(output).not.toContain("synthetic_secret");
  });

  test("removes discord.js debug output with a masked final segment", () => {
    const output = redactDiscordSecrets(
      "Provided token: MTAwMDAwMDAwMDAwMDAwMDAwMA.ABC123.********************************",
    );
    expect(output).toBe("Provided token: [REDACTED_DISCORD_TOKEN]");
    expect(output).not.toContain("ABC123");
  });

  test("leaves ordinary gateway diagnostics unchanged", () => {
    const message = "[WS => Shard 0] Heartbeat acknowledged";
    expect(redactDiscordSecrets(message)).toBe(message);
  });
});
