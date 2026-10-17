# ChatGPT plan connection

Hackerika can use an eligible ChatGPT account through OpenAI's documented [open-source plan connection](https://developers.openai.com/siwc/token-sharing-open-source). The owner signs in and approves plan usage in OpenAI's browser flow. Actual account and model access must be verified by completed inference.

## Connect

Run the helper on a computer with Node.js 22 or later:

```bash
node hackerika-chatgpt-login.mjs login
```

The standalone helper is served at `https://api.assistant.1pc.tf/hackerika-chatgpt-login.mjs`. Its source is `scripts/chatgpt-auth.ts`. For a source checkout, use `bun scripts/chatgpt-auth.ts login`. The helper opens a loopback page with a **Continue with ChatGPT** link. Sign in and approve the requested permissions in OpenAI. Protected credentials are stored locally; never paste their contents in Discord or chat.

For a remote server, either forward its selected loopback port over SSH or transfer the protected credential file over SSH and run `import`. Keep the destination server's existing `host.json`; its stable host identifier belongs to that runtime. See OpenAI's [self-hosted VM guidance](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).

An optional temporary operator portal, `scripts/chatgpt-login-portal.ts`, allows browser interaction at a configured HTTPS domain without an SSH tunnel. The operator supplies a private file containing a random, single-use bootstrap secret, `CHATGPT_PORTAL_ORIGIN`, and `CHATGPT_AUTH_FILE`. Open the portal at `/hackerika-connect#BOOTSTRAP_SECRET`. The fragment is exchanged for a secure, HttpOnly, same-site cookie and removed from browser history. It is never included in proxy request URLs. The portal expires after 30 minutes and should run as a separate disposable container, with no host port publication and a writable private credential-directory mount.

The portal preserves the official `http://127.0.0.1:1455/auth/callback` redirect URI. After OpenAI returns the browser to that address, copy its full address into the portal's form; a failed local connection at this step is expected when using the remote portal. The form delivers the original callback over HTTPS. The server validates its exact loopback address, state, PKCE exchange, signed ID token, account identity, and plan permission. This manual callback delivery is an application convenience, not an additional redirect URI supported by OpenAI. It accepts neither passwords nor ChatGPT browser session cookies.

## Model and runtime settings

`models` lists the account's visible catalog. Login selects the lowest known Standard-credit model in that catalog from the helper's dated preference list. The first preference checked on 2026-10-17 is `gpt-6-luna`, with reasoning effort `low`. Unknown models require explicit selection; visibility alone does not establish entitlement. [Model access and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) remain account dependent.

```bash
bun scripts/chatgpt-auth.ts status --auth-file /private/chatgpt/credentials.json
bun scripts/chatgpt-auth.ts models --auth-file /private/chatgpt/credentials.json
bun scripts/chatgpt-auth.ts check --auth-file /private/chatgpt/credentials.json
```

`check` spends a small amount of approved plan usage to verify a completed response. Configure all roles only after this succeeds:

```dotenv
AI_PROVIDER=chatgpt
CHATGPT_MODEL=gpt-6-luna
CHATGPT_REASONING_EFFORT=low
CHATGPT_AUTH_FILE=/run/hackerika-chatgpt/credentials.json
AI_CHAT_MODEL=gpt-6-luna
AI_VISION_MODEL=gpt-6-luna
AI_RESEARCH_MODEL=gpt-6-luna
AI_JUDGE_MODEL=gpt-6-luna
```

Use the actual selected model if it differs. Explicit role overrides from an earlier provider take precedence, so change all four together. The light/background role uses `CHATGPT_MODEL`. Mount the entire private directory read-write, with directory mode `0700` and files `0600`, owned by the container user. Access and rotating refresh tokens are replaced atomically under a shared refresh lock.

For repeatable Compose deployments after login and inference verification, the optional `docker-compose.chatgpt.yml` supplies the private directory mount and sets every role from `CHATGPT_MODEL`:

```bash
docker compose -f docker-compose.yml -f docker-compose.chatgpt.yml up -d --build
```

The host directory must already exist. Keep its owner compatible with the image's `bun` user; the standard image currently uses UID/GID 1000.

Chat, image understanding, research planning, native web search, relationship/state extraction, scheduled drafts, and semantic benchmark judging use the shared provider. The adapter calls the documented Responses endpoint with `store: false`, streaming, and locally replayed tool history, including encrypted reasoning items. It requires a completed response, omits unsupported API parameters, and does not fall back to separately billed API-key requests. Native search requires a completed hosted search call and source annotations. Authentication or quota failures remain failures; ordinary unverified model text is not treated as retrieved evidence.

## Validation and recovery

Local tests cover OAuth validation and refresh, Responses transport, images and tool replay, native-search provenance, and the temporary portal's authorization boundaries. Fake transport checks do not establish live account access or model quality. Run fresh baseline/candidate cohorts and use the same model and rubric for both semantic judges after changing providers. Isolated image benchmarks require `--chatgpt-auth-dir PRIVATE_DIRECTORY`; credentials must never be baked into an image or benchmark result.

`logout` attempts remote revocation and removes local tokens while retaining registration identity. If remote revocation cannot be confirmed, disconnect Hackerika in ChatGPT settings. Runtime credentials, host identifiers, bootstrap links, and deployment environment files belong outside source control.
