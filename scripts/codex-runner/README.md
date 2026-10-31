# Isolated Codex worker

The Discord bot lets its chat model decide when to submit a CTF solve or multi-step investigation over `/run/hackerika-codex/control.sock`. A trusted host controller owns Docker and the ChatGPT sign-in session. Every job runs in a fresh container with no network, no credentials, no Docker socket, a read-only root, dropped capabilities, and disposable `/workspace` and `/tmp` filesystems. Only a per-job inference/source Unix socket enters the worker. Containers share the host kernel; this is container isolation, not a VM boundary.

Build the pinned worker from the matching standalone Codex release. The two executables are first retained under `/var/lib/hackerika-codex/runtime/`, outside the desktop app's release cleanup. Their SHA-256 hashes and CLI version must match `runtime.ts`. The controller checks the image before each job and rebuilds from these retained bytes if Docker has pruned it:

```sh
bun scripts/codex-runner/build.ts /root/.codex/packages/standalone/releases/0.166.0-x86_64-unknown-linux-musl/bin
# Later rebuilds do not need the app-managed release folder:
bun scripts/codex-runner/build.ts
```

The build uses a private temporary `DOCKER_CONFIG`, so Buildx can write its
activity files while the controller's systemd unit keeps `/root` read-only.
Startup and periodic checks repair a missing pinned image; concurrent checks
share one build. `/health` returns HTTP 503 until the worker image is ready,
and new submissions receive `worker_preparing` or `worker_image_unavailable`
before a job or hourly quota is consumed. Build failures retain a bounded
diagnostic tail in the controller journal. The image build has a ten-minute
limit. Accepted agent jobs have no application wall-clock deadline by default.

Keep `CODEX_WORKER_IMAGE` in the controller environment aligned with `WORKER_IMAGE`
when upgrading. Unknown custom image tags are never rebuilt as another version.
Runtime upgrades require a deliberate pin/hash update and real worker smoke;
there is no automatic switch to whichever CLI the desktop app currently uses.
If no retained copy and no matching seed remain, preparation fails explicitly.
When the bot uses inline research after worker preparation fails, its reply
labels that result as a temporary fallback rather than implying an irai run.

To verify public-profile research, run `bun benchmarks/hackerika-codex/profile-depth.ts --out FRESH_PATH`
with the same auth environment as the investigation benchmark below. It records
completed shell reads of both irai research references and inspected sources
beyond the supplied starting pages. It makes no Discord writes. A passing trace
proves execution and source traversal, not universal research accuracy; review
the resulting claims and attribution separately.

Native Codex subagents share the job's state and provider access. The
inference gateway admits three simultaneous model streams and queues up to
eight more instead of rejecting a child while its parent is streaming. It
translates local `agent_message` envelopes into attributed, untrusted text
supported by the subscription endpoint, preserving visible findings and tool
pairs. Opaque peer-state ciphertext is omitted; parent reasoning items are
unchanged. Unknown peer payload formats fail explicitly. Production jobs have
no application count quota for model calls, public searches, guarded source
reads, public downloads, image observations, or same-channel Discord reads.
Provider/account limits and process/resource safety boundaries still apply.

Provider HTTP and streaming errors retain only bounded error codes, parameter,
request ID and input type names in private job diagnostics. Raw provider error
messages and prompts are not logged. Replay a private failed job without
submitting or sending anything to Discord using the same auth environment:

```sh
bun benchmarks/hackerika-codex/replay-job.ts --job-file PRIVATE_JOB_JSON --out FRESH_PATH
```

This regression expects an investigation requesting native subagents. It checks
peer-message compatibility, irai reference reads, inspected sources, citations
and a completed answer. It records hashes and safe metrics,
not the original Discord packet or internal agent messages.

Completed answers retain their full text. Discord delivery splits them at
paragraph or word boundaries, keeps citation links together, and sends exports
with the final part. Successful parts are recognized on retry and use stable
Discord nonces; the controller is acknowledged only after every part is sent.
Repeated text-delivery errors back off instead of discarding the answer.

Run the real public-research regression with `AI_PROVIDER=chatgpt` and the
controller's `CHATGPT_AUTH_FILE` in the environment:

```sh
bun benchmarks/hackerika-codex/investigation.ts --out /tmp/hackerika-research-check
```

It uses Sol, the production worker and source gateway, and synthetic Discord
IDs without sending messages. Inspect the resulting answer as well as the
automated execution, source, citation and complete-delivery checks.

The build includes two reviewed skills from the pinned [irai bundle](skills/README.md):
`ctf-deep-solve` and `resourceful-solve`. Each job copies them into its disposable
workspace for Codex skill discovery. The worker still has only the tools and
access granted by this runner.

Install `controller.env.example` as `/etc/hackerika-codex-controller.env` with mode `0600`, install both the service and path units, and enable them. The service is wanted by Docker and restarts after clean or failed exits; the path unit starts it whenever `/run/docker.sock` becomes available, including after a Docker restart. The bot retries only failures that occurred before a Unix-socket connection was opened, so startup races recover without duplicating an accepted job. The bot container mounts only `/run/hackerika-codex` read-only through `docker-compose.codex.yml`; it never receives the Docker socket. A small semantic router selects the conversational manager per turn: GPT-5.6 Sol for actual cybersecurity, CTF, vulnerability reproduction and technical/profile OSINT; GPT-6.1 Sol for general conversation, research and agent work. That manager chooses the worker model with the same semantic policy. Daybreak Blue remains an allowlisted option for especially difficult authorized security work. `auto` falls back to GPT-6.1 Sol. The router selects a model, not a tool or action; no keyword directly dispatches work.

Jobs behave like shared agent sessions for their originating Discord channel/thread. `list_codex_jobs` and `codex_job_status` expose each job's objective, real controller state, model, statistics, sources and final results. Up to four independent responsibilities may coexist in one conversation. `steer_codex_job` queues a new same-channel user direction and injects it at the next inference boundary; the worker also polls steering before leaving a candidate final answer. A follow-up to a terminal job creates a continuation carrying its prior result and sources. Any member participating in the same public conversation may inspect or steer that conversation's job, while cancellation remains restricted to the job owner or the allowlisted creator. The worker can request current same-channel messages, embeds, images, and bounded prior bot files through the existing permission-checked bridge. This mirrors the documented [agent-session](https://developers.openai.com/api/docs/guides/agents-api/sessions) and [steering](https://developers.openai.com/api/docs/guides/steering) contracts—an idle follow-up continues work, an active follow-up steers it—without claiming access to ChatGPT's proprietary implementation.

Creative image requests use the trusted gateway's `/images/generate` endpoint. Configure a valid `OPENAI_IMAGE_API_KEY` in `/etc/hackerika-codex-controller.env` and restart the controller to enable it. The ChatGPT plan token used for text jobs cannot invoke image generation through its subscription-sharing route. The image key stays on the host and is never passed to a worker. The endpoint makes at most one image per job with `gpt-image-2.5-flare` at low quality by default (override with `OPENAI_IMAGE_MODEL`); it returns WebP bytes, which the worker saves under `/workspace/exports` for normal Discord attachment delivery. API image usage is billed separately. An investigation packet with `imageMode: "generative"` requires this real generator: the controller rejects it before scheduling when no image key is configured, and the worker cannot substitute a code drawing. The exported file must match the generator's image digest. For `imageMode: "auto"`, an unavailable generator may fall back to a stylized SVG comic or illustration rasterized with `rsvg-convert`; `"vector"` uses code drawing directly. The worker must describe vector output as code-drawn and verify the exported PNG instead of returning a prompt or claiming image generation succeeded.

The controller runs one job at a time globally, permits four outstanding responsibilities per channel by default, keeps an eight-job queue, and allows three new submissions per public user per hour as an anti-abuse boundary. The allowlisted creator defaults to unlimited submissions. Jobs have no application wall-clock deadline by default and remain explicitly cancellable. A CTF job may retry once if a flag was printed only by a failed command, and a transient inference disconnect resumes the same saved local session up to three consecutive recovery attempts. The worker includes a minimal PHP source-build toolchain and has a 1 GiB disposable workspace, 3 GiB memory limit, and two CPUs so source-level reproducers can be compiled and tested in isolation. It caps individual files at 256 MiB to prevent runaway crash logs; AddressSanitizer builds in this container need `-fno-pie -no-pie` to avoid spurious `DEADLYSIGNAL` output. Search queries still reject flags and credentials; every source/download still passes the public-URL and DNS-pinning guard. Static slide sites expose their script and slide-module links as source reads. The bot checks current member and bot history access before returning same-channel text, embed metadata, and image bytes. Repeated identical images reuse an in-memory observation. The worker cannot access Discord credentials, other channels, or members' DMs. The controller keeps private job metadata for 24 hours and discards raw input artifact bytes at terminal state; live Discord read responses and image observations are not persisted. At most two exported files (4 MiB each, 6 MiB combined) are stored until delivery, then deleted. A restart marks interrupted work failed rather than silently rerunning external actions.

Codex `exec` does not expose the interactive `/goal` command in this worker. The job supplies an evidence-checked completion contract and keeps its disposable Codex thread on disk for the job lifetime. Concrete, distinct `nextStep` values and live manager steering resume that same session until the objective is resolved or a concrete blocker remains. A failed continuation keeps the last usable answer. Session files disappear with the container; a terminal continuation receives only the prior public result/source checkpoint and reacquires any permitted Discord evidence. A verified absence of public self-disclosure is a legitimate stopping point for profile research, not an instruction to keep deanonymizing someone.
