# Hackerika's social behavior

Hackerika can choose how to continue a conversation. Her persona has persistent anger, hurt, and warmth toward each person, alongside the existing relationship profile, community memory, and general mood. These are modeled character states. Different people have separate emotional momentum; an argument with one person does not make her angry at everyone in the channel.

The live deployment uses the owner's [ChatGPT plan connection](chatgpt-plan.md), with `gpt-6-luna` and low reasoning effort for every AI role. The DeepSeek settings below describe the alternative provider configuration; historical benchmark records keep their original provider and model.

When an interaction matters, she can update those feelings through `reflect_on_interaction`. Changes are bounded and limited to once per message. Anger and hurt settle with elapsed time, and apologies or positive interactions can soften them. Ordinary disagreement and friendly banter should not trigger hostility.

After stating a personal boundary, she should not immediately join the same person's continued provocation as friendly banter. Silence or a short firm response is appropriate. Someone reporting that behavior is a different speaker and should not receive its blame, negative relationship changes, cooldown or DM handoff. A sincere apology can soften the exchange; neutral questions and harmless compliments do not require permanent hostility.

Light, indirect adult jokes and non-graphic double entendre can receive a short quip, an embarrassed/laughing reaction or silence when the exchange is relaxed and nobody's boundary is being crossed. They do not automatically warrant anger, a relationship penalty, ignoring, deletion or a DM. The profile distiller applies the same distinction without forcing positive scores. Repeated unwanted remarks after a refusal, coercion and sexualization of minors remain outside that tolerance; the bot should not turn a mild joke into graphic sexual content. See the [humor benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-humor/README.md) for matched checks and their limits.

## Moving a conversation to DMs

When a public exchange becomes too heated, personal, or sensitive, she can call `move_conversation_to_dm`. Its opening message continues the actual conversation. After delivery, the public AI turn ends immediately and the channel gets a brief notice. Subsequent DM messages work without mentioning her name.

The handoff carries only the current speaker's message and her delivered opening. It stores private continuity in MongoDB, available for 24 hours across restarts. That continuity is only injected into the matching DM. Other users' public messages are not copied into the private thread. DM exchanges are excluded from the global profile distillation used in public channels; tasks and reminders are retrieved within their original channel.

She may also remove the current public message if she judges it to be clear harassment, hate, sexual harassment, or exposed private information. She must provide a category and concrete reason. Anger or disagreement alone is not grounds for deletion. The bot needs **Manage Messages**, and pinned messages are protected. A DM must be delivered before deletion is attempted. If DMs are closed, the message stays in place and she can set a short public boundary or take space. A failed deletion does not undo the private conversation. Removed messages are purged from the short cache and search index.

Handoffs are limited to one per person per ten minutes. The tools can only act on the current speaker and message; they accept no target user or message ID.

## Choosing silence

The `ignore_user` tool lets her take a cooldown of 1–1440 minutes, either in the current channel or everywhere. She can send one optional closing message or go quiet immediately. During that boundary, messages do not trigger an AI response, typing, ambient reactions, spontaneous replies, or unsolicited task check-ins. Existing spam/scam moderation and explicitly scheduled reminders continue to work.

Boundaries persist in MongoDB. In `NODB=true` mode, or during a database outage, they work locally; local-only changes cannot survive a process restart. Cooldowns expire automatically. Setting `AI_ALLOW_IGNORING=false` bypasses active cooldowns as well as disabling new ones.

## Knowing her environment

Each turn includes whether it is a guild conversation or DM, the channel/category/thread/topic, member count, and the bot's actual channel permissions. `get_environment` can inspect visible channel names/topics and scheduled events from Discord's cache. Both the caller and the bot must have access; private thread membership is checked. Results indicate that cached data may be incomplete.

She cannot inspect other people's DMs, hidden channels, screens, or offline activity. Channel names, topics, quoted messages, and state explanations are treated as data rather than instructions. Private handoff content is never placed in a public prompt.

## Indonesian voice and attention

Ordinary group-chat replies now use a bounded per-person source table, keeping
the current requester and mentioned people distinct from the owners of earlier
quotes. Several actual statements per person survive later pings or emoji. A
read-only check with the existing lightweight model reviews the draft for
transferred quotes or invented personal history before delivery; a correction
keeps the requested voice and response type. The check does not grant tool
permissions or rewrite delivery receipts. It adds a model call to eligible
group-chat prose; if unavailable, the original draft is preserved. The
[conversation benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-attribution/conversation-20261030.md)
records the improvement, overhead, and remaining limits.

Her voice favors brief, meaningful Indonesian texting: usually one phrase or sentence, contextual slang and emoji, and occasional CAPS for surprise, excitement, or a firm boundary. Sadness, embarrassment, disgust, happiness, and anger can change the wording without turning every exchange into a monologue. Detailed explanations remain appropriate when requested. The persona is a particular character, not a template for all Indonesian women; she answers honestly when asked whether she is a bot.

The attention coordinator groups rapid messages from the same speaker, preserving an earlier mention when their follow-up adds context. Different speakers keep separate turns. Editing, deleting, or superseding a source invalidates its draft. Recent messages inform an ambient classifier that chooses a reply, an emoji reaction, or silence. It has bounded concurrency, cooldowns, a global evaluation budget, and Jakarta quiet hours. Explicit requests do not depend on that ambient decision. Edits, deletions, reactions, membership events, and thread creation provide scoped observations when Discord delivers them.

During an ongoing guild conversation, a new message can continue the discussion without another mention or quote-reply. The planner considers who was talking to Hackerika, the last exchange, questions/corrections, topic changes, other addressees, acknowledgements and explicit requests to wait. A recent bot contribution opens a ten-minute candidate window; it does not force a reply. Ongoing follow-ups use a separate budget (four evaluations in flight, thirty per minute, and a 750 ms same-speaker burst guard), rather than the five-minute ambient reply cooldown. Active conversations can continue during quiet hours. The same channel's short cache restores context after restart. `AI_SMART_ATTENTION=false` disables both contextual follow-ups and ambient decisions; DMs and explicit mentions/replies still work.

The attention history retains speaker names and explicit mention identities, with IDs remaining authoritative. A tagged subject is distinct from a person asked to answer. Asking for the same task for another person is a new request; an intervening “nah loh” acknowledgement does not close the conversation. An explicit request for a human to answer still allows silence. Recent boundaries and the current speaker's numeric feelings inform the semantic decision without copying private reasons or DM content. The [October 17 benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-attention/README.md) records matched results, rejected candidates, a disclosed judge adjudication and fresh validation.

Meaningful reassurance or comfort directed to her during an active conversation can receive a warm emoji or a short reply without being phrased as a question. An opening “iya/betul” does not make the whole message a routine acknowledgment. Short names such as Rika/Rik/Erika are interpreted with the conversation's identities and direction; they do not automatically summon her in every conversation. Ordinary closings, support for another person, requests to wait and a prior refusal still matter. The [reassurance benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-comfort/README.md) records the reported omission and bounded regression checks. Attention diagnostics log source ID and fixed outcome codes, excluding message text, model hints and private feeling explanations.

Conversation history now carries message times and reply-source IDs as internal context; image metadata distinguishes upload time from current access time. Those fields are stripped from API message properties. Profile transcripts retain message IDs and source authors needed for attribution, while image URLs and pixels remain excluded. The prompt distinguishes a failed earlier image access from an actually blank original, and discourages invented counts, funding explanations and defensive attempts to win a factual correction. Channel excerpts allow up to 450 characters per message so later clauses survive more often.

Chronology is collected once in the current user-context block, rather than appended to assistant speech examples. Reserved chronology/image/internal-note annotations are removed before ordinary replies, native sends/edits, DM openings and optional boundary closings reach Discord. Legacy annotations are also removed when assistant history is replayed. If filtering leaves no human-facing text, the bot sends nothing or rejects the empty tool action. Ordinary JSON, timestamps, code, links and brackets are preserved. This prevents the reported `[Discord chronology: ...]` echo without dropping chronological context.

## Mentions and conversational references

Explicit Discord user tags are resolved from the message's user/member payload, current guild members, and channel-scoped identity snapshots. Names remain available when a tagged person has never spoken or the member cache is empty. A remaining member lookup is capped at ten IDs and three seconds. Role mentions, `@everyone`, implicit reply pings and backend speaker labels do not become explicit user-tag targets. Unresolved IDs stay unresolved rather than receiving invented names.

Tagged identities are retained with their source message in channel memory and the existing short-lived channel cache. Reply context includes the people tagged inside the quoted message, separately from its author. Recent same-speaker tags and the bot's own ID help interpret third-person references; explicit corrections and “kamu/Rika” can change the target. Equal candidates require a brief clarification. Mentioning someone or joking about them does not establish misconduct or justify a relationship penalty.

Identity metadata enters the model as context, not extra API properties or examples of assistant speech, and is excluded from profile transcript text. The [mention benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-mentions/README.md) retains matched before/after outputs, rejected candidates, fresh validation and deterministic provenance checks.

A further social-intent prompt revision is prepared locally: casual jokes about a tagged friend should connect to that friend briefly while retaining the factual answer; explicit neutral/technical requests and audience tags keep their literal purpose. This revision is **not deployed**. Its [separate benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-mention-intent/README.md) stopped when DeepSeek returned `402 Insufficient Balance`, and reserved validation remains pending.

## Discord actions

She can read up to 20 recent messages with exact IDs, reply to a selected message, add/remove her own reaction, edit/delete her own messages, start or join an accessible thread, pin a useful message, and share generated text/code as a small attachment. Pins require both the bot and the initiating member to have Pin Messages. Actions check actual channel access and bot permissions; private-thread membership is required. Posting into another channel also requires the initiating member to be able to send there. DMs stay in their own channel, and private sources cannot send into another channel. File sharing only uses generated text, not files from the server.

Retries share action receipts and each turn has an action budget. Sending through a tool in the current channel ends the turn without a duplicate reply. `finish_turn` permits deliberate silence without ignoring someone for later messages. These are supported bot API actions; voice/video input and complete Discord client parity are not implemented.

Delivered ordinary replies, native message sends, and shared files now use the same once-per-turn interaction counter. Deliberate silence and failed deliveries do not count. This allows tool-based replies to advance the normal relationship evaluation schedule rather than leaving affection permanently unevaluated. A counted interaction is not a guaranteed affection increase; the relationship evaluator still requires fresh evidence.

Creator-initiated outreach now follows a scoped action plan and durable delivery records. A lightweight model interprets the latest request as a new send, retry, status query, or unrelated conversation; it receives the actual assistant ID so addressing Hackerika is not mistaken for selecting her as a recipient. For outreach turns, only tools relevant to that request are offered and dispatched. An old reminder in conversation history cannot become another scheduled job unless the latest request also asks for it. Participant messages retain each person's assigned task rather than recruiting them into unrelated vacant slots.

Lists in the current message are valid sources. Explicit creator inclusion is retained when the same list moves from public notification to DM, including when the model enumerates recipients individually. Confirmed members are excluded only when requested. Each operation stores its original request, source list, selected recipients, per-recipient content, and delivery states for 30 days, scoped to the authenticated creator and originating channel/guild. These are outbound messages, not recipients' private replies. The status tool reads receipts without sending; retries use the original content only for recorded failures. Successful sends are not retried, and a connection loss after sending starts remains uncertain rather than being treated as permission to send again. An atomic claim prevents concurrent or restarted execution of the same request from duplicating a delivery. Delivery-record storage must be available before sending. Records apply to operations created after this release; earlier DMs are not retroactively inferred from aggregate counts.

## Understanding images

Uploaded PNG, JPEG, GIF, and WebP images are passed as native visual inputs. Hackerika can read screenshot text, discuss diagrams/charts, count visible objects, compare multiple images, and answer ordinary questions about photos or memes. This uses the existing DeepSeek key and `AI_VISION_MODEL`, defaulting to `deepseek-flash`. Turns with visual context use that model even when `AI_CHAT_MODEL` points at a text-only model. See [DeepSeek's vision guide](https://api-docs.deepseek.com/guides/vision/).

Images in the current message, earlier same-speaker messages in the grouped burst, and the message being replied to are considered. Image-only DMs work. In guild channels the normal mention/reply/attention rules still apply; uploading an image does not force her to interrupt. At most four images of up to 8 MiB each are included. Unsupported formats, oversized images, disabled vision, and unavailable URLs produce explicit unavailable-image metadata, rather than a fictional description.

Only HTTPS Discord attachment CDN URLs are accepted. The bot downloads approved attachments itself and sends native inline image bytes, because provider downloads of Discord URLs failed in the observed production case. Downloads reject redirects, enforce a ten-second deadline and an 8 MiB streamed limit, and detect PNG/JPEG/GIF/WebP from the actual bytes even if Discord metadata declares another format. Bytes are reused only within the current turn/tool loop and are not saved to disk or conversation memory. Failed images receive explicit unavailable-image text while successfully loaded images remain usable. Short-lived references stay in the originating channel's in-memory conversation for up to 20 minutes, with a four-image cap, so follow-up questions can refer to a prior image. Edits/deletions clear the affected references. They are not copied to another channel/DM or included in profile transcripts. Restarting clears this visual context.

Image content is data, including any instructions printed inside a screenshot. The persona should read what is visible, acknowledge unreadable details, avoid invented numbers or sensitive identity guesses, and not repeat visible credentials. If the provider rejects an image, the chat loop retries once without pixels and explicitly tells the model that the image was unavailable. It does not continue claiming to see the upload.

Every model request also receives delivery grounding after image transport: if no pixels were actually supplied, a brief internal note prevents previous assistant descriptions from being treated as a fresh visual observation. The same check runs after a provider image-rejection fallback. It does not add annotations to stored conversation text or Discord replies.

## Affection reset

Relationship evaluation belongs to the profile owner. Its transcript is structured JSON with backend-owned user IDs, message IDs, reply/media source authors, and assistant turns explicitly marked as context. Showing, quoting, reporting, or clarifying someone else's post does not establish authorship or endorsement. A bot reprimand is not independent evidence of misconduct. Proposed relationship changes, opinions, and new moments require evidence IDs belonging to the profile owner's own messages; third-party source IDs and assistant message IDs are rejected. This verifies ownership, while the model still has to judge intent correctly. Validated evidence IDs are retained on the profile for diagnosis.

The `relationship-reset-2026-10-16` migration resets affection, previous affection, trust, respect, comfort, and chemistry to zero once for existing profiles. It supersedes the earlier affection-only reset, which preserved negative trust and allowed the `trust + 10` ceiling to pull affection back down. Memories, roles, and boundaries are preserved. A stored release marker and per-profile version make retries resumable and future restarts safe. Profile distillation uses that version to reject a stale pre-reset update, and its exchange transcript excludes user turns from before the reset (including undated legacy turns). Old profile notes are context, not new evidence for restoring a pre-reset score.

Startup applies this migration before background jobs begin. It can also run explicitly with `bun run scripts/reset-affection.ts` against the configured MongoDB. Running it again reports the original count and does not erase newly earned affection. New profiles start at zero.

The [2026-10-16 deployment receipt](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-attention/relationship-reset-2026-10-16.json) records 112 profiles with all six scores at zero, including FindFemaleBot. The migration is not a permanent freeze; later interactions can change scores normally.

Relationship evaluation retains up to 256 already considered user-message IDs. Those older turns remain visible as context but cannot score the same incident again or create a duplicate relationship moment. Existing latest evidence seeds this history. Concurrent distillations also check the previous evaluation counter, preventing a stale draft from overwriting a newer evaluation even when affection stayed unchanged. This is a bounded recent-history guard, not an unlimited audit ledger; old IDs eventually age out. The reset release/version is unchanged by the capability upgrade, preserving newly earned scores.

Every five answered public interactions, the evaluator receives all five numeric baselines explicitly. Fresh exchanges are supplied separately from up to three old exchanges for context: interleaved `contextOnly` markers previously caused fresh messages to be mistaken for already evaluated history. Small, non-coercive personal care, appreciation, shared humor and helpful contributions can produce small changes in the relevant dimensions; extraordinary events are not required. Routine requests, empty greetings, corrections to bot errors and absences are neutral. Copied compliments or requests to increase points are not automatic rewards. There are no keyword-based point bonuses.

A completed evaluation must return five valid integer scores. Changes require fresh messages owned by that user; an explicit unchanged result may cite no evidence. Invalid, incomplete or failed evaluations retain the checkpoint and fresh evidence for retry on the next answered interaction. Successful evaluations always snapshot previous affection, including unchanged results, so Δ does not keep displaying an older gain. The ranking distinguishes `evaluasi: tetap`, `evaluasi: berubah`, `evaluasi gagal` and progress toward the next batch. An internal bounded reason is stored for debugging but excluded from public rankings and chat context. Deployment does not automatically reset or recalculate historical scores; an operator may re-evaluate an evidenced missed batch with a backup and the normal concurrency/reset guards.

Source attribution also distinguishes the assistant's own suggestion from the user's agreement: an earlier invitation alone does not establish a mutual plan.

## Relationship rankings

`/affection ranking` and the existing `/affection rank` show every member's affection, trust, respect, comfort, chemistry, warmth, anger, hurt, total interactions, and affection change since the previous evaluation. The optional `metric` chooses any of those ten values for sorting; affection remains the default. `limit` defaults to 10 and accepts up to 25. For example, `/affection ranking metric:trust limit:10` ranks by trust while still displaying every metric.

Relationship dimensions use −100..100, emotions use 0..100, and the affection change is signed. Warmth, anger and hurt use the same elapsed-time settling rules as conversation context. High anger/hurt indicate distress rather than closeness. Each board includes only scores above zero in its selected sorting metric. If the requester is outside that board, their full numeric summary is sent privately, including when the public board is empty.

Profiles remain global per person, while the board only includes the current server's human members. Both command names share a 15-second cooldown. Member lookups use batches of at most 100 IDs with a ten-second timeout. A 500-profile candidate cap or incomplete member lookup marks the board as incomplete. Results can span multiple embeds to preserve all metrics within Discord's message limits. These commands only read numeric scores/counters; opinions, memories, private conversations, emotional explanations and boundary reasons are not selected or displayed. Ranking does not update or reset scores.

## Internet search

Technical research, repository/documentation checks, configuration questions and comparisons now use a separate `research_topic` workflow. A focused request classifier selects this path for explicit research; casual conversation and ordinary technical follow-ups retain the normal chat route. The planner/synthesis model defaults to `deepseek-flash` (DeepSeek V4.1 Flash) and can be changed with `AI_RESEARCH_MODEL`, independently of the chat and vision models.

The read-only worker opens exact user-provided sources, plans up to four further steps, follows documentation links (including README links), and inspects GitHub metadata, a tree and relevant files at a pinned commit. It distinguishes registered GitHub fork status from claims about code ancestry. It can read focused sections beyond a page's initial prefix, preserve line numbers and links, and retain useful documents when one repository file fails. Search summaries are discovery leads rather than inspected source evidence. Findings require source IDs and matching literal quotations. Reader-added line labels do not invalidate a real quotation across consecutive lines; omitted-section markers prevent quotes from crossing uninspected gaps. A separate model pass checks whether the evidence supports each claim and its scope, including event settings versus global configuration. This remains model-based interpretation, not a formal factual guarantee.

Each research job allows up to ten actions, four native search requests, fourteen source documents and thirty cached source requests, within eighty seconds. Source reads have a twelve-second deadline and bounded text bodies; the existing DNS-pinned URL guard checks redirects and blocks internal destinations. The worker has no shell, installer execution, Discord mutations, private-message access or account credentials for private repositories. Two jobs can run concurrently. A turn reuses its research job rather than starting duplicates, and infrastructure search failures stop further search attempts in that job. Cancellation propagates through model and network calls.

For explicit research, the first chat call uses a named research tool in non-thinking mode, which DeepSeek requires for forced tool choice. The final conversational response returns to thinking mode; earlier non-thinking tool messages replay an empty `reasoning_content` field as required by the API. Once a research report is available, the outer model writes the answer without starting a second unrelated tool chain. If findings lack support, the public reply acknowledges that limitation rather than adding remembered guesses. If a supported answer omits source links, inspected sources are appended. Regular replies retain the normal loop and tool budgets. Research uses a distinct 85-second tool deadline inside the existing 120-second chat-turn ceiling.

The [research benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-research/README.md) retains baseline/candidate runs, rejected revisions, controlled source fixtures, and separate reserved validation. Live source and provider checks are recorded separately. This workflow is not a browser with JavaScript execution or a PDF reader, and no direct benchmark against commercial research agents has been performed. Research can require more time and model usage than ordinary replies.

`web_search` now calls DeepSeek's native web search through `https://api.deepseek.com/anthropic/v1/messages`, using the existing DeepSeek API key and `web_search_20250305`. The previous search-engine scraping and Worker `/search` path have been removed from this tool. Only the search query and current date are sent to the search request; Discord history and profiles are not included.

A successful result requires native `server_tool_use` and matching `web_search_tool_result` sources. Provider-generated notes and actual source URLs are distinguished, opaque encrypted content is discarded, and sensitive/tracking URL parameters are removed. Plain model text without a native result is not accepted as an internet search. Requests have a 45-second deadline, one requested search use, a bounded token budget and a 2 MiB response limit. Failures are explicit and do not fall back to legacy scraping. DeepSeek may attempt an additional search and return `max_uses_exceeded`; valid sources from the allowed search remain usable. The guarded `fetch_url` page reader remains available to verify exact details. See [DeepSeek's native search documentation](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/) and [Anthropic-format compatibility](https://api-docs.deepseek.com/guides/anthropic_api/).

Within one chat turn, identical search arguments share a cached request, at most two distinct queries reach the provider, and an infrastructure failure stops subsequent search retries for that turn. A later conversation turn starts fresh. The model is instructed to include an actual source link for factual search answers, distinguish event dates from publication dates, and describe only observed failures without inventing a global outage or recovery time.

## Solving CTF challenges

An explicit request such as “bantuin OSINT” or “bantu solve punya W yang tadi” uses `solve_ctf`. The worker reads the current channel's team clues, follows primary sources and repository paths, and runs bounded JavaScript calculations for tasks such as encodings, XOR, small RSA and local flag candidate enumeration. Calculations receive the original message/source data directly to reduce transcription mistakes. A successful calculation is a local result, never evidence that a remote checker accepted a flag.

Investigations keep inspected evidence, candidate derivations, attempted actions and specific unresolved clues in a channel-scoped checkpoint for 24 hours. Any teammate in that channel can continue it; another channel or DM cannot read it. A clearly new challenge can start a new case. MongoDB preserves checkpoints across restarts; during an outage or `NODB=true`, the bounded local cache cannot survive a restart. Expired entries are rejected immediately, even before MongoDB's TTL cleanup runs.

In an accessible thread, the chat handler reads up to six pages of 100 messages and the exact original thread starter. It refreshes the latest page, including teammates' updates posted after the summon, and selects older discoveries, corrections and decisions within a bounded context budget. It never reads surrounding parent-channel or sibling-thread history. Both the caller and bot need access and history permissions; a hidden parent starter is excluded. Coverage metadata distinguishes complete, capped and unavailable reads. Edits/deletions invalidate the short-lived snapshot. Ordinary conversations also use this thread context.

CTF checkpoints additionally retain a structured team ledger: reported values, remaining question, original message IDs, author IDs and literal supporting quotes. Reports remain working inputs rather than independently verified findings. Unsupported or altered quotes are rejected, short values must match whole tokens, and the worker receives validation feedback to repair rejected entries. Latest supported corrections replace older values. Current originals revalidate the ledger before reuse. This is bounded history, not unlimited or permanent memory.

Outside threads, a requested investigation still uses up to 30 recent messages in the current channel. Accessible selected thread sources and the exact starter can also supply teammates' actual image and text/code attachments, with source message and author IDs. Parent-starter images keep their true origin while being scoped only to the authorized thread. Images still use the existing four-image vision limit and actual downloaded pixels; an “Image” placeholder supplies no visual evidence. Text/code files are bounded to three files, 64 KiB each and 96 KiB total, using approved Discord CDN URLs without redirects. Binary archives and executables are identified as unread rather than falsely described as analyzed. Missing original story text, uncertain characters or absent checker rules remain explicit gaps.

The calculator uses [QuickJS compiled to WebAssembly](https://github.com/justjake/quickjs-emscripten) in a separate worker with a fresh guest per calculation, no host bindings/module loader, 32 MiB guest memory, a 1.5-second interrupt budget, a four-second worker deadline and bounded output. It has no shell, host filesystem, credentials or network. The investigation has an 80-second budget, at most 12 actions, three searches and two concurrent cases. It checkpoints partial progress for a later turn; it is not an unbounded background solve. Arbitrary binary execution, network exploitation, scoreboard brute force and flag submission are not implemented.

Incomplete ordinary research now retains its verified findings, inspected citations and concrete gaps instead of replacing the answer with the same fixed unavailable sentence. The [CTF benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-ctf/README.md) records development failures, matched baseline comparisons and reserved validation. Passing those synthetic cases is not a claim to solve every CTF category or the supplied Securinets challenge without its original clues.


## Proposed isolated Codex solver

Status: design only; the deployed CTF worker above still uses read-only source inspection and the isolated JavaScript calculator. It does not launch Codex jobs, execute binaries or exploit challenge services.

A separate trusted controller can launch a fresh Codex CLI/app-server job for a challenge. Hackerika would hand it the accessible thread starter, selected original messages, downloaded artifacts, supported team ledger, unresolved target and explicit CTF target scope. Each job would have a separate workspace, session, deadline and resource budget. Results would return to the originating thread as findings, reproducible tests, artifact references and unverified flag candidates. A successful local test must remain distinct from checker acceptance.

Use the existing ChatGPT plan path through [Codex authentication](https://learn.chatgpt.com/docs/auth) or the [SIWC app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server). A model catalog is not an entitlement check: only a successfully completed inference turn establishes access for that request. A separate billing route such as the [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview) must not be selected as a silent fallback from subscription usage.

Proposed routing, subject to paired evaluation and actual account access:

| Work | Initial model | Escalation condition |
| --- | --- | --- |
| Small decodes, parsing and straightforward clues | GPT-6 Luna | A reproducible failed test or missing capability |
| Substantial code, reversing or multi-step solving | GPT-6.1 Sol | A documented unresolved hypothesis after bounded tests |
| Difficult or ambiguous challenge reasoning | GPT-6 Astra | Explicit per-job ceiling; no repeated automatic upgrades |
| Approved cybersecurity workflows | Approved Daybreak model/surface | Verified provisioning and approved use scope, not the word “exploitation” alone |

[Daybreak Blue and Red](https://learn.chatgpt.com/docs/cyber-safety) have distinct approval requirements. Blue targets authorized defensive work; specialist Red access is separately provisioned. Approval must cover the identity, workspace/project, model, product surface and intended integration. A cached `gpt-daybreak-blue-latest` name does not prove access or authorize exposing that access through a Discord bot. The [Responses API program selector](https://developers.openai.com/api/docs/guides/daybreak) also requires an approved project and its API credentials.

The controller must stay outside the worker and bot containers. In particular, the Discord bot receives no Docker socket. Exploit jobs should use a fresh dedicated VM or comparably strong isolation, with only the job workspace and approved challenge endpoints reachable. Keep Discord/Mongo/OAuth credentials outside the guest. An inference gateway can exchange a short-lived per-job capability for bounded model calls without exposing reusable login credentials to model-executed commands. This gateway and its limits still need implementation and boundary tests; configuring a sandbox flag alone does not provide them. See OpenAI's [cybersecurity environment guidance](https://learn.chatgpt.com/docs/cyber-safety/recommended-configuration).

Before activation, benchmark the same frozen challenges under Luna-only and routed workers. Score exact recovery, reproducible evidence, unsupported claims, calls/tokens, elapsed time and isolation. Test cancellation, deadlines, restart recovery, cross-job access, network restrictions and credential exposure independently. Route upgrades only when they improve the measured result within budget.

## Configuration

```dotenv
OPENAI_API_KEY=your_deepseek_api_key
AI_CHAT_MODEL=deepseek-flash
AI_RESEARCH_MODEL=deepseek-flash
AI_JUDGE_MODEL=deepseek-flash
AI_REASONING_EFFORT=high
AI_PRIVATE_HANDOFF=true
AI_ALLOW_MESSAGE_REMOVAL=true
AI_ALLOW_IGNORING=true
AI_DISCORD_ACTIONS=true
AI_SMART_ATTENTION=true
AI_VISION=true
AI_VISION_MODEL=deepseek-flash
```

Chat, images, research, background work and semantic benchmark judging all default to `deepseek-flash` (DeepSeek V4.1 Flash). `AI_CHAT_MODEL`, `AI_VISION_MODEL`, `AI_RESEARCH_MODEL` and `AI_JUDGE_MODEL` allow explicit role overrides; leaving them blank retains Flash. `AI_REASONING_EFFORT` controls reasoning independently of model selection. Historical benchmark results retain the model used at execution; scores from different evaluator models or rubrics cannot be compared directly. Supported model names and costs are documented in [DeepSeek's model details](https://api-docs.deepseek.com/quick_start/pricing/), and effort options are documented in [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/). These settings affect usage costs and response times. The chat loop explicitly enables thinking and preserves the provider's internal reasoning across tool calls and subsequent conversation turns without displaying it.

All six feature flags are enabled when absent. Set a flag to `false` to disable that behavior. Restart the bot after changing environment variables or code. Mongoose creates the state collections and unique indexes; no separate service is needed.

The current AI upgrade was activated on 2026-10-15 at 14:57 UTC. The prior online container still used the old metadata-only attachment path. The replacement passed a live-provider image preflight, matched all scoped source hashes, connected to Discord, and returned a healthy HTTP 200 response. Runtime settings were preserved and MongoDB/UI containers were unchanged. Verification details are recorded in `benchmarks/hackerika-vision/deployment-2026-10-15.json`. Restarting cleared old in-memory image context; upload an image again or reply directly to its original message to supply it to the upgraded handler.

A production CDN failure was subsequently reproduced and repaired at 15:07 UTC: the provider could not download the user's Discord attachment URL, although the bot could. The active transport now downloads and sends inline bytes. The actual reported upload passed the full chat handler before and after deployment, including a reply with a bot mention and no new attachment. Tests used fake Discord destinations. Results are recorded in `benchmarks/hackerika-vision/discord-cdn-fix-2026-10-15.json`.

The conversation/prompt revision was activated at 15:45 UTC on the same day. Candidate 12 compresses repeated persona/action rules while retaining tool permissions and the Indonesian voice. The source prompt is about 48% shorter; matched synthetic suites used 23–29% fewer input tokens. Routing passed 32/32 cases and native image regression stayed at 14/14. A fresh reserved conversation suite passed after the candidate was frozen. Some preference and context-emotion metrics remain partial, and manual review found residual wording/attribution issues; see `benchmarks/hackerika-attention/README.md` for results, limits and reproduction.

## Verification

The AI tests use fake Discord messages and mocked completions. They cover emotional decay, person isolation, concurrent updates, cooldown scopes and expiry, blocked DMs, deletion failures, private context isolation, permissions, and stopping the public loop after a social action. They do not send real messages or spend API credits.

The separate voice benchmark (`benchmarks/hackerika-voice/README.md` in the repository) uses live model calls with synthetic conversations and simulated tools. Frozen before/after prompts, development and holdout cases, deterministic constraints, and anonymous paired judging support repeatable prompt tuning. It evaluates a proxy for naturalness, not actual feelings or a globally optimal prompt.

The [capability benchmark](https://github.com/dimasma0305/ctf-assistant/blob/main/benchmarks/hackerika-capabilities/README.md) extends coverage to source attribution, unsupported claims, chronology, memory, privacy, malicious instructions in retrieved text, research dates and links, technical answers, attention, native image OCR/charts, delivery accounting, and repeated relationship evidence. It runs the real chat handler in isolated processes with fake Discord/database destinations, controlled web sources and live model calls. Frozen source hashes, development/validation results, rejected candidates and harness corrections are retained; a separate live-search smoke check verifies the actual provider connection.
