# Isolated Codex CTF runner

The Discord bot submits bounded jobs over `/run/hackerika-codex/control.sock`. A trusted host controller owns Docker and the ChatGPT sign-in session. Every challenge runs in a fresh container with no network, no credentials, no Docker socket, a read-only root, dropped capabilities, and disposable `/workspace` and `/tmp` filesystems. Only a per-job inference/source Unix socket enters the worker. Containers share the host kernel; this is container isolation, not a VM boundary.

Build the pinned worker from the matching standalone Codex release:

```sh
bun scripts/codex-runner/build.ts /root/.codex/packages/standalone/releases/0.163.0-x86_64-unknown-linux-musl/bin
```

Install `controller.env.example` as `/etc/hackerika-codex-controller.env` with mode `0600`, install the service unit, and enable it. The bot container mounts only `/run/hackerika-codex` read-only through `docker-compose.codex.yml`; it never receives the Docker socket. Luna is the default economical solver. Daybreak Blue is selected only for allowlisted requestors and relevant security work, or an explicit allowlisted request.

The controller allows one active job globally, one outstanding job per channel, three submissions per user per hour, ten model calls per job, a five-minute deadline, and an eight-job queue. A job may retry once if a flag was printed only by a failed command. The gateway permits at most two public searches and eight guarded source reads per job, and rejects flags and credentials in search queries. During a job the worker can request up to six fresh Discord reads through the bot. The bot checks the requestor's and bot's current history access, restricts reads to the job's channel/thread, and returns bounded text, embed metadata, and at most one image's actual bytes per read. When explicitly requested, at most two Luna vision calls per job inspect those bytes; repeated identical images reuse an in-memory observation. The worker cannot access Discord credentials, other channels, or members' DMs. The controller keeps private job metadata for 24 hours and discards raw artifact bytes as soon as a job reaches a terminal state; live Discord read responses and image observations are not persisted. A restart marks interrupted work failed rather than spending the plan again.
