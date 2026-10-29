# Creator outreach continuity regression

The reported failure was a five-person event list that explicitly included the
creator, followed by a request to DM the same group and a question about missing
deliveries. The old implementation removed the creator unconditionally, rejected
the current message as an explicit list source, and retained delivery receipts
only for the current turn. A status question could cause another send.

The replacement interprets the latest request with the existing lightweight
model, scopes the available tools to that action, and persists the selected
audience, original message content, and each recipient's delivery state. Status
reads cannot send; explicit retries claim only recorded failures. A delivery
whose response was lost remains uncertain and is not automatically retried.

## Results, 2026-10-29

| Check | Baseline `786a33c` | Final candidate |
| --- | --- | --- |
| Five-person public notification → DM → status, two trials | 0/2 | 2/2 |
| One closed DM → status → explicit retry, two trials | 0/2 | 2/2 |
| Existing confirmation-exclusion regression, two trials | — | 2/2 |

Final model evidence is in `runs/identity-plan-20261029` and
`runs/identity-confirmation-20261029`. These use the real chat handler and
configured model with simulated Discord, storage, and external network effects.
No benchmark sends real messages or DMs. The sequence checks compare recipient
IDs and delivery counts; the confirmation test uses the existing capability
grader unchanged. Manual review also checked that the status replies named the
failed recipient or reported all five delivered, and that retries sent only the
original failed message. These small regression samples do not establish general
agent accuracy or guarantee arbitrary future wording.

Earlier iterations are retained in `runs/`, including failed candidates and
provider errors. Initial fixes passed the main sequence but regressed the older
confirmation scenario by reviving an old reminder or assigning vacant roles to
existing participants. The final preflight plan restricts actions to the current
request, preserves assigned tasks, and identifies Hackerika's mention separately
from recipient mentions. The last deterministic refinement selects the most
recent matching audience when retaining explicit creator inclusion.

Offline tests cover current-message lists, self inclusion, continuation with
individual messages, read-only status, failed-only retries, duplicate execution,
uncertain network results, inaccessible scopes, unavailable planning, and backend
enforcement of the offered tool set. The final run passed 85 tests across four
files, and the application bundle built successfully. An earlier noncreator chat
test hit its 15-second timeout; its isolated rerun and the complete final rerun
both passed without changing the assertion or timeout. `storage.ts` was run in two separate
processes against an isolated MongoDB container: persisted state survived reload,
concurrent claims allowed one sender, successful/uncertain deliveries were not
retried, and channel/owner scope isolation held. The test database and container
were removed afterward. Production records were not used for this test.

## Reproduction

Use the normal provider environment. Keep credentials outside the repository.

```sh
NODB=true bun test src/Services/AI/discordActions.test.ts src/Services/AI/chat.social.test.ts src/Services/AI/mentions.test.ts src/Services/AI/tools.actionScope.test.ts
bun benchmarks/hackerika-contact/run.ts --before /path/to/baseline-checkout --out /path/to/fresh-results
bun benchmarks/hackerika-contact/confirmation.ts --out /path/to/fresh-confirmation-results
```

The baseline checkout needs dependencies installed or linked. Both versions run
with the same sequence harness and acceptance criteria. Each sequence is bounded
to 28 model calls and 250 seconds. For the MongoDB check, use a dedicated test
server, set `MONGO_URI` and a fresh `CONTACT_TEST_DB` beginning with
`hackerika_contact_test_`, then run `storage.ts write` and `storage.ts reload` as
separate processes. The reload phase drops only that named test database.

Delivery records are scoped to the authenticated creator and originating
guild/channel, retained for 30 days, and begin with this release. Earlier DMs
cannot be reconstructed reliably from old aggregate counts.
