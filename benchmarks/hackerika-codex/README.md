# Isolated Codex benchmark

This suite freezes four synthetic, authorized capability probes: Luna hex execution, Luna image transcription plus computation, Luna public search with a primary-source read, and Daybreak Blue local ret2win. A case passes only when the exact expected flag is present in the structured result and in a successful command receipt. The source case also requires the worker to read an official cited page. The remote checker is never called.

It complements the existing Hackerika CTF benchmark. The legacy selected prompt scored 15/16 strict checks on its frozen research/calculator corpus; that score remains the regression baseline. These probes measure the new raw-file, shell, image, and ELF path and must not be presented as a matched before/after score.

Run sequentially with the private ChatGPT auth file available to the host controller environment:

```sh
AI_PROVIDER=chatgpt CHATGPT_AUTH_FILE=/path/to/private/credentials.json bun benchmark:codex --out benchmarks/hackerika-codex/FRESH_RUN
```
